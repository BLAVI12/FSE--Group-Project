import assert from "node:assert/strict";
import test from "node:test";
import { planTransactions, type StoredTransaction, type TransactionValues } from "../../supabase/functions/_shared/tink/reconcile.ts";

const tx = (
  providerTransactionId: string,
  bookedDate: string,
  amount: number,
  description: string,
  status: "BOOKED" | "PENDING" = "BOOKED"
): TransactionValues => ({ providerTransactionId, amount, currency: "EUR", description, bookedDate, status, isTransfer: false });

let rows = 0;
const stored = (v: TransactionValues, occurrence = 1): StoredTransaction => ({ ...v, id: `row-${++rows}`, occurrence });

test("Demo Bank renumbering: the same transactions under shifted ids keep their rows", () => {
  // What we saw live on 3 Oct: new transactions arrive, Tink renumbers newest-first
  // (1001 = newest), and a pending Zalando hold books. Matching on Tink's id would
  // have turned the Zalando row into "Salary" and the E.on row into "Burger King".
  const zalando = stored(tx("1001", "2026-09-26", -9771, "Zalando", "PENDING"));
  const eon = stored(tx("1002", "2026-09-26", -3400, "E.on"));
  const starbucks = stored(tx("1003", "2026-09-25", -379, "Starbucks"));
  const plan = planTransactions([zalando, eon, starbucks], [
    tx("1001", "2026-10-02", 188703, "Salary"),
    tx("1002", "2026-10-01", -1799, "Burger King", "PENDING"),
    tx("1003", "2026-09-26", -9771, "Zalando"),
    tx("1004", "2026-09-26", -3400, "E.on"),
    tx("1005", "2026-09-25", -379, "Starbucks"),
  ]);

  assert.deepEqual(plan.inserts.map((t) => t.description), ["Salary", "Burger King"]);
  assert.deepEqual(plan.deletes, []);
  const update = new Map(plan.updates.map((u) => [u.id, u]));
  assert.equal(update.get(zalando.id)?.kind, "changed", "the hold booked: same row");
  assert.equal(update.get(zalando.id)?.values.status, "BOOKED");
  assert.equal(update.get(zalando.id)?.values.providerTransactionId, "1003");
  assert.equal(update.get(eon.id)?.kind, "renumbered");
  assert.equal(update.get(eon.id)?.values.providerTransactionId, "1004");
  assert.equal(update.get(starbucks.id)?.kind, "renumbered");
});

test("a repeat with identical data plans nothing", () => {
  const a = stored(tx("1001", "2026-10-02", 188703, "Salary"));
  const b = stored(tx("1002", "2026-10-01", -1799, "Burger King", "PENDING"));
  const plan = planTransactions([a, b], [tx("1001", "2026-10-02", 188703, "Salary"), tx("1002", "2026-10-01", -1799, "Burger King", "PENDING")]);
  assert.deepEqual(plan, { inserts: [], updates: [], deletes: [] });
});

test("pending rows Tink stops returning are deleted; booked history is kept", () => {
  // Demo Bank gives the vanished hold's id (1001) to an unrelated new
  // transaction. Sharing an id alone must not merge them.
  const vanishedHold = stored(tx("1001", "2026-10-01", -868, "Bar Celona", "PENDING"));
  const oldBooked = stored(tx("4466", "2020-06-01", -5000, "Miete"));
  const plan = planTransactions([vanishedHold, oldBooked], [tx("1001", "2026-10-02", 188703, "Salary")]);
  assert.deepEqual(plan.deletes, [vanishedHold.id]);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.updates.length, 0, "the old booked row is left as it is");
});

test("identical entries on the same day are told apart by occurrence", () => {
  const first = stored(tx("1005", "2026-10-01", -249, "Coffee Fellows"), 1);
  const second = stored(tx("1006", "2026-10-01", -249, "Coffee Fellows"), 2);
  // Renumbered, plus a third identical coffee the same day.
  const plan = planTransactions([first, second], [
    tx("1007", "2026-10-01", -249, "Coffee Fellows"),
    tx("1008", "2026-10-01", -249, "Coffee Fellows"),
    tx("1009", "2026-10-01", -249, "Coffee Fellows"),
  ]);
  assert.deepEqual(plan.updates.map((u) => u.kind), ["renumbered", "renumbered"]);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0]?.occurrence, 3, "takes the next free slot");
});

test("a bank with stable ids correcting a booked description updates the row in place", () => {
  const row = stored(tx("TX-77", "2026-09-01", -1000, "PAYPAL *ZALANDO"));
  const plan = planTransactions([row], [tx("TX-77", "2026-09-01", -1000, "Zalando")]);
  assert.equal(plan.inserts.length, 0, "no duplicate");
  assert.equal(plan.deletes.length, 0);
  assert.equal(plan.updates[0]?.id, row.id);
  assert.equal(plan.updates[0]?.kind, "changed");
  assert.equal(plan.updates[0]?.values.description, "Zalando");
});

test("a pending row that books with a new amount keeps its row when the bank keeps the id", () => {
  const hold = stored(tx("TX-90", "2026-10-01", -5000, "Jet Tankstelle", "PENDING"));
  const plan = planTransactions([hold], [tx("TX-90", "2026-10-02", -4273, "Jet Tankstelle")]);
  assert.equal(plan.updates[0]?.id, hold.id);
  assert.equal(plan.updates[0]?.values.amount, -4273);
  assert.deepEqual([plan.inserts.length, plan.deletes.length], [0, 0]);
});

test("the same transaction arriving through two consents is stored once", () => {
  const plan = planTransactions([], [tx("1001", "2026-09-28", -2999, "Edeka"), tx("1001", "2026-09-28", -2999, "Edeka")]);
  assert.equal(plan.inserts.length, 1);
});
