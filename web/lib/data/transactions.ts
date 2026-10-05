import type { SupabaseClient } from "@supabase/supabase-js";

export type TransactionAccount = {
  id: string;
  name: string | null;
  currency: string;
};

export type TransactionCategory = {
  id: string;
  name: string;
  user_id: string | null;
};

export type SpendingTransaction = {
  id: string;
  account_id: string;
  amount: number;
  currency: string;
  description: string;
  booked_date: string | null;
  status: string;
  category: string | null;
  is_transfer: boolean;
  is_excluded: boolean;
};

export type SpendingMonth = {
  month: string;
  spending: number;
  income: number;
  net: number;
};

export class TransactionsDataError extends Error {
  constructor() {
    super("Transactions could not be loaded.");
    this.name = "TransactionsDataError";
  }
}

const PAGE_SIZE = 1000;
const FIELDS =
  "id,account_id,amount,currency,description,booked_date,status,category,is_transfer,is_excluded";

// Supabase's default row cap must not silently truncate a spending trend.
export async function loadTransactionsData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  accounts: TransactionAccount[];
  categories: TransactionCategory[];
  transactions: SpendingTransaction[];
}> {
  const accountsResult = await supabase
    .from("accounts")
    .select("id,name,currency")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (accountsResult.error) {
    throw new TransactionsDataError();
  }

  // RLS exposes system categories plus categories owned by the signed-in user.
  const categoriesResult = await supabase
    .from("categories")
    .select("id,name,user_id")
    .order("name", { ascending: true });

  if (categoriesResult.error) {
    throw new TransactionsDataError();
  }

  const transactions: SpendingTransaction[] = [];
  let total: number | null = null;

  do {
    const result = await supabase
      .from("transactions")
      .select(FIELDS, total === null ? { count: "exact" } : undefined)
      .eq("user_id", userId)
      .order("booked_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(transactions.length, transactions.length + PAGE_SIZE - 1);

    if (result.error || (total === null && result.count === null)) {
      throw new TransactionsDataError();
    }
    total ??= result.count;
    const rows = result.data ?? [];

    if (rows.length === 0 && transactions.length < (total ?? 0)) {
      throw new TransactionsDataError();
    }

    for (const row of rows) {
      // BIGINT values can be returned as strings. Never round monetary values.
      if (
        (typeof row.amount !== "number" &&
          !(typeof row.amount === "string" && /^-?\d+$/.test(row.amount))) ||
        !Number.isSafeInteger(Number(row.amount))
      ) {
        throw new TransactionsDataError();
      }
      transactions.push({
        ...row,
        amount: Number(row.amount),
      } as SpendingTransaction);
    }
  } while (transactions.length < (total ?? 0));

  return {
    accounts: (accountsResult.data ?? []) as TransactionAccount[],
    categories: (categoriesResult.data ?? []) as TransactionCategory[],
    transactions,
  };
}

export function getMonthKeys(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + 1 + index, 1),
    )
      .toISOString()
      .slice(0, 7),
  );
}

export function countsTowardsTrend(transaction: SpendingTransaction): boolean {
  return (
    transaction.status === "BOOKED" &&
    !transaction.is_transfer &&
    !transaction.is_excluded
  );
}

// A currency is mandatory: EUR and GBP must never be added together.
export function aggregateSpendingMonths(
  transactions: SpendingTransaction[],
  months: string[],
  currency: string,
): SpendingMonth[] {
  const summaries = new Map(
    months.map((month) => [month, { month, spending: 0, income: 0, net: 0 }]),
  );

  for (const transaction of transactions) {
    if (!countsTowardsTrend(transaction) || transaction.currency !== currency)
      continue;
    const summary = summaries.get(transaction.booked_date?.slice(0, 7) ?? "");
    if (!summary) continue;
    summary.spending += transaction.amount < 0 ? -transaction.amount : 0;
    summary.income += transaction.amount > 0 ? transaction.amount : 0;
    summary.net += transaction.amount;
    if (
      ![summary.spending, summary.income, summary.net].every(
        Number.isSafeInteger,
      )
    ) {
      throw new TransactionsDataError();
    }
  }

  return [...summaries.values()];
}
