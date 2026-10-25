import type { BankStatus } from "./tink.ts";

export type BankConnectionData = {
  status: "ACTIVE" | "EXPIRED" | "ERROR";
  live_sync_enabled: boolean;
  last_synced: string | null;
  /** Some accounts wait for a renewed bank login; the others keep syncing. */
  needs_renewal: boolean;
};

export function bankPhase(connection: BankConnectionData | null) {
  if (!connection?.live_sync_enabled) return "needs_setup";
  return connection.last_synced ? "ready" : "initial_import";
}

export function bankMenuLabel(connection: BankConnectionData | null) {
  if (!connection?.live_sync_enabled) return "Add bank";
  return connection.status === "EXPIRED" || connection.needs_renewal ? "Renew bank connection" : "Manage bank";
}

export const RENEWAL_NOTICE =
  "One of your bank logins needs to be renewed: its accounts keep their last saved data until you reconnect.";

/**
 * The latest update's message plus the renewal notice when only some bank
 * logins expired. The notice never replaces the message: a failed update must
 * stay visible.
 */
export function withRenewalNotice(message: string, renewal: boolean, busy: boolean) {
  if (!renewal || busy) return message;
  return message ? `${message} ${RENEWAL_NOTICE}` : RENEWAL_NOTICE;
}

export function bankAutomaticAction(
  connection: BankConnectionData | null,
  configured: boolean,
  mode: "background" | "management",
  outcome?: string,
): "sync" | "watch" | null {
  if (!configured || !connection?.live_sync_enabled || connection.status === "EXPIRED") return null;
  if (outcome === "already_connected") return null;
  if (outcome === "connected") return "watch";
  if (bankPhase(connection) === "initial_import") {
    return connection.status === "ERROR" ? null : "sync";
  }
  return mode === "background" ? "sync" : null;
}

export function bankImportReady(status: Pick<BankStatus, "connected" | "state" | "lastSynced">) {
  // A completed partial/empty import is valid too. A URL flag or a running
  // connection alone must never unlock the financial views.
  return status.connected && Boolean(status.lastSynced) && status.state !== "not_connected";
}
