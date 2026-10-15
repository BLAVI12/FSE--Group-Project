// Categories as the user sees them, shared by the dashboard, the Transactions
// page (server and browser) and the CSV export. It uses the Tink sync's own
// rules, so no page sorts a transaction differently from the category the
// sync stores. Test bookings and descriptions matching several categories
// have no category there and show as "Uncategorized".
import categoryMapping from "../../../supabase/seed-data/transaction-categories.json" with {
  type: "json",
};
import { classifyDescriptions } from "../../../src/features/transactions/transaction-rules.js";

type Categorizable = { category: string | null; description: string };

/** The category the keyword rules choose when none is saved. */
export function automaticCategory(description: string): string {
  return (
    classifyDescriptions(description, description, categoryMapping).categoryName ??
    "Uncategorized"
  );
}

/** Every transaction with a category: the saved one, or the keyword rules' choice. */
export function categorizeTransactions<T extends Categorizable>(
  transactions: T[],
): (Omit<T, "category"> & { category: string })[] {
  return transactions.map((transaction) => ({
    ...transaction,
    category: transaction.category?.trim()
      ? transaction.category
      : automaticCategory(transaction.description),
  }));
}
