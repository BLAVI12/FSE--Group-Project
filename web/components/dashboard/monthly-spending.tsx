"use client";

import { useState, type KeyboardEvent } from "react";
import type { DashboardTransaction } from "@/lib/data/dashboard";
import { countsTowardTotals } from "@/lib/data/totals";

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

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function getCategory(transaction: DashboardTransaction) {
  return transaction.category?.trim() || "Uncategorised";
}

function MonthlySpendingPanel({
  monthLabel,
  transactions,
}: {
  monthLabel: string;
  transactions: DashboardTransaction[];
}) {
  const spendingTransactions = transactions.filter(
    (transaction) => transaction.amount < 0 && countsTowardTotals(transaction),
  );
  const totals = new Map<string, number>();

  for (const transaction of spendingTransactions) {
    const category = getCategory(transaction);
    totals.set(category, (totals.get(category) ?? 0) + Math.abs(transaction.amount));
  }

  const categories = [...totals.entries()]
    .map(([name, amount], index) => ({
      name,
      amount,
      color: chartColors[index % chartColors.length],
    }))
    .sort((first, second) => second.amount - first.amount);
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const selectedTransactions = spendingTransactions.filter(
    (transaction) =>
      selectedCategory !== null && getCategory(transaction) === selectedCategory,
  );
  const currency = spendingTransactions[0]?.currency ?? "EUR";
  const circumference = 2 * Math.PI * 36;
  const segments = categories.reduce<{
    items: Array<(typeof categories)[number] & { length: number; offset: number }>;
    fractionOffset: number;
  }>(
    (result, category) => {
      const fraction = category.amount / total;
      return {
        items: [
          ...result.items,
          {
            ...category,
            length: circumference * fraction,
            offset: circumference * result.fractionOffset,
          },
        ],
        fractionOffset: result.fractionOffset + fraction,
      };
    },
    { items: [], fractionOffset: 0 },
  ).items;
  const selectCategory = (name: string) =>
    setSelectedCategory((selected) => (selected === name ? null : name));
  const handleSegmentKeyDown = (
    event: KeyboardEvent<SVGCircleElement>,
    name: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectCategory(name);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h3 className="text-lg font-semibold">{monthLabel}</h3>
        <p className="mt-1 text-sm text-slate-600">Spending by category</p>
      </div>

      {categories.length > 0 ? (
        <>
          <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(150px,0.8fr)_1.2fr] sm:items-center">
            <div className="relative mx-auto aspect-square w-40">
              <svg
                aria-label={`${monthLabel} spending by category. Select a slice to see its transactions.`}
                className="h-full w-full overflow-visible"
                role="group"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  fill="none"
                  r="36"
                  stroke="#e2e8f0"
                  strokeWidth="24"
                />
                <g transform="rotate(-90 50 50)">
                  {segments.map((segment) => (
                    <circle
                      aria-label={`${segment.name}, ${formatMoney(segment.amount, currency)}. Select to see ${monthLabel} transactions.`}
                      aria-pressed={selectedCategory === segment.name}
                      className="cursor-pointer outline-none focus-visible:stroke-slate-900"
                      cx="50"
                      cy="50"
                      fill="none"
                      key={segment.name}
                      onClick={() => selectCategory(segment.name)}
                      onKeyDown={(event) =>
                        handleSegmentKeyDown(event, segment.name)
                      }
                      r="36"
                      role="button"
                      stroke={segment.color}
                      strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                      strokeDashoffset={-segment.offset}
                      strokeWidth={selectedCategory === segment.name ? "27" : "24"}
                      tabIndex={0}
                    />
                  ))}
                </g>
              </svg>
              <div               className="pointer-events-none absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white text-center">
                <span className="text-xs text-slate-500">Total spent</span>
                <span className="mt-1 text-lg font-bold">
                  {formatMoney(total, currency)}
                </span>
              </div>
            </div>

            <ul className="space-y-2">
              {categories.map((category) => (
                <li key={category.name}>
                  <button
                    aria-pressed={selectedCategory === category.name}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                      selectedCategory === category.name
                        ? "bg-emerald-50 text-emerald-950"
                        : "bg-transparent"
                    }`}
                    onClick={() => selectCategory(category.name)}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="truncate">{category.name}</span>
                    </span>
                    <span className="shrink-0 text-slate-600">
                      {formatMoney(category.amount, currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selectedCategory ? (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-semibold">{selectedCategory} transactions</h4>
                <span className="text-sm text-slate-500">
                  {selectedTransactions.length} in {monthLabel}
                </span>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {selectedTransactions.map((transaction) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm"
                    key={transaction.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{transaction.description}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(transaction.booked_date)} · {transaction.status}
                      </p>
                    </div>
                    <span
                      className={`font-semibold ${
                        transaction.amount > 0 ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {transaction.amount > 0 ? "+" : transaction.amount < 0 ? "-" : ""}
                      {formatMoney(Math.abs(transaction.amount), transaction.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-500">
              Select a category to see its transactions for {monthLabel}.
            </p>
          )}
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No spending recorded for {monthLabel}.
        </div>
      )}
    </article>
  );
}

export function MonthlySpending({
  currentMonthLabel,
  previousMonthLabel,
  currentMonthTransactions,
  previousMonthTransactions,
}: {
  currentMonthLabel: string;
  previousMonthLabel: string;
  currentMonthTransactions: DashboardTransaction[];
  previousMonthTransactions: DashboardTransaction[];
}) {
  return (
    <section className="mt-10">
      <div>
        <h2 className="text-2xl font-bold">Monthly spending</h2>
        <p className="mt-1 text-sm text-slate-600">
          Compare this month with last month. Select a category to see its
          transactions.
        </p>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <MonthlySpendingPanel
          monthLabel={currentMonthLabel}
          transactions={currentMonthTransactions}
        />
        <MonthlySpendingPanel
          monthLabel={previousMonthLabel}
          transactions={previousMonthTransactions}
        />
      </div>
    </section>
  );
}
