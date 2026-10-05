import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateSpendingMonths,
  getMonthKeys,
  loadTransactionsData,
  TransactionsDataError,
  type SpendingTransaction,
} from "../lib/data/transactions.ts";

function transaction(
  overrides: Partial<SpendingTransaction> = {},
): SpendingTransaction {
  return {
    id: "one",
    account_id: "checking",
    amount: -1250,
    currency: "EUR",
    description: "Groceries",
    booked_date: "2026-01-12",
    status: "BOOKED",
    category: "Food",
    is_transfer: false,
    is_excluded: false,
    ...overrides,
  };
}

test("monthly spending uses UTC calendar months and includes empty months across New Year", () => {
  const months = getMonthKeys(new Date("2026-02-01T00:30:00+02:00"), 3);
  assert.deepEqual(months, ["2025-11", "2025-12", "2026-01"]);
  assert.deepEqual(aggregateSpendingMonths([transaction()], months, "EUR"), [
    { month: "2025-11", income: 0, spending: 0, net: 0 },
    { month: "2025-12", income: 0, spending: 0, net: 0 },
    { month: "2026-01", income: 0, spending: 1250, net: -1250 },
  ]);
});

test("trends count booked income and expenses without transfers, exclusions or mixed currencies", () => {
  const entries = [
    transaction(),
    transaction({ amount: 100000 }),
    transaction({ amount: -50000, is_transfer: true }),
    transaction({ amount: -15000, is_excluded: true }),
    transaction({ amount: -7000, status: "PENDING" }),
    transaction({ amount: -100, currency: "GBP" }),
    transaction({ booked_date: null }),
    transaction({ booked_date: "2025-12-31" }),
  ];
  assert.deepEqual(aggregateSpendingMonths(entries, ["2026-01"], "EUR"), [
    { month: "2026-01", spending: 1250, income: 100000, net: 98750 },
  ]);
  assert.equal(
    aggregateSpendingMonths(entries, ["2026-01"], "GBP")[0].spending,
    100,
  );
});

test("aggregation rejects totals that would lose cent precision", () => {
  assert.throws(
    () =>
      aggregateSpendingMonths(
        [
          transaction({ amount: -Number.MAX_SAFE_INTEGER }),
          transaction({ amount: -1 }),
        ],
        ["2026-01"],
        "EUR",
      ),
    TransactionsDataError,
  );
});

function fakeSupabase(
  rows: Record<string, unknown>[],
  options: { cap?: number; failAt?: number; emptyAt?: number } = {},
) {
  const requests: {
    table: string;
    userId?: string;
    start?: number;
    end?: number;
    orders: string[];
  }[] = [];
  const client = {
    from(table: string) {
      const request: (typeof requests)[number] = { table, orders: [] };
      requests.push(request);
      let count = false;
      const query = {
        select(_fields: string, opts?: { count?: string }) {
          count = opts?.count === "exact";
          return query;
        },
        eq(field: string, value: string) {
          assert.equal(field, "user_id");
          request.userId = value;
          return query;
        },
        order(field: string) {
          request.orders.push(field);
          return query;
        },
        async range(start: number, end: number) {
          request.start = start;
          request.end = end;
          if (options.failAt === start)
            return {
              data: null,
              error: { message: "Database unavailable" },
              count: null,
            };
          return {
            data:
              options.emptyAt === start
                ? []
                : rows.slice(
                    start,
                    Math.min(end + 1, start + (options.cap ?? 1000)),
                  ),
            error: null,
            count: count ? rows.length : null,
          };
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({
            data:
              table === "categories"
                ? [{ id: "food", name: "Food", user_id: null }]
                : [{ id: "checking", name: "Checking", currency: "EUR" }],
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, requests };
}

test("loads every own-user transaction past Supabase's row cap, including smaller configured caps", async () => {
  const rows = Array.from({ length: 2401 }, (_, id) => ({
    ...transaction({ id: String(id) }),
    amount: "-1250",
  }));
  const { client, requests } = fakeSupabase(rows, { cap: 500 });
  const result = await loadTransactionsData(client, "signed-in-user");
  assert.equal(result.transactions.length, 2401);
  assert.equal(result.transactions.at(-1)?.id, "2400");
  assert.equal(result.transactions[0].amount, -1250);
  assert.equal(
    aggregateSpendingMonths(result.transactions, ["2026-01"], "EUR")[0]
      .spending,
    2401 * 1250,
  );
  assert.ok(
    requests
      .filter((request) => request.table !== "categories")
      .every((request) => request.userId === "signed-in-user"),
  );
  assert.deepEqual(result.categories, [
    { id: "food", name: "Food", user_id: null },
  ]);
  assert.deepEqual(
    requests
      .filter((request) => request.table === "transactions")
      .map((request) => request.start),
    [0, 500, 1000, 1500, 2000],
  );
  assert.ok(
    requests
      .filter((request) => request.table === "transactions")
      .every((request) => request.orders.join(",") === "booked_date,id"),
  );
});

test("a later-page failure must not present incomplete data as a complete spending trend", async () => {
  const rows = Array.from({ length: 1001 }, (_, id) => ({
    ...transaction({ id: String(id) }),
  }));
  await assert.rejects(
    loadTransactionsData(fakeSupabase(rows, { failAt: 1000 }).client, "user"),
    TransactionsDataError,
  );
  await assert.rejects(
    loadTransactionsData(fakeSupabase(rows, { emptyAt: 1000 }).client, "user"),
    TransactionsDataError,
  );
});

test("loader rejects malformed amounts and amounts outside safe integer precision", async () => {
  for (const amount of ["1.25", "9007199254740992", null]) {
    await assert.rejects(
      loadTransactionsData(
        fakeSupabase([{ ...transaction(), amount }]).client,
        "user",
      ),
      TransactionsDataError,
    );
  }
});
