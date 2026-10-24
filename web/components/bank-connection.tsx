"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatGermanDateTime } from "@/lib/time";
import { bankPhase, type BankConnectionData } from "@/lib/bank-connection-state";
import { useBankSync } from "@/lib/use-bank-sync";

export function BankConnection({ configured, connection, outcome }: {
  configured: boolean;
  connection: BankConnectionData | null;
  outcome?: string;
}) {
  const router = useRouter();
  const phase = bankPhase(connection);
  const onImported = useCallback(() => {
    if (phase === "initial_import") router.replace("/dashboard");
  }, [phase, router]);
  const { busy, message, expired, renewal, lastSaved, run } = useBankSync({
    configured, connection, outcome, mode: "management", onImported,
  });
  const live = connection?.live_sync_enabled ?? false;
  const buttonClass = "rounded-full px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-label="Bank connection" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Tink Demo Bank</h2>
          <p className="mt-2 text-sm text-slate-600">
            {lastSaved ? `Last saved: ${formatGermanDateTime(lastSaved)}` : live
              ? "Your bank is connected. Finish the first import to open your dashboard."
              : "Connect through Tink Link. Enter your Demo Bank test-user details there, not in this app."}
          </p>
        </div>
        {live && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${expired || renewal ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
          {expired || renewal ? "Renewal needed" : lastSaved ? "Connected" : "First import"}
        </span>}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {!live ? (
          <button disabled={!configured || busy} onClick={() => void run("connect")}
            className={`${buttonClass} bg-emerald-700 text-white hover:bg-emerald-800`}>
            {busy ? "Opening bank login…" : "Add bank now"}
          </button>
        ) : expired ? (
          <button disabled={!configured || busy} onClick={() => void run("connect", { renew: true })}
            className={`${buttonClass} bg-emerald-700 text-white hover:bg-emerald-800`}>
            {busy ? "Opening bank login…" : "Reconnect bank"}
          </button>
        ) : (
          <button disabled={!configured || busy} onClick={() => void run("sync", { manual: true })}
            className={`${buttonClass} bg-emerald-700 text-white hover:bg-emerald-800`}>
            {busy ? "Updating…" : lastSaved ? "Refresh data" : "Retry import"}
          </button>
        )}
        {live && !expired && renewal && <button disabled={!configured || busy} onClick={() => void run("connect", { renew: true })}
          className={`${buttonClass} border border-amber-300 text-amber-900 hover:bg-amber-50`}>
          Reconnect bank
        </button>}
        {lastSaved && <Link href="/dashboard" className={`${buttonClass} border border-slate-200 text-slate-700 hover:bg-slate-50`}>
          Open dashboard
        </Link>}
      </div>

      <p className={`mt-4 text-sm ${configured ? "text-slate-600" : "text-amber-800"}`} role="status" aria-live="polite">
        {!configured ? "Bank connection is not configured in this environment. Please contact the project team; your existing data has not been changed."
          : message || (expired ? "Renew your bank permission to update your data. Saved data remains available."
            : renewal ? "One of your bank logins needs to be renewed. Your other accounts keep updating; reconnect to update the rest."
            : live ? "Refresh updates your existing bank connection without opening Tink Link."
              : "Your dashboard and transactions will become available after connecting your bank and completing the first import.")}
      </p>
    </section>
  );
}
