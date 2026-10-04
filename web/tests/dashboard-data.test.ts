import assert from "node:assert/strict";
import test from "node:test";
import {
  categorizeTransactions,
  getPreviousUtcMonthRange,
  getUtcMonthRange,
  summariseTransactions,
  type DashboardTransaction,
} from "../lib/data/dashboard.ts";

test("getUtcMonthRange returns an exclusive range across a year boundary", () => {
  assert.deepEqual(getUtcMonthRange(new Date("2026-12-15T12:00:00Z")), {
    start: "2026-12-01",
    end: "2027-01-01",
  });
});

test("getPreviousUtcMonthRange returns the previous month across a year boundary", () => {
  assert.deepEqual(
    getPreviousUtcMonthRange(new Date("2027-01-15T12:00:00Z")),
    {
      start: "2026-12-01",
      end: "2027-01-01",
    },
  );
});

test("summariseTransactions separates income and spending", () => {
  assert.deepEqual(
    summariseTransactions([
      { amount: 125000, is_transfer: false },
      { amount: -3499, is_transfer: false },
      { amount: -50000, is_transfer: true },
    ]),
    {
      income: 125000,
      spending: 3499,
      net: 121501,
    },
  );
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
