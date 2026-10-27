import Link from "next/link";
import { redirect } from "next/navigation";
import { BankConnection } from "@/components/bank-connection";
import { DashboardHeader } from "@/components/dashboard-header";
import { UserGreeting } from "@/components/user-greeting";
import { bankPhase, type BankConnectionData } from "@/lib/bank-connection-state";
import { isBankConfigured } from "@/lib/bank-config";
import { loadOwnBankConnection, BankDataError } from "@/lib/data/bank";
import { createClient } from "@/lib/supabase/server";

export default async function BankPage({ searchParams }: {
  searchParams: Promise<{ bank?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/bank");
  const { bank } = await searchParams;
  let connection: BankConnectionData | null = null;
  let unavailable = false;
  try {
    connection = await loadOwnBankConnection(supabase, user.id);
  } catch (error) {
    if (!(error instanceof BankDataError)) throw error;
    unavailable = true;
  }
  const phase = bankPhase(connection);

  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-900">
      <DashboardHeader activePage="bank" bankConnection={connection} bankUnavailable={unavailable}
        greeting={<UserGreeting supabase={supabase} userId={user.id} />} />
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-6 9 6H3ZM4 21h16M6 12v6m6-6v6m6-6v6" />
          </svg>
        </div>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Your bank connection</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {unavailable ? "Bank connection unavailable" : phase === "needs_setup" ? "Add your bank" : phase === "initial_import" ? "Let’s load your bank data" : "Manage your bank"}
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-600">
          {unavailable ? "We could not verify your saved bank connection. Please try again. This does not mean your bank or data has been removed."
            : phase === "needs_setup" ? "One more step to get started: connect your bank to see your accounts, transactions and spending in one place."
              : phase === "initial_import" ? "Your bank login is connected. We’ll open your dashboard when the first import has finished. You can retry here if the import fails."
                : "Update your saved bank data or renew your bank permission. Your existing accounts and transaction history stay in place."}
        </p>
        {unavailable ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6" role="alert">
            <p className="text-amber-900">Please reload this page before trying to connect or refresh your bank.</p>
            <Link href="/dashboard/bank" className="mt-4 inline-block rounded-full bg-emerald-700 px-5 py-2.5 font-semibold text-white">Try again</Link>
          </div>
        ) : <BankConnection configured={isBankConfigured()} connection={connection} outcome={bank} />}
      </div>
    </main>
  );
}
