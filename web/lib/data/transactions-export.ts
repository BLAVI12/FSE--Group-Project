import type {
  SpendingTransaction,
  TransactionAccount,
} from "@/lib/data/transactions";

export type TransactionExportFilters = {
  currency?: string;
  accountId?: string;
  category?: string | null;
  from?: string;
  to?: string;
  entryType?: "spending" | "income";
  search?: string;
  includeUndated?: boolean;
};

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("Unsafe money value");
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function filterTransactionsForExport(
  transactions: SpendingTransaction[],
  accounts: TransactionAccount[],
  filters: TransactionExportFilters,
): SpendingTransaction[] {
  const accountNames = new Map(
    accounts.map((account) => [account.id, account.name ?? "Unnamed account"]),
  );
  const search = filters.search?.trim().toLocaleLowerCase("en-GB") ?? "";

  return transactions.filter((transaction) => {
    if (filters.currency && transaction.currency !== filters.currency) return false;
    if (filters.accountId && transaction.account_id !== filters.accountId) return false;
    if (filters.category !== undefined && transaction.category !== filters.category)
      return false;
    if (!transaction.booked_date) {
      if (!filters.includeUndated && (filters.from || filters.to)) return false;
    } else {
      if (filters.from && transaction.booked_date < filters.from) return false;
      if (filters.to && transaction.booked_date >= filters.to) return false;
    }
    if (filters.entryType === "spending" && transaction.amount >= 0) return false;
    if (filters.entryType === "income" && transaction.amount <= 0) return false;
    if (
      search &&
      !`${transaction.description} ${transaction.category ?? "Uncategorised"} ${accountNames.get(transaction.account_id) ?? ""}`
        .toLocaleLowerCase("en-GB")
        .includes(search)
    )
      return false;
    return true;
  });
}

export function transactionsToCsv(
  transactions: SpendingTransaction[],
  accounts: TransactionAccount[],
): string {
  const accountNames = new Map(
    accounts.map((account) => [account.id, account.name ?? "Unnamed account"]),
  );
  const header = [
    "date",
    "description",
    "category",
    "account",
    "status",
    "amount",
    "currency",
    "internal_transfer",
    "excluded",
  ];
  const rows = transactions.map((transaction) => [
    transaction.booked_date ?? "",
    transaction.description,
    transaction.category ?? "",
    accountNames.get(transaction.account_id) ?? "Bank account",
    transaction.status,
    centsToDecimal(transaction.amount),
    transaction.currency,
    transaction.is_transfer ? "true" : "false",
    transaction.is_excluded ? "true" : "false",
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
