import type { DashboardTransaction } from "./data/dashboard.ts";
import { countsTowardTotals } from "./data/totals.ts";

const chartColors = [
  "#047857",
  "#2563eb",
  "#b45309",
  "#be185d",
  "#6d28d9",
  "#be123c",
  "#0e7490",
  "#4d7c0f",
  "#c2410c",
  "#64748b",
];

export function getCategory(transaction: DashboardTransaction) {
  return transaction.category?.trim() || "Uncategorized";
}

// Assign once across both panels, starting with the current month so its
// existing colors remain the same when comparing with the previous month.
export function getSpendingCategoryColors(
  currentMonthTransactions: DashboardTransaction[],
  previousMonthTransactions: DashboardTransaction[],
): Map<string, string> {
  const colors = new Map<string, string>();

  for (const transaction of [
    ...currentMonthTransactions,
    ...previousMonthTransactions,
  ]) {
    if (transaction.amount >= 0 || !countsTowardTotals(transaction)) {
      continue;
    }

    const category = getCategory(transaction);
    if (!colors.has(category)) {
      colors.set(category, chartColors[colors.size % chartColors.length]);
    }
  }

  return colors;
}
