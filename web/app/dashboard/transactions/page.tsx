import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { TransactionsExplorer } from "@/components/transactions-explorer";
import {
  loadTransactionsData,
  TransactionsDataError,
} from "@/lib/data/transactions";
import { createClient } from "@/lib/supabase/server";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let data;
  try {
    data = await loadTransactionsData(supabase, user.id);
  } catch (error) {
    if (!(error instanceof TransactionsDataError)) throw error;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <Link href="/" className="text-xl font-bold">
              Student Finance Planner
            </Link>
            <p className="mt-1 break-all text-sm text-slate-400">
              Signed in as {user.email ?? user.id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              Overview
            </Link>
            <Link
              href="/dashboard/transactions"
              aria-current="page"
              className="rounded-lg bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-300"
            >
              Transactions
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="ml-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10"
              >
                Log out
              </button>
            </form>
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10 pb-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
          Your money, month by month
        </p>
        <h1 className="mt-2 text-3xl font-bold">Transactions</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          See how your spending changes over time and explore the transactions
          behind it.
        </p>
        {data ? (
          <TransactionsExplorer
            accounts={data.accounts}
            categories={data.categories}
            transactions={data.transactions}
            now={new Date().toISOString()}
          />
        ) : (
          <section
            role="alert"
            className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-8"
          >
            <h2 className="text-xl font-semibold">Transactions unavailable</h2>
            <p className="mt-2 text-slate-300">
              We could not load all your saved transactions. Please try again in
              a moment.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/dashboard/transactions"
                className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Try again
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg border border-white/20 px-4 py-2 text-sm"
              >
                Back to overview
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
