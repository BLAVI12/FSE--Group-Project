import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  accountType,
  isTransfer,
  toAccountValues,
  toCents,
  toTransactionValues,
  transactionStatus,
  type TinkAccount,
  type TinkTransaction,
} from "../../supabase/functions/_shared/tink/convert.ts";

// 309 real Tink Demo Bank transactions and both accounts (public sandbox data).
const fixture: { accounts: TinkAccount[]; transactions: TinkTransaction[] } = JSON.parse(
  readFileSync(new URL("../fixtures/tink-demo-fixture.json", import.meta.url), "utf8")
);

test("toCents respects Tink's varying scale", () => {
  assert.equal(toCents({ unscaledValue: "-340", scale: "1" }), -3400, "E.ON: -34.00 EUR, not -3.40");
  assert.equal(toCents({ unscaledValue: "1520003", scale: "2" }), 1520003);
  assert.equal(toCents({ unscaledValue: "5", scale: 0 }), 500);
  assert.equal(toCents({ unscaledValue: "1235", scale: "3" }), 124, "rounds half away from zero");
  assert.equal(toCents({ unscaledValue: "-1235", scale: "3" }), -124);
});

test("toCents refuses what it cannot convert exactly", () => {
  assert.equal(toCents(undefined), null);
  assert.equal(toCents({ unscaledValue: "12.5", scale: "2" }), null);
  assert.equal(toCents({ unscaledValue: "100", scale: "-1" }), null);
  assert.throws(() => toCents({ unscaledValue: "99999999999999999999", scale: "2" }), /safe integer/);
});

test("transfer matching handles German spelling variants", () => {
  assert.equal(isTransfer("Übertrag"), true);
  assert.equal(isTransfer("UEBERTRAG Girokonto"), true);
  assert.equal(isTransfer("Ubertrag intern"), true);
  assert.equal(isTransfer("Edeka"), false);
});

test("unknown account types map to OTHER", () => {
  assert.equal(accountType("CHECKING"), "CHECKING");
  assert.equal(accountType("INVESTMENT"), "OTHER");
});

test("only BOOKED and PENDING are trusted; anything else is provisional", () => {
  assert.deepEqual(transactionStatus("BOOKED"), { status: "BOOKED", known: true });
  assert.deepEqual(transactionStatus("PENDING"), { status: "PENDING", known: true });
  assert.deepEqual(transactionStatus("UNDEFINED"), { status: "PENDING", known: false });
  assert.deepEqual(transactionStatus(undefined), { status: "PENDING", known: false });
});

test("accounts convert with IBAN, type and both balances in cents", () => {
  const byName = new Map(fixture.accounts.map((a) => [a.name, toAccountValues(a)]));
  assert.deepEqual(
    { ...byName.get("Girokonto"), providerAccountId: undefined, lastRefreshed: undefined },
    {
      providerAccountId: undefined,
      iban: "DE27610893823721836839",
      name: "Girokonto",
      type: "CHECKING",
      balanceBooked: -178576, // overdrawn: the planner must cope with negative balances
      balanceAvailable: -189705,
      currency: "EUR",
      lastRefreshed: undefined,
    }
  );
  assert.equal(byName.get("Sparkonto")?.type, "SAVINGS");
  assert.equal(byName.get("Sparkonto")?.balanceBooked, 1520003);
});

test("a Tink transaction becomes a row", () => {
  const eon = fixture.transactions.find((t) => t.descriptions?.display === "E.on" && t.dates?.booked === "2026-09-26");
  assert.ok(eon);
  assert.deepEqual(toTransactionValues(eon), {
    values: {
      providerTransactionId: "1002",
      amount: -3400,
      currency: "EUR",
      description: "E.on",
      bookedDate: "2026-09-26",
      status: "BOOKED",
      isTransfer: false,
    },
    knownStatus: true,
  });
});

test("rows Tink sends incomplete are skipped, not guessed", () => {
  const base: TinkTransaction = {
    id: "x",
    accountId: "a",
    amount: { value: { unscaledValue: "-100", scale: "2" }, currencyCode: "EUR" },
    dates: { booked: "2026-10-01" },
    identifiers: { providerTransactionId: "1" },
    descriptions: { original: "EDEKA SAGT DANKE" },
  };
  assert.equal(
    toTransactionValues({ ...base, identifiers: {} })?.values.providerTransactionId,
    "tink:x",
  );
  assert.equal(toTransactionValues({ ...base, id: "", identifiers: {} }), null);
  assert.equal(toTransactionValues({ ...base, amount: undefined }), null);
  assert.equal(toTransactionValues({ ...base, dates: {} }), null);
  // No display text: the bank's original is used. No status: provisional.
  assert.deepEqual(toTransactionValues(base)?.values.description, "EDEKA SAGT DANKE");
  assert.deepEqual(toTransactionValues(base)?.knownStatus, false);
});

test("every fixture transaction converts exactly as in the committed seed", () => {
  // seed.sql was produced by a separate program (generate-seed.js) from the
  // same Tink dump. Two independent implementations must agree on every row.
  const seed = readFileSync(new URL("../../supabase/seed.sql", import.meta.url), "utf8");
  const row =
    /^\s*\('([0-9a-f]+)', '([^']*)', (-?\d+), '([A-Z]{3})', '((?:[^']|'')*)', '(\d{4}-\d{2}-\d{2})', '(BOOKED|PENDING)', (true|false), \d+\)/gm;
  const seeded = new Map<string, object>();
  for (const m of seed.matchAll(row)) {
    seeded.set(`${m[1]}|${m[2]}`, {
      providerTransactionId: m[2],
      amount: Number(m[3]),
      currency: m[4],
      description: m[5]!.replaceAll("''", "'"),
      bookedDate: m[6],
      status: m[7],
      isTransfer: m[8] === "true",
    });
  }
  assert.equal(seeded.size, 3534, "the seed parses completely");

  for (const t of fixture.transactions) {
    const converted = toTransactionValues(t);
    assert.ok(converted, `transaction ${t.id} converts`);
    assert.deepEqual(converted.values, seeded.get(`${t.accountId}|${converted.values.providerTransactionId}`), t.id);
  }
});

test("the fixture as a whole: both scales, both statuses, transfers on both accounts", () => {
  const rows = fixture.transactions.map((t) => toTransactionValues(t)!.values);
  const scales = new Set(fixture.transactions.map((t) => String(t.amount?.value?.scale)));
  assert.deepEqual([...scales].sort(), ["1", "2"]);
  assert.deepEqual(new Set(rows.map((r) => r.status)), new Set(["BOOKED", "PENDING"]));
  assert.ok(rows.every((r) => Number.isSafeInteger(r.amount)));

  const transferAccounts = new Set(
    fixture.transactions.filter((t) => toTransactionValues(t)!.values.isTransfer).map((t) => t.accountId)
  );
  assert.equal(transferAccounts.size, 2, "an Übertrag shows on both accounts");
  assert.ok(rows.some((r) => r.description === "Zinserträge"), "umlauts arrive intact");
});
