import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { BankConnection } from "@/components/bank-connection";
import { MonthlySpending } from "@/components/dashboard/monthly-spending";
import { BrandLink } from "@/components/brand/brand-link";
import {
  DashboardDataError,
  loadDashboardData,
  type DashboardAccount,
  type DashboardTransaction,
} from "@/lib/data/dashboard";
import { createClient } from "@/lib/supabase/server";

function formatMoney(cents: number | null, currency = "EUR") {
  if (cents === null) {
    return "Not available";
  }

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bank?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { bank } = await searchParams;
  const { data: connection, error: connectionError } = await supabase
    .from("connections")
    .select("status,live_sync_enabled,last_synced")
    .eq("user_id", user.id)
    .eq("provider", "tink")
    .maybeSingle();
  const bankConfigured = [
    "DATABASE_URL",
    "TINK_CLIENT_ID",
    "TINK_CLIENT_SECRET",
    "TINK_REDIRECT_URI",
  ].every((name) => Boolean(process.env[name])) &&
    process.env.TINK_TEST_MODE !== "false";

  let dashboardData;

  try {
    dashboardData = await loadDashboardData(supabase, user.id);
  } catch (error) {
    if (!(error instanceof DashboardDataError)) {
      throw error;
    }

    return <DashboardError email={user.email ?? user.id} />;
  }

  const checkingAccounts = dashboardData.accounts.filter(
  (account) => account.type === "CHECKING",
);

const checkingCurrencies = new Set(
  checkingAccounts.map((account) => account.currency),
);

const availableToSpend =
  checkingAccounts.length > 0 &&
  checkingAccounts.every((account) => account.balance_available !== null)
    ? checkingAccounts.reduce(
        (sum, account) => sum + (account.balance_available ?? 0),
        0,
      )
    : null;

const availableCurrency =
  checkingCurrencies.size === 1
    ? checkingAccounts[0]?.currency ?? "EUR"
    : "EUR";
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dashboardData.monthStart}T00:00:00Z`));
  const previousMonthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dashboardData.previousMonthStart}T00:00:00Z`));

  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-900">
      <header className="border-b border-slate-100 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <BrandLink />
            <p className="mt-1 text-sm text-slate-500 sm:ml-[50px]">
              Signed in as {user.email ?? user.id}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              aria-current="page"
              className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
            >
              Overview
            </Link>
            <Link
              href="/dashboard/transactions"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
              Transactions
            </Link>
            <Link
              href="/dashboard/profile"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
              Profile
            </Link>
            <LogoutButton className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700" />
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">
            Financial overview
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Dashboard</h1>
          <p className="mt-2 text-slate-600">
            Your saved accounts and transactions, updated from your bank.
          </p>
        </div>

        <BankConnection
          configured={!connectionError && bankConfigured}
          connection={connection}
          outcome={bank}
        />

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
           label="Available to spend"
  value={
    checkingCurrencies.size <= 1
      ? formatMoney(availableToSpend, availableCurrency)
      : "Multiple currencies"
  }
/>
          <SummaryCard
            label={`${monthLabel} income`}
            value={formatMoney(dashboardData.monthlySummary.income)}
            tone="positive"
          />
          <SummaryCard
            label={`${monthLabel} spending`}
            value={formatMoney(dashboardData.monthlySummary.spending)}
          />
          <SummaryCard
            label="Transactions"
            value={dashboardData.transactionCount.toLocaleString("en-GB")}
            href="/dashboard/transactions"
          />
        </section>

        <MonthlySpending
          currentMonthLabel={monthLabel}
          previousMonthLabel={previousMonthLabel}
          currentMonthTransactions={dashboardData.currentMonthTransactions}
          previousMonthTransactions={dashboardData.previousMonthTransactions}
        />

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Accounts</h2>
              <p className="mt-1 text-sm text-slate-600">
                Booked and available bank balances.
              </p>
            </div>
            <span className="text-sm text-slate-500">
              {dashboardData.accounts.length} connected
            </span>
          </div>

          {dashboardData.accounts.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {dashboardData.accounts.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          ) : (
            <EmptyState message="No bank accounts are connected yet." />
          )}
        </section>

        <section className="mt-10 pb-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Recent transactions</h2>
              <p className="mt-1 text-sm text-slate-600">
                Your eight most recent booked or pending entries.
              </p>
            </div>
            <Link
              href="/dashboard/transactions"
              className="rounded-full px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              View all transactions →
            </Link>
          </div>

          {dashboardData.recentTransactions.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-2xl text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-medium">Description</th>
                      <th className="px-5 py-4 font-medium">Category</th>
                      <th className="px-5 py-4 font-medium">Date</th>
                      <th className="px-5 py-4 font-medium">Status</th>
                      <th className="px-5 py-4 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboardData.recentTransactions.map((transaction) => (
                      <TransactionRow key={transaction.id} transaction={transaction} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState message="No transactions are available yet." />
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive";
  href?: string;
}) {
  const content = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          tone === "positive" ? "text-emerald-700" : "text-slate-950"
        }`}
      >
        {value}
      </p>
      {href && (
        <p className="mt-3 text-xs font-semibold text-emerald-800">
          Explore spending trends →
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {content}
    </article>
  );
}

function AccountCard({ account }: { account: DashboardAccount }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            {account.type?.replaceAll("_", " ") ?? "ACCOUNT"}
          </p>
          <h3 className="mt-1 text-xl font-semibold">
            {account.name ?? "Unnamed account"}
          </h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {account.currency}
        </span>
      </div>
      <p className="mt-6 text-sm text-slate-500">Booked balance</p>
      <p className="mt-1 text-3xl font-bold">
        {formatMoney(account.balance_booked, account.currency)}
      </p>
      <p className="mt-4 text-sm text-slate-500">
        Available: {formatMoney(account.balance_available, account.currency)}
      </p>
    </article>
  );
}

function TransactionRow({
  transaction,
}: {
  transaction: DashboardTransaction;
}) {
  const isIncome = transaction.amount >= 0;

  return (
    <tr>
      <td className="px-5 py-4 font-medium text-slate-900">
        {transaction.description}
        {transaction.is_transfer && (
          <span className="ml-2 text-xs text-slate-500">Transfer</span>
        )}
      </td>
      <td className="px-5 py-4 text-slate-600">
        {transaction.category ?? "Uncategorised"}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
        {formatDate(transaction.booked_date)}
      </td>
      <td className="px-5 py-4">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {transaction.status}
        </span>
      </td>
      <td
        className={`whitespace-nowrap px-5 py-4 text-right font-semibold ${
          isIncome ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {isIncome ? "+" : ""}
        {formatMoney(transaction.amount, transaction.currency)}
      </td>
    </tr>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center text-slate-500">
      {message}
    </div>
  );
}

function DashboardError({ email }: { email: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfcfa] px-6 text-slate-900">
      <div className="max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-[0_24px_70px_-32px_rgba(15,81,59,0.25)]">
        <div className="mb-5 flex justify-center"><BrandLink /></div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard unavailable</h1>
        <p className="mt-3 text-slate-600">
          We could not load the financial data for {email}. Please try again in
          a moment.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-full bg-emerald-700 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
          >
            Try again
          </Link>
          <LogoutButton className="rounded-full border border-slate-200 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700" />
        </div>
      </div>
    </main>
  );
}
