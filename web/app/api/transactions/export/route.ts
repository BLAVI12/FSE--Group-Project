import { type NextRequest } from "next/server";
import {
  loadTransactionsData,
  TransactionsDataError,
} from "@/lib/data/transactions";
import {
  filterTransactionsForExport,
  transactionsToCsv,
  type TransactionExportFilters,
} from "@/lib/data/transactions-export";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string) {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function exportFilters(request: NextRequest): TransactionExportFilters | null {
  const params = request.nextUrl.searchParams;
  const currency = params.get("currency") ?? undefined;
  const accountId = params.get("account") ?? undefined;
  const categoryParam = params.get("category");
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const entryType = params.get("type") ?? undefined;
  const search = params.get("search")?.trim() || undefined;
  const undated = params.get("undated");

  if (currency && !/^[A-Z]{3}$/.test(currency)) return null;
  if (accountId && !UUID.test(accountId)) return null;
  if (from && !validDate(from)) return null;
  if (to && !validDate(to)) return null;
  if (from && to && from >= to) return null;
  if (entryType && entryType !== "spending" && entryType !== "income") return null;
  if (search && search.length > 100) return null;
  if (undated && undated !== "include") return null;
  if (categoryParam && categoryParam !== "__uncategorised__" && categoryParam.length > 80)
    return null;

  return {
    currency,
    accountId,
    category:
      categoryParam === null
        ? undefined
        : categoryParam === "__uncategorised__"
          ? null
          : categoryParam,
    from,
    to,
    entryType: entryType as TransactionExportFilters["entryType"],
    search,
    includeUndated: undated === "include",
  };
}

export async function GET(request: NextRequest) {
  const filters = exportFilters(request);
  if (!filters) {
    return Response.json({ error: "Invalid export filters." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  try {
    const data = await loadTransactionsData(supabase, user.id);
    const rows = filterTransactionsForExport(
      data.transactions,
      data.accounts,
      filters,
    );
    const csv = transactionsToCsv(rows, data.accounts);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="transactions-${stamp}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof TransactionsDataError)) throw error;
    return Response.json(
      { error: "Transactions could not be exported." },
      { status: 503 },
    );
  }
}
