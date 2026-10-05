"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Connection = {
  status: string;
  live_sync_enabled: boolean;
  last_synced: string | null;
} | null;

type BankStatus = {
  connected: boolean;
  state: "not_connected" | "syncing" | "synced" | "partial" | "error" | "expired";
  lastSynced?: string | null;
};

const messages: Record<string, string> = {
  connected: "Bank connected. Loading your transactions…",
  cancelled: "Bank connection cancelled. You can try again.",
  failed: "The bank could not be connected. Please try again.",
  expired: "Your bank permission has expired. Please renew it.",
  busy: "Your bank data is already being updated. Please try again shortly.",
  retry_later: "The last update failed. Please try again shortly.",
  current: "Showing your latest saved data. Please wait before another refresh.",
  synced: "Bank data updated.",
  partial: "Available bank data loaded. Some transactions could not be imported. Try Refresh again later.",
  not_connected: "Connect your bank to load your transactions.",
};

export function BankConnection({ configured, connection, outcome }: {
  configured: boolean;
  connection: Connection;
  outcome?: string;
}) {
  const router = useRouter();
  const started = useRef(false);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(messages[outcome ?? ""] ?? "");
  const [expired, setExpired] = useState(connection?.status === "EXPIRED");
  const live = connection?.live_sync_enabled ?? false;

  // One request function for automatic refresh, the buttons and consent renewal.
  const run = useCallback(async (
    action: "connect" | "sync",
    options: { manual?: boolean; renew?: boolean } = {},
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(action === "sync" ? "Updating your bank data…" : "Opening Tink…");
    try {
      const query = new URLSearchParams({ action });
      if (options.manual) query.set("manual", "true");
      if (options.renew) query.set("renew", "true");
      const response = await fetch(`/api/tink?${query}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === "connect") {
        window.location.assign(result.redirectUrl);
      } else {
        setMessage(messages[result.status] ?? "Please try again.");
        setExpired(result.status === "expired");
        if (result.status === "synced" || result.status === "partial" || (result.status === "expired" && result.lastSynced))
          router.refresh();
      }
    } catch {
      setMessage("The bank request failed. Your saved data is still available. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    if (configured && live && outcome !== "connected" && !started.current) {
      started.current = true;
      void run("sync");
    }
  }, [configured, live, outcome, run]);

  useEffect(() => {
    if (!configured || outcome !== "connected") return;
    let cancelled = false;
    const sleep = (milliseconds: number) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds));

    async function watchInitialSync() {
      setBusy(true);
      setMessage(messages.connected);
      for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
        if (attempt) await sleep(1_000);
        try {
          const response = await fetch("/api/tink?action=status", { cache: "no-store" });
          if (!response.ok) throw new Error("status unavailable");
          const status = (await response.json()) as BankStatus;
          if (cancelled) return;
          if (status.state === "synced" || status.state === "partial") {
            setMessage(messages[status.state]);
            setExpired(false);
            setBusy(false);
            router.refresh();
            return;
          }
          if (status.state === "expired") {
            setMessage(messages.expired);
            setExpired(true);
            setBusy(false);
            router.refresh();
            return;
          }
          if (status.state === "error" || status.state === "not_connected") {
            setMessage("The bank sync failed. Your saved data is still available. Please try Refresh.");
            setBusy(false);
            return;
          }
        } catch {
          // A transient status request must not cancel a bank sync that is still running.
        }
      }
      if (!cancelled) {
        setMessage("Bank connected. The first sync is taking longer than usual; your saved data remains available.");
        setBusy(false);
      }
    }

    void watchInitialSync();
    return () => {
      cancelled = true;
    };
  }, [configured, outcome, router]);

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5" aria-label="Bank connection">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{live ? "Connected bank" : "Connect your bank"}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {live && connection?.last_synced
              ? `Last saved: ${new Date(connection.last_synced).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
              : "Connect with Tink to load your own bank data."}
          </p>
        </div>
        {configured && <div className="flex gap-3">
          {live && !expired && <button disabled={busy} onClick={() => void run("sync", { manual: true })}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Refresh
          </button>}
          <button disabled={busy} onClick={() => void run("connect", { renew: expired })}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
            {expired ? "Renew bank permission" : live ? "Add bank" : "Connect bank"}
          </button>
        </div>}
      </div>
      <p className="mt-3 text-sm text-slate-300" role="status" aria-live="polite">
        {!configured ? "Bank connection is not available yet."
          : message || (live ? "Automatically checked when you open the dashboard." : messages.not_connected)}
      </p>
    </section>
  );
}
