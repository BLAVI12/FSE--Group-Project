import type { SupabaseClient } from "@supabase/supabase-js";

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
  monthStart: string;
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

export async function loadDashboardData(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<DashboardData> {
  const monthRange = getUtcMonthRange(now);

  const [accountsResult, recentResult, countResult, monthResult] =
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
        .select("amount,is_transfer")
        .eq("user_id", userId)
        .eq("status", "BOOKED")
        .gte("booked_date", monthRange.start)
        .lt("booked_date", monthRange.end),
    ]);

  const firstError = [
    accountsResult.error,
    recentResult.error,
    countResult.error,
    monthResult.error,
  ].find(Boolean);

  if (firstError) {
    console.error("Failed to load dashboard data:", firstError.message);
    throw new DashboardDataError();
  }

  return {
    accounts: (accountsResult.data ?? []) as DashboardAccount[],
    recentTransactions: (recentResult.data ?? []) as DashboardTransaction[],
    transactionCount: countResult.count ?? 0,
    monthlySummary: summariseTransactions(
      (monthResult.data ?? []) as TransactionAmount[],
    ),
    monthStart: monthRange.start,
  };
}
