import assert from "node:assert/strict";
import test from "node:test";
import { getSpendingCategoryColors } from "../lib/category-colors.ts";
import type { DashboardTransaction } from "../lib/data/dashboard.ts";

function spending(category: string | null): DashboardTransaction {
  return {
    id: category ?? "uncategorized",
    amount: -100,
    currency: "EUR",
    description: "Purchase",
    booked_date: "2026-10-01",
    status: "BOOKED",
    category,
    is_transfer: false,
    is_excluded: false,
  };
}

test("a category keeps the same color in both months despite different ordering", () => {
  const current = [spending("Housing"), spending("Shopping"), spending("Groceries")];
  const previous = [spending("Groceries"), spending("Housing"), spending("Insurance")];
  const colors = getSpendingCategoryColors(current, previous);

  assert.equal(colors.get("Housing"), "#047857");
  assert.equal(colors.get("Shopping"), "#2563eb");
  assert.equal(colors.get("Groceries"), "#b45309");
  assert.equal(colors.get("Insurance"), "#be185d");
  assert.equal(colors.size, 4);
});

test("income, pending, transfers and excluded transactions do not take colors", () => {
  const colors = getSpendingCategoryColors(
    [
      { ...spending("Income"), amount: 100 },
      { ...spending("Pending"), status: "PENDING" },
      { ...spending("Transfer"), is_transfer: true },
      { ...spending("Excluded"), is_excluded: true },
      spending("  Housing  "),
    ],
    [spending(null)],
  );

  assert.deepEqual([...colors.keys()], ["Housing", "Uncategorized"]);
});
