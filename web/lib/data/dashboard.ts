import type { SupabaseClient } from "@supabase/supabase-js";
import categoryMapping from "../../../supabase/seed-data/transaction-categories.json" with {
  type: "json",
};

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

type TransactionAmount = Pick<DashboardTransaction, "amount" | "is_transfer">;

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

export function getUtcMonthRange(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  return {
    start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10),
  };
}

export function getPreviousUtcMonthRange(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - 1;

  return {
    start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10),
  };
}

export function summariseTransactions(
  transactions: TransactionAmount[],
): MonthlySummary {
  return transactions.reduce<MonthlySummary>(
    (summary, transaction) => {
      if (transaction.is_transfer) {
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

function normalizeCategoryText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("de-DE");
}

function categorizeTransaction(transaction: DashboardTransaction) {
  if (transaction.category?.trim()) {
    return transaction.category;
  }

  const description = normalizeCategoryText(transaction.description);
  if (
    categoryMapping.ignored_test_transactions.some((pattern) =>
      description.includes(normalizeCategoryText(pattern)),
    )
  ) {
    return "Uncategorized";
  }

  const matches = categoryMapping.categories.flatMap((category) =>
    category.keywords.some((keyword) =>
      description.includes(normalizeCategoryText(keyword)),
    )
      ? [category.name]
      : [],
  );
  const matchingCategories = new Set(matches);

  return matchingCategories.size === 1
    ? matches[0]
    : "Uncategorized";
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
  const monthRange = getUtcMonthRange(now);
  const previousMonthRange = getPreviousUtcMonthRange(now);
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
        .gte("booked_date", monthRange.start)
        .lt("booked_date", monthRange.end),
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
    monthStart: monthRange.start,
    previousMonthStart: previousMonthRange.start,
  };
}
