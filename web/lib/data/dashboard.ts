import type { SupabaseClient } from "@supabase/supabase-js";
import categoryMapping from "../../../supabase/seed-data/transaction-categories.json" with {
  type: "json",
};
import { classifyDescriptions } from "../../../src/features/transactions/transaction-rules.js";
import { APP_TIME_ZONE } from "../time.ts";
import { countsTowardTotals } from "./totals.ts";

export type DashboardAccount = {
  id: string;
  name: string | null;
  type: string | null;
  balance_booked: number | null;
  balance_available: number | null;
  currency: string;
  last_refreshed: string | null;
};

export type DashboardTransaction = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  booked_date: string | null;
  status: string;
  category: string | null;
  is_transfer: boolean;
};

type TransactionAmount = Pick<
  DashboardTransaction,
  "amount" | "is_transfer" | "status"
>;

export type MonthlySummary = {
  income: number;
  spending: number;
  net: number;
};

export type DashboardData = {
  accounts: DashboardAccount[];
  recentTransactions: DashboardTransaction[];
  transactionCount: number;
  monthlySummary: MonthlySummary;
  currentMonthTransactions: DashboardTransaction[];
  previousMonthTransactions: DashboardTransaction[];
  monthStart: string;
  previousMonthStart: string;
};

export class DashboardDataError extends Error {
  constructor() {
    super("Dashboard data could not be loaded.");
    this.name = "DashboardDataError";
  }
}

// Booking dates are calendar days in Germany, where the bank and the users
// are, while the server runs on UTC. "This month" is therefore decided on the
// German calendar: at 00:30 on 1 November in Germany it is already November,
// although UTC still says 31 October.
/** Year and month (0-11) of an instant on the calendar of `timeZone`. */
function calendarMonth(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);

  return { year: part("year"), month: part("month") - 1 };
}

/** A month as booking dates: from its first day up to the next month's first. */
function monthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10),
  };
}

export function getMonthRange(date: Date, timeZone = APP_TIME_ZONE) {
  const { year, month } = calendarMonth(date, timeZone);
  return monthRange(year, month);
}

export function getPreviousMonthRange(date: Date, timeZone = APP_TIME_ZONE) {
  const { year, month } = calendarMonth(date, timeZone);
  return monthRange(year, month - 1);
}

export function summariseTransactions(
  transactions: TransactionAmount[],
): MonthlySummary {
  return transactions.reduce<MonthlySummary>(
    (summary, transaction) => {
      if (!countsTowardTotals(transaction)) {
        return summary;
      }

      if (transaction.amount >= 0) {
        summary.income += transaction.amount;
      } else {
        summary.spending += Math.abs(transaction.amount);
      }

      summary.net += transaction.amount;
      return summary;
    },
    { income: 0, spending: 0, net: 0 },
  );
}

// Uses the Tink sync's own rules, so a chart never sorts a transaction
// differently from the category the sync stores. Test bookings and
// descriptions matching several categories have no category there.
function categorizeTransaction(transaction: DashboardTransaction): string {
  if (transaction.category?.trim()) {
    return transaction.category;
  }

  return (
    classifyDescriptions(
      transaction.description,
      transaction.description,
      categoryMapping,
    ).categoryName ?? "Uncategorized"
  );
}

export function categorizeTransactions(
  transactions: DashboardTransaction[],
): DashboardTransaction[] {
  return transactions.map((transaction) => ({
    ...transaction,
    category: categorizeTransaction(transaction),
  }));
}

export async function loadDashboardData(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<DashboardData> {
  const currentMonthRange = getMonthRange(now);
  const previousMonthRange = getPreviousMonthRange(now);
  const monthlyTransactionFields =
    "id,amount,currency,description,booked_date,status,category,is_transfer";

  const [accountsResult, recentResult, countResult, monthResult, previousMonthResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select(
          "id,name,type,balance_booked,balance_available,currency,last_refreshed",
        )
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      supabase
        .from("transactions")
        .select(
          "id,amount,currency,description,booked_date,status,category,is_transfer",
        )
        .eq("user_id", userId)
        .order("booked_date", { ascending: false })
        // Tink's order is not stable within a day; break ties explicitly.
        .order("id", { ascending: false })
        .limit(8),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("transactions")
        .select(monthlyTransactionFields)
        .eq("user_id", userId)
        .gte("booked_date", currentMonthRange.start)
        .lt("booked_date", currentMonthRange.end),
      supabase
        .from("transactions")
        .select(monthlyTransactionFields)
        .eq("user_id", userId)
        .gte("booked_date", previousMonthRange.start)
        .lt("booked_date", previousMonthRange.end),
    ]);

  const firstError = [
    accountsResult.error,
    recentResult.error,
    countResult.error,
    monthResult.error,
    previousMonthResult.error,
  ].find(Boolean);

  if (firstError) {
    console.error("Failed to load dashboard data:", firstError.message);
    throw new DashboardDataError();
  }

  const currentMonthTransactions =
    (monthResult.data ?? []) as DashboardTransaction[];
  const previousMonthTransactions =
    (previousMonthResult.data ?? []) as DashboardTransaction[];

  return {
    accounts: (accountsResult.data ?? []) as DashboardAccount[],
    recentTransactions: categorizeTransactions(
      (recentResult.data ?? []) as DashboardTransaction[],
    ),
    transactionCount: countResult.count ?? 0,
    monthlySummary: summariseTransactions(currentMonthTransactions),
    currentMonthTransactions: categorizeTransactions(currentMonthTransactions),
    previousMonthTransactions: categorizeTransactions(previousMonthTransactions),
    monthStart: currentMonthRange.start,
    previousMonthStart: previousMonthRange.start,
  };
}
