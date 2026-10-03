import assert from "node:assert/strict";
import test from "node:test";
import {
  getUtcMonthRange,
  summariseTransactions,
} from "../lib/data/dashboard.ts";

test("getUtcMonthRange returns an exclusive range across a year boundary", () => {
  assert.deepEqual(getUtcMonthRange(new Date("2026-12-15T12:00:00Z")), {
    start: "2026-12-01",
    end: "2027-01-01",
  });
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
