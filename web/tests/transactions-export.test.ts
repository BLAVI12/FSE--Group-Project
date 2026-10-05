import assert from "node:assert/strict";
import test from "node:test";
import type {
  SpendingTransaction,
  TransactionAccount,
} from "../lib/data/transactions.ts";
import {
  centsToDecimal,
  filterTransactionsForExport,
  transactionsToCsv,
} from "../lib/data/transactions-export.ts";

const accounts: TransactionAccount[] = [
  { id: "checking", name: "Checking, main", currency: "EUR" },
  { id: "savings", name: "Savings", currency: "EUR" },
];

function transaction(
  overrides: Partial<SpendingTransaction> = {},
): SpendingTransaction {
  return {
    id: "one",
    account_id: "checking",
    amount: -1234,
    currency: "EUR",
    description: 'Coffee "shop"',
    booked_date: "2026-10-01",
    status: "BOOKED",
    category: "Food",
    is_transfer: false,
    is_excluded: false,
    ...overrides,
  };
}

test("money is exported from integer cents without floating-point rounding", () => {
  assert.equal(centsToDecimal(-1234), "-12.34");
  assert.equal(centsToDecimal(5), "0.05");
  assert.equal(centsToDecimal(100), "1.00");
  assert.throws(() => centsToDecimal(1.5));
});

test("export filters match the transaction explorer selection", () => {
  const rows = [
    transaction(),
    transaction({ id: "two", category: null, amount: 5000 }),
    transaction({ id: "three", booked_date: "2026-09-30", account_id: "savings" }),
  ];
  assert.deepEqual(
    filterTransactionsForExport(rows, accounts, {
      currency: "EUR",
      accountId: "checking",
      category: "Food",
      from: "2026-10-01",
      to: "2026-11-01",
      entryType: "spending",
      search: "coffee",
    }).map((row) => row.id),
    ["one"],
  );
  assert.deepEqual(
    filterTransactionsForExport(rows, accounts, { category: null }).map(
      (row) => row.id,
    ),
    ["two"],
  );
});

test("CSV escapes descriptions and account names and includes an Excel-friendly BOM", () => {
  const csv = transactionsToCsv([transaction()], accounts);
  assert.ok(csv.startsWith("\uFEFFdate,description,category,account"));
  assert.match(csv, /"Coffee ""shop"""/);
  assert.match(csv, /"Checking, main"/);
  assert.match(csv, /-12\.34,EUR,false,false/);
});
