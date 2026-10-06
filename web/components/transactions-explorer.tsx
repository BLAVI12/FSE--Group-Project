"use client";

import { useMemo, useState } from "react";
import {
  aggregateSpendingMonths,
  countsTowardsTrend,
  getMonthKeys,
  type SpendingMonth,
  type SpendingTransaction,
  type TransactionAccount,
  type TransactionCategory,
} from "@/lib/data/transactions";

const ALL = "all";
const UNCAT = "Uncategorised";
const ROWS_PER_PAGE = 20;
const control =
  "w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20";

function money(cents: number, currency: string, compact = false) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
  }).format(cents / 100);
}

function monthLabel(month: string, short = false) {
  return new Intl.DateTimeFormat("en-GB", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function nextMonthStart(month: string) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function dateLabel(date: string | null) {
  return date
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${date}T00:00:00Z`))
    : "Not booked yet";
}

export function TransactionsExplorer({
  accounts,
  categories: availableCategories,
  transactions,
  now,
}: {
  accounts: TransactionAccount[];
  categories: TransactionCategory[];
  transactions: SpendingTransaction[];
  now: string;
}) {
  const currencies = [
    ...new Set([
      ...transactions.map((transaction) => transaction.currency),
      ...accounts.map((account) => account.currency),
    ]),
  ].sort();
  const [currency, setCurrency] = useState(
    currencies.includes("EUR") ? "EUR" : (currencies[0] ?? "EUR"),
  );
  const [period, setPeriod] = useState("6");
  const [account, setAccount] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entryType, setEntryType] = useState(ALL);
  const [page, setPage] = useState(1);
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<string, string | null>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");

  const effectiveTransactions = useMemo(
    () =>
      transactions.map((transaction) =>
        Object.prototype.hasOwnProperty.call(categoryOverrides, transaction.id)
          ? { ...transaction, category: categoryOverrides[transaction.id] ?? null }
          : transaction,
      ),
    [transactions, categoryOverrides],
  );

  function resetSelection() {
    setSelectedMonth(null);
    setPage(1);
  }

  const filterCategories = [
    ...new Set(
      effectiveTransactions.map((transaction) => transaction.category ?? UNCAT),
    ),
  ].sort();
  const accountNames = new Map(
    accounts.map((item) => [item.id, item.name ?? "Unnamed account"]),
  );
  const categoryIdByName = new Map(
    availableCategories.map((item) => [item.name, item.id]),
  );

  async function saveCategory(
    transaction: SpendingTransaction,
    categoryId: string | null,
  ) {
    if (savingId) return;
    const categoryName = categoryId
      ? availableCategories.find((item) => item.id === categoryId)?.name ?? null
      : null;
    const previous = Object.prototype.hasOwnProperty.call(
      categoryOverrides,
      transaction.id,
    )
      ? categoryOverrides[transaction.id] ?? null
      : transaction.category;

    setSavingId(transaction.id);
    setEditMessage("");
    setCategoryOverrides((current) => ({
      ...current,
      [transaction.id]: categoryName,
    }));
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      if (!response.ok) throw new Error("category update failed");
      setEditMessage("Category saved.");
    } catch {
      setCategoryOverrides((current) => ({
        ...current,
        [transaction.id]: previous,
      }));
      setEditMessage("Category could not be saved. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  const months = useMemo(() => {
    const current = new Date(now);
    let count = Number(period);
    if (period === ALL) {
      const dates = transactions
        .flatMap((transaction) =>
          transaction.booked_date ? [transaction.booked_date] : [],
        )
        .sort();
      const earliest = new Date(`${dates[0] ?? now.slice(0, 10)}T00:00:00Z`);
      count = Math.max(
        1,
        (current.getUTCFullYear() - earliest.getUTCFullYear()) * 12 +
          current.getUTCMonth() -
          earliest.getUTCMonth() +
          1,
      );
    }
    return getMonthKeys(current, count);
  }, [now, period, transactions]);

  const filtered = useMemo(
    () =>
      effectiveTransactions.filter(
        (transaction) =>
          transaction.currency === currency &&
          (account === ALL || transaction.account_id === account) &&
          (category === ALL || (transaction.category ?? UNCAT) === category),
      ),
    [effectiveTransactions, currency, account, category],
  );

  const summaries = useMemo(
    () => aggregateSpendingMonths(filtered, months, currency),
    [filtered, months, currency],
  );
  const activeSummaries = selectedMonth
    ? summaries.filter((item) => item.month === selectedMonth)
    : summaries;
  const spending = activeSummaries.reduce(
    (sum, item) => sum + item.spending,
    0,
  );
  const income = activeSummaries.reduce((sum, item) => sum + item.income, 0);
  const net = income - spending;
  const activeMonths = new Set(activeSummaries.map((item) => item.month));
  const rangeLabel = selectedMonth
    ? monthLabel(selectedMonth)
    : months.length === 1
      ? monthLabel(months[0])
      : `${monthLabel(months[0], true)} – ${monthLabel(months.at(-1)!, true)}`;

  const categorySpending = new Map<string, number>();
  for (const transaction of filtered) {
    if (
      !countsTowardsTrend(transaction) ||
      transaction.amount >= 0 ||
      !activeMonths.has(transaction.booked_date?.slice(0, 7) ?? "")
    )
      continue;
    const key = transaction.category ?? UNCAT;
    categorySpending.set(
      key,
      (categorySpending.get(key) ?? 0) - transaction.amount,
    );
  }
  const topCategories = [...categorySpending]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const query = search.trim().toLocaleLowerCase("en-GB");
  const rows = filtered.filter(
    (transaction) =>
      (transaction.booked_date
        ? activeMonths.has(transaction.booked_date.slice(0, 7))
        : !selectedMonth) &&
      (!query ||
        `${transaction.description} ${transaction.category ?? UNCAT} ${accountNames.get(transaction.account_id) ?? ""}`
          .toLocaleLowerCase("en-GB")
          .includes(query)) &&
      (entryType === ALL ||
        (entryType === "spending"
          ? transaction.amount < 0
          : transaction.amount > 0)),
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = rows.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE,
  );

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ currency });
    if (account !== ALL) params.set("account", account);
    if (category !== ALL)
      params.set("category", category === UNCAT ? "__uncategorised__" : category);
    if (entryType !== ALL) params.set("type", entryType);
    if (search.trim()) params.set("search", search.trim().slice(0, 100));
    if (!selectedMonth) params.set("undated", "include");
    const range = selectedMonth ? [selectedMonth] : months;
    if (range.length) {
      params.set("from", `${range[0]}-01`);
      params.set("to", nextMonthStart(range.at(-1)!));
    }
    return `/api/transactions/export?${params.toString()}`;
  }, [account, category, currency, entryType, months, search, selectedMonth]);

  if (transactions.length === 0) {
    return (
      <section className="mt-8 rounded-2xl border border-dashed border-white/20 p-10 text-center">
        <h2 className="text-xl font-semibold">
          Your spending story starts here
        </h2>
        <p className="mt-3 text-slate-400">
          Connect or sync your bank on the dashboard to see monthly spending and
          transactions.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <section
        aria-label="Trend filters"
        className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="space-y-2 text-sm text-slate-400">
          Period
          <select
            aria-label="Period"
            className={control}
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              resetSelection();
            }}
          >
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value={ALL}>All history</option>
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-400">
          Account
          <select
            aria-label="Account"
            className={control}
            value={account}
            onChange={(event) => {
              setAccount(event.target.value);
              resetSelection();
            }}
          >
            <option value={ALL}>All accounts</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name ?? "Unnamed account"}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-400">
          Category
          <select
            aria-label="Category"
            className={control}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              resetSelection();
            }}
          >
            <option value={ALL}>All categories</option>
            {filterCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-400">
          Currency
          <select
            aria-label="Currency"
            className={control}
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              resetSelection();
            }}
          >
            {(currencies.length ? currencies : ["EUR"]).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Showing <span className="font-medium text-white">{rangeLabel}</span>
        </p>
        {selectedMonth && (
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-emerald-400"
            onClick={resetSelection}
          >
            Show entire period ×
          </button>
        )}
      </div>

      <section
        aria-label="Period summary"
        className="grid gap-4 sm:grid-cols-3"
      >
        <Stat
          label="Total spending"
          value={money(spending, currency)}
          note="Booked expenses in this selection"
        />
        <Stat
          label="Total income"
          value={money(income, currency)}
          note="Booked income in this selection"
          positive
        />
        <Stat
          label="Net cash flow"
          value={money(net, currency)}
          note="Income minus spending"
          positive={net >= 0}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section
          className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
          aria-labelledby="spending-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="spending-heading" className="text-xl font-semibold">
                Spending trends
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Select a month to explore its transactions.
              </p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              {currency} · monthly
            </span>
          </div>
          <SpendingChart
            summaries={summaries}
            currency={currency}
            selectedMonth={selectedMonth}
            onSelect={(month) => {
              setSelectedMonth(month === selectedMonth ? null : month);
              setPage(1);
            }}
          />
          <p className="mt-2 text-xs text-slate-500 sm:hidden">
            Swipe the chart to see more months.
          </p>
          <p className="mt-5 text-xs leading-relaxed text-slate-400">
            The current month is month to date. Pending entries, internal
            transfers and excluded transactions do not count towards these
            totals.
          </p>
        </section>

        <section
          className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
          aria-labelledby="categories-heading"
        >
          <h2 id="categories-heading" className="text-xl font-semibold">
            Spending by category
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Largest categories in this selection.
          </p>
          <div className="mt-6 space-y-5">
            {topCategories.length ? (
              topCategories.map(([name, amount]) => (
                <div key={name}>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words text-slate-300">
                      {name}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {money(amount, currency)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{
                        width: `${spending ? (amount / spending) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs text-slate-500">
                    {spending ? Math.round((amount / spending) * 100) : 0}% of
                    spending
                  </p>
                </div>
              ))
            ) : (
              <p className="py-8 text-sm text-slate-400">
                No booked spending in this selection.
              </p>
            )}
          </div>
        </section>
      </div>

      <section
        className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5"
        aria-labelledby="transactions-heading"
      >
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="transactions-heading" className="text-xl font-semibold">
                Transactions
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {rangeLabel} · includes transfers and pending entries
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-400" aria-live="polite">
                {rows.length.toLocaleString("en-GB")} entries
              </span>
              <a
                href={exportHref}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
              >
                Export CSV
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Search transactions</span>
              <input
                type="search"
                className={control}
                placeholder="Search description, category or account…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="sm:w-44">
              <span className="sr-only">Entry type</span>
              <select
                aria-label="Entry type"
                className={control}
                value={entryType}
                onChange={(event) => {
                  setEntryType(event.target.value);
                  setPage(1);
                }}
              >
                <option value={ALL}>All entries</option>
                <option value="spending">Money out</option>
                <option value="income">Money in</option>
              </select>
            </label>
          </div>
          {editMessage && (
            <p className="text-sm text-slate-300" role="status" aria-live="polite">
              {editMessage}
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-175 text-left text-sm">
            <caption className="sr-only">
              Transactions for {rangeLabel} in {currency}
            </caption>
            <thead className="border-y border-white/10 bg-white/3 text-slate-400">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Transaction
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Date
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Category
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleRows.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-white/3">
                  <td className="max-w-80 px-5 py-4">
                    <p className="break-words font-medium">
                      {transaction.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {accountNames.get(transaction.account_id) ??
                        "Bank account"}
                      {transaction.is_transfer && " · Internal transfer"}
                      {transaction.is_excluded && " · Excluded"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-300">
                    {dateLabel(transaction.booked_date)}
                  </td>
                  <td className="min-w-48 px-5 py-4 text-slate-400">
                    <select
                      aria-label={`Category for ${transaction.description}`}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400 disabled:opacity-50"
                      value={categoryIdByName.get(transaction.category ?? "") ?? ""}
                      disabled={savingId === transaction.id}
                      onChange={(event) =>
                        void saveCategory(
                          transaction,
                          event.target.value || null,
                        )
                      }
                    >
                      <option value="">{UNCAT}</option>
                      {availableCategories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${transaction.status === "BOOKED" ? "bg-white/5 text-slate-300" : "bg-amber-400/10 text-amber-300"}`}
                    >
                      {transaction.status === "BOOKED"
                        ? "Booked"
                        : transaction.status === "PENDING"
                          ? "Pending"
                          : transaction.status}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums ${transaction.amount > 0 ? "text-emerald-300" : "text-white"}`}
                  >
                    {transaction.amount > 0 ? "+" : ""}
                    {money(transaction.amount, currency)}
                  </td>
                </tr>
              ))}
              {!visibleRows.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-slate-400"
                  >
                    No transactions match this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-sm text-slate-400">
          <p>
            {rows.length
              ? `${(currentPage - 1) * ROWS_PER_PAGE + 1}–${Math.min(currentPage * ROWS_PER_PAGE, rows.length)} of ${rows.length.toLocaleString("en-GB")}`
              : "0 entries"}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-2 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-2 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  positive = false,
}: {
  label: string;
  value: string;
  note: string;
  positive?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${positive ? "text-emerald-300" : "text-white"}`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
    </article>
  );
}

function SpendingChart({
  summaries,
  currency,
  selectedMonth,
  onSelect,
}: {
  summaries: SpendingMonth[];
  currency: string;
  selectedMonth: string | null;
  onSelect: (month: string) => void;
}) {
  const max = Math.max(100, ...summaries.map((item) => item.spending));
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const ceiling =
    [1, 2, 5, 10].find((step) => step * magnitude >= max)! * magnitude;
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div
      className="mt-4 overflow-x-auto pt-6 pb-2"
      tabIndex={0}
      aria-label="Monthly spending chart; scroll horizontally for more months"
    >
      <div
        className="relative pr-2 pl-16"
        style={{ minWidth: Math.max(480, summaries.length * 62 + 64) }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-56"
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute right-2 left-16 border-t border-white/10"
              style={{ top: `${(1 - tick) * 100}%` }}
            >
              <span className="absolute right-full -mt-2.5 pr-3 text-xs tabular-nums text-slate-500">
                {money(ceiling * tick, currency, true)}
              </span>
            </div>
          ))}
        </div>
        <div className="relative flex gap-2">
          {summaries.map((item) => {
            const height = (item.spending / ceiling) * 100;
            const active = selectedMonth === item.month;
            return (
              <button
                key={item.month}
                type="button"
                aria-pressed={active}
                aria-label={`${monthLabel(item.month)}: ${money(item.spending, currency)} spending. ${active ? "Show entire period" : "Show this month's transactions"}.`}
                title={`${monthLabel(item.month)} · ${money(item.spending, currency)}`}
                className={`group min-w-0 flex-1 rounded-lg pt-0 text-center outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${active ? "bg-emerald-400/10" : "hover:bg-white/3"}`}
                onClick={() => onSelect(item.month)}
              >
                <div className="relative h-56">
                  <span
                    className="absolute inset-x-0 text-[11px] font-medium tabular-nums text-slate-300"
                    style={{ bottom: `calc(${height}% + 7px)` }}
                  >
                    {money(item.spending, currency, true)}
                  </span>
                  <span
                    className={`absolute right-[18%] bottom-0 left-[18%] rounded-t-md transition-colors ${active ? "bg-emerald-200" : "bg-emerald-400/75 group-hover:bg-emerald-300"}`}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span
                  className={`mt-3 block pb-2 text-xs ${active ? "font-semibold text-emerald-300" : "text-slate-400"}`}
                >
                  {monthLabel(item.month, true)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
