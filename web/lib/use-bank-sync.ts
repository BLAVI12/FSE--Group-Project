"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bankAutomaticAction, bankImportReady, type BankConnectionData } from "./bank-connection-state";
import { pollBankStatus, requestBank } from "./bank-request";
import type { SyncClaim, SyncResult } from "./tink";

type StartResult = SyncResult | Omit<SyncClaim, "claimId">;
const messages: Record<string, string> = {
  connected: "Bank connected. Loading your transactions…",
  already_connected: "This bank login is already connected. Use Refresh data to update it.",
  cancelled: "Bank connection cancelled. You can try again.",
  failed: "Your bank could not be connected. Please try again.",
  expired: "Your bank login needs to be renewed. Please reconnect your bank.",
  retry_later: "The last update failed. Please try again in a minute.",
  current: "Showing your saved bank data. Please wait one minute between manual refreshes.",
  synced: "Bank data checked. Showing the latest available transactions.",
  partial: "Available bank data loaded. Some transactions are incomplete. Try Refresh again later.",
  renewal: "Bank data updated. One of your bank logins needs to be renewed: its accounts keep their last saved data until you reconnect.",
  not_connected: "Connect your bank to start using your dashboard.",
};

export function useBankSync({ configured, connection, outcome, mode, onImported }: {
  configured: boolean;
  connection: BankConnectionData | null;
  outcome?: string;
  mode: "background" | "management";
  onImported?: () => void;
}) {
  const router = useRouter();
  const started = useRef(false);
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(messages[outcome ?? ""] ?? "");
  const [expired, setExpired] = useState(connection?.status === "EXPIRED");
  const [renewal, setRenewal] = useState(connection?.needs_renewal ?? false);
  const [lastSaved, setLastSaved] = useState(connection?.last_synced ?? null);
  const syncFailure = lastSaved
    ? "The bank update failed. Your saved data is still available. Please try Refresh again."
    : "Your first bank import could not be completed. Please try Retry import.";

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
        const link = new URL(result.redirectUrl);
        if (link.origin !== "https://link.tink.com") throw new Error("Invalid bank link");
        // Only the person enters bank credentials, inside Tink Link.
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
          if (result.lastSynced) {
            setLastSaved(result.lastSynced);
            onImported?.();
            router.refresh();
          }
          return;
        }
        if (result.status === "syncing") beforeTransactions = result.transactionFingerprint;
      }
      const status = await pollBankStatus(controller.signal, {
        onStatus: (value) => {
          if (value.lastSynced) setLastSaved(value.lastSynced);
        },
      });
      if (controller.signal.aborted) return;
      setExpired(status.state === "expired");
      setRenewal(Boolean(status.needsRenewal));
      const unchanged = status.state === "synced" && beforeTransactions !== undefined &&
        status.transactionFingerprint === beforeTransactions;
      const updated = status.state === "synced" || status.state === "partial";
      setMessage(updated && status.needsRenewal ? messages.renewal
        : unchanged ? "No new transactions. The bank returned the same data as before."
          : status.state === "error" ? syncFailure : messages[status.state] ?? syncFailure);
      if (bankImportReady(status)) onImported?.();
      if (["synced", "partial", "expired", "error", "not_connected"].includes(status.state)) router.refresh();
    } catch (error) {
      if (!controller.signal.aborted) setMessage(action === "connect"
        ? "The bank login could not be opened. Please try again."
        : error instanceof Error && error.name === "TimeoutError"
          ? "The update is taking longer than usual. Please try again in a minute."
          : syncFailure);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }, [router, onImported, syncFailure]);

  useEffect(() => {
    const action = bankAutomaticAction(connection, configured, mode, outcome);
    if (!action || started.current) return;
    const timer = setTimeout(() => {
      started.current = true;
      void run(action);
    }, 0);
    return () => clearTimeout(timer);
  }, [configured, connection, mode, outcome, run]);

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  return { busy, message, expired, renewal, lastSaved, run };
}
