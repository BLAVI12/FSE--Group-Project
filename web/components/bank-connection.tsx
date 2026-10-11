"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGermanDateTime } from "@/lib/time";
import { pollBankStatus, requestBank } from "@/lib/bank-request";
import type { SyncClaim, SyncResult } from "@/lib/tink";

type Connection = {
  status: string;
  live_sync_enabled: boolean;
  last_synced: string | null;
} | null;

type StartResult = SyncResult | Omit<SyncClaim, "claimId">;
const messages: Record<string, string> = {
  connected: "Demo Bank connected. Loading your transactions…",
  already_connected: "This Demo Bank login is already connected. Use Refresh data to update your saved transactions.",
  cancelled: "Bank connection cancelled. You can try again.",
  failed: "Demo Bank could not be connected. Please try again.",
  expired: "Your bank login needs to be renewed. Please reconnect Demo Bank.",
  retry_later: "The last update failed. Please try again in a minute.",
  current: "Showing your saved bank data. Please wait one minute between manual refreshes.",
  synced: "Bank data checked. Showing the latest available transactions.",
  partial: "Available bank data loaded. Some transactions are incomplete. Try Refresh again later.",
  not_connected: "Use Add bank to sign in to Tink Demo Bank.",
};
const syncFailure = "The bank update failed. Your saved data is still available. Please try Refresh again.";

export function BankConnection({ configured, connection, outcome }: {
  configured: boolean;
  connection: Connection;
  outcome?: string;
}) {
  const router = useRouter();
  const started = useRef(false);
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(messages[outcome ?? ""] ?? "");
  const [expired, setExpired] = useState(connection?.status === "EXPIRED");
  const [lastSaved, setLastSaved] = useState(connection?.last_synced ?? null);
  const live = connection?.live_sync_enabled ?? false;

  const run = useCallback(async (
    action: "connect" | "sync" | "watch",
    options: { manual?: boolean; renew?: boolean } = {},
  ) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage(action === "connect" ? "Opening Tink Demo Bank…" : "Updating your bank data…");
    let beforeTransactions: string | undefined;
    try {
      if (action === "connect") {
        const query = new URLSearchParams({ action });
        if (options.renew) query.set("renew", "true");
        const result = await requestBank<{ redirectUrl: string }>(query.toString(), "POST", controller.signal);
        // The server returns Tink Link; bank credentials are typed there only.
        const link = new URL(result.redirectUrl);
        if (link.origin !== "https://link.tink.com") throw new Error("Invalid bank link");
        window.location.assign(link.toString());
        return;
      }
      if (action === "sync") {
        const query = new URLSearchParams({ action: "sync" });
        if (options.manual) query.set("manual", "true");
        const result = await requestBank<StartResult>(query.toString(), "POST", controller.signal);
        if (result.status !== "syncing" && result.status !== "busy") {
          setMessage(messages[result.status] ?? syncFailure);
          setExpired(result.status === "expired");
          if (result.lastSynced) setLastSaved(result.lastSynced);
          // A preceding background import may have completed since this page
          // rendered, even when another bank fetch is still rate-limited.
          if (result.lastSynced) router.refresh();
          return;
        }
        if (result.status === "syncing") beforeTransactions = result.transactionFingerprint;
      }
      // Poll a bounded local status endpoint while the server works in the
      // background. Never keep buttons disabled indefinitely after a timeout.
      const status = await pollBankStatus(controller.signal, {
        onStatus: (value) => {
          if (value.lastSynced) setLastSaved(value.lastSynced);
        },
      });
      if (controller.signal.aborted) return;
      setExpired(status.state === "expired");
      const unchanged = status.state === "synced" && beforeTransactions !== undefined &&
        status.transactionFingerprint === beforeTransactions;
      setMessage(unchanged
        ? "No new transactions. The bank returned the same data as before."
        : status.state === "error" ? syncFailure : messages[status.state] ?? syncFailure);
      if (["synced", "partial", "expired"].includes(status.state)) router.refresh();
    } catch (error) {
      if (!controller.signal.aborted) setMessage(
        error instanceof Error && error.name === "TimeoutError"
          ? "The update is taking longer than usual. Your saved data remains available; try Refresh again."
          : syncFailure,
      );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!configured || started.current || outcome === "already_connected" || (!live && outcome !== "connected")) return;
    // Deferring also avoids launching twice during React's development checks.
    const timer = setTimeout(() => {
      started.current = true;
      void run(outcome === "connected" ? "watch" : "sync");
    }, 0);
    return () => clearTimeout(timer);
  }, [configured, live, outcome, run]);

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Bank connection" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-950">Tink Demo Bank</h2>
          <p className="mt-1 text-sm text-slate-600">
            {lastSaved ? `Last saved: ${formatGermanDateTime(lastSaved)}` : "Add bank opens the Demo Bank login. Enter your Tink test-user details there."}
          </p>
        </div>
        {configured && <div className="flex flex-wrap gap-3">
          {live && <button disabled={busy} onClick={() => void run("sync", { manual: true })}
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
            {busy ? "Updating…" : "Refresh data"}
          </button>}
          <button disabled={busy} onClick={() => void run("connect", { renew: expired })}
            className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">
            {expired ? "Reconnect Demo Bank" : "Add bank"}
          </button>
        </div>}
      </div>
      <p className="mt-3 text-sm text-slate-700" role="status" aria-live="polite">
        {!configured ? "Bank connection is not available yet." : message || (live ? "Your data is checked when you open the dashboard." : messages.not_connected)}
      </p>
    </section>
  );
}
