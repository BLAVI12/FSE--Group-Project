import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import categoryMapping from "../../supabase/seed-data/transaction-categories.json" with {
  type: "json",
};
import { classifyDescriptions } from "../../src/features/transactions/transaction-rules.js";
import {
  categorizeTransactions,
  getMonthRange,
  getPreviousMonthRange,
  summariseTransactions,
  type DashboardTransaction,
} from "../lib/data/dashboard.ts";
import { countsTowardTotals } from "../lib/data/totals.ts";

test("getMonthRange returns an exclusive range across a year boundary", () => {
  assert.deepEqual(getMonthRange(new Date("2026-12-15T12:00:00Z")), {
    start: "2026-12-01",
    end: "2027-01-01",
  });
});

test("getPreviousMonthRange returns the previous month across a year boundary", () => {
  assert.deepEqual(
    getPreviousMonthRange(new Date("2027-01-15T12:00:00Z")),
    {
      start: "2026-12-01",
      end: "2027-01-01",
    },
  );
});

test("the month follows the German calendar, not UTC", () => {
  // 00:30 on 1 November in Germany (winter time) is still 31 October in UTC.
  const novemberInGermany = new Date("2026-10-31T23:30:00Z");
  assert.deepEqual(getMonthRange(novemberInGermany), {
    start: "2026-11-01",
    end: "2026-12-01",
  });
  assert.deepEqual(getMonthRange(novemberInGermany, "UTC"), {
    start: "2026-10-01",
    end: "2026-11-01",
  });

  // 00:30 on 1 October in Germany (summer time) is still 30 September in UTC.
  assert.deepEqual(getMonthRange(new Date("2026-09-30T22:30:00Z")), {
    start: "2026-10-01",
    end: "2026-11-01",
  });

  // New Year's night: January in Germany, so the previous month is December.
  assert.deepEqual(getPreviousMonthRange(new Date("2026-12-31T23:30:00Z")), {
    start: "2026-12-01",
    end: "2027-01-01",
  });
});

test("summariseTransactions separates income and spending", () => {
  assert.deepEqual(
    summariseTransactions([
      { amount: 125000, is_transfer: false, status: "BOOKED" },
      { amount: -3499, is_transfer: false, status: "BOOKED" },
      { amount: -50000, is_transfer: true, status: "BOOKED" },
    ]),
    {
      income: 125000,
      spending: 3499,
      net: 121501,
    },
  );
});

test("pending transactions do not count toward monthly totals", () => {
  assert.deepEqual(
    summariseTransactions([
      { amount: 125000, is_transfer: false, status: "BOOKED" },
      { amount: -3499, is_transfer: false, status: "BOOKED" },
      { amount: -2000, is_transfer: false, status: "PENDING" },
      { amount: 9900, is_transfer: false, status: "PENDING" },
    ]),
    {
      income: 125000,
      spending: 3499,
      net: 121501,
    },
  );
});

test("only booked transactions that are not transfers count toward totals", () => {
  assert.equal(countsTowardTotals({ status: "BOOKED", is_transfer: false }), true);
  assert.equal(countsTowardTotals({ status: "PENDING", is_transfer: false }), false);
  assert.equal(countsTowardTotals({ status: "BOOKED", is_transfer: true }), false);
  assert.equal(countsTowardTotals({ status: "PENDING", is_transfer: true }), false);
});

test("categorizeTransactions uses the supplied mapping and preserves saved categories", () => {
  const transactions: DashboardTransaction[] = [
    {
      id: "shopping",
      amount: -1200,
      currency: "EUR",
      description: "Zalando",
      booked_date: "2026-10-01",
      status: "BOOKED",
      category: null,
      is_transfer: false,
    },
    {
      id: "dining",
      amount: -500,
      currency: "EUR",
      description: "Coffee Fellows",
      booked_date: "2026-10-02",
      status: "BOOKED",
      category: null,
      is_transfer: false,
    },
    {
      id: "unknown",
      amount: -250,
      currency: "EUR",
      description: "Unknown merchant",
      booked_date: "2026-10-03",
      status: "BOOKED",
      category: null,
      is_transfer: false,
    },
    {
      id: "manual",
      amount: -300,
      currency: "EUR",
      description: "Zalando",
      booked_date: "2026-10-04",
      status: "BOOKED",
      category: "Personal",
      is_transfer: false,
    },
  ];

  assert.deepEqual(
    categorizeTransactions(transactions).map((transaction) => transaction.category),
    ["Shopping", "Dining & Coffee", "Uncategorized", "Personal"],
  );
});

function uncategorized(description: string): DashboardTransaction {
  return {
    id: description,
    amount: -100,
    currency: "EUR",
    description,
    booked_date: "2026-10-01",
    status: "BOOKED",
    category: null,
    is_transfer: false,
  };
}

test("test bookings and descriptions matching several categories show as Uncategorized", () => {
  assert.deepEqual(
    categorizeTransactions(
      ["checkDestinationIBAN", "trxDEIBAN11 Rewe", "Miete Aldi", "Aldi Lidl", ""].map(uncategorized),
    ).map((transaction) => transaction.category),
    ["Uncategorized", "Uncategorized", "Uncategorized", "Groceries", "Uncategorized"],
  );
});

test("the dashboard shows each real Demo Bank transaction in the category the sync stores", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../../tests/fixtures/tink-demo-fixture.json", import.meta.url), "utf8"),
  ) as { transactions: { descriptions: { display?: string; original?: string } }[] };
  // The sync stores Tink's display text, falling back to the original.
  const descriptions = fixture.transactions.map(
    ({ descriptions }) => descriptions.display ?? descriptions.original ?? "",
  );

  const shown = categorizeTransactions(descriptions.map(uncategorized)).map(
    (transaction) => transaction.category,
  );
  const stored = descriptions.map(
    (description) =>
      classifyDescriptions(description, description, categoryMapping).categoryName ??
      "Uncategorized",
  );

  assert.equal(descriptions.length, 309);
  assert.deepEqual(shown, stored);
});
