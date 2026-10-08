import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLink } from "@/components/brand/brand-link";
import { LogoutButton } from "@/components/logout-button";
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
    <main className="min-h-screen bg-[#fbfcfa] text-slate-900">
      <header className="border-b border-slate-100 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <BrandLink />
            <p className="mt-1 break-all text-sm text-slate-500 sm:ml-[50px]">
              Signed in as {user.email ?? user.id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
              Overview
            </Link>
            <Link
              href="/dashboard/transactions"
              aria-current="page"
              className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
            >
              Transactions
            </Link>
            <Link
              href="/dashboard/profile"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
              Profile
            </Link>
            <LogoutButton className="ml-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700" />
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10 pb-16">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">
          Your money, month by month
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Transactions
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
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
            className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-8"
          >
            <h2 className="text-xl font-semibold">Transactions unavailable</h2>
            <p className="mt-2 text-slate-700">
              We could not load all your saved transactions. Please try again in
              a moment.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/dashboard/transactions"
                className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
              >
                Try again
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
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
