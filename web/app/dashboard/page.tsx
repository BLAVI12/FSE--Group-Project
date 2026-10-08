import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { BankConnection } from "@/components/bank-connection";
import { MonthlySpending } from "@/components/dashboard/monthly-spending";
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
  ].every((name) => Boolean(process.env[name]));

  let dashboardData;

  try {
    dashboardData = await loadDashboardData(supabase, user.id);
  } catch (error) {
    if (!(error instanceof DashboardDataError)) {
      throw error;
    }

    return <DashboardError email={user.email ?? user.id} />;
  }

  const accountCurrencies = new Set(
    dashboardData.accounts.map((account) => account.currency),
  );
  const totalBalance = dashboardData.accounts.reduce(
    (sum, account) => sum + (account.balance_booked ?? 0),
    0,
  );
  const balanceCurrency =
    accountCurrencies.size === 1
      ? dashboardData.accounts[0]?.currency ?? "EUR"
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
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <Link href="/" className="text-xl font-bold">
              Student Finance Planner
            </Link>
            <p className="mt-1 text-sm text-slate-400">
              Signed in as {user.email ?? user.id}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              aria-current="page"
              className="rounded-lg bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-300"
            >
              Overview
            </Link>
            <Link
              href="/dashboard/transactions"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              Transactions
            </Link>
            <Link
              href="/dashboard/profile"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              Profile
            </Link>
            <LogoutButton className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10" />
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
            Financial overview
          </p>
          <h1 className="mt-2 text-3xl font-bold">Dashboard</h1>
          <p className="mt-2 text-slate-400">
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
            label="Total balance"
            value={
              accountCurrencies.size <= 1
                ? formatMoney(totalBalance, balanceCurrency)
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
              <p className="mt-1 text-sm text-slate-400">
                Booked and available bank balances.
              </p>
            </div>
            <span className="text-sm text-slate-400">
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
              <p className="mt-1 text-sm text-slate-400">
                Your eight most recent booked or pending entries.
              </p>
            </div>
            <Link
              href="/dashboard/transactions"
              className="text-sm font-semibold text-emerald-300 hover:text-emerald-200"
            >
              View all transactions →
            </Link>
          </div>

          {dashboardData.recentTransactions.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <div className="overflow-x-auto">
                <table className="w-full min-w-2xl text-left text-sm">
                  <thead className="border-b border-white/10 text-slate-400">
                    <tr>
                      <th className="px-5 py-4 font-medium">Description</th>
                      <th className="px-5 py-4 font-medium">Category</th>
                      <th className="px-5 py-4 font-medium">Date</th>
                      <th className="px-5 py-4 font-medium">Status</th>
                      <th className="px-5 py-4 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
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
      <p className="text-sm text-slate-400">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          tone === "positive" ? "text-emerald-300" : "text-white"
        }`}
      >
        {value}
      </p>
      {href && (
        <p className="mt-3 text-xs font-semibold text-emerald-300">
          Explore spending trends →
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-5 transition hover:border-emerald-300/60 hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-emerald-300"
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
      {content}
    </article>
  );
}

function AccountCard({ account }: { account: DashboardAccount }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-300">
            {account.type?.replaceAll("_", " ") ?? "ACCOUNT"}
          </p>
          <h3 className="mt-1 text-xl font-semibold">
            {account.name ?? "Unnamed account"}
          </h3>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">
          {account.currency}
        </span>
      </div>
      <p className="mt-6 text-sm text-slate-400">Booked balance</p>
      <p className="mt-1 text-3xl font-bold">
        {formatMoney(account.balance_booked, account.currency)}
      </p>
      <p className="mt-4 text-sm text-slate-400">
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
      <td className="px-5 py-4 font-medium text-white">
        {transaction.description}
        {transaction.is_transfer && (
          <span className="ml-2 text-xs text-slate-500">Transfer</span>
        )}
      </td>
      <td className="px-5 py-4 text-slate-300">
        {transaction.category ?? "Uncategorised"}
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-slate-300">
        {formatDate(transaction.booked_date)}
      </td>
      <td className="px-5 py-4">
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">
          {transaction.status}
        </span>
      </td>
      <td
        className={`whitespace-nowrap px-5 py-4 text-right font-semibold ${
          isIncome ? "text-emerald-300" : "text-white"
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
    <div className="mt-5 rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-slate-400">
      {message}
    </div>
  );
}

function DashboardError({ email }: { email: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="max-w-lg rounded-2xl border border-red-400/30 bg-red-400/10 p-8 text-center">
        <h1 className="text-2xl font-bold">Dashboard unavailable</h1>
        <p className="mt-3 text-slate-300">
          We could not load the financial data for {email}. Please try again in
          a moment.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-white px-4 py-2 font-semibold text-slate-950"
          >
            Try again
          </Link>
          <LogoutButton className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10" />
        </div>
      </div>
    </main>
  );
}
