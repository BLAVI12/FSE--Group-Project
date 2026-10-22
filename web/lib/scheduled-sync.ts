import { createHash, timingSafeEqual } from "node:crypto";

// The day has four slots of six hours (UTC). Each user gets at most one
// scheduled sync per slot, so at most four a day, however often the schedule
// fires. PSD2 allows a bank four refreshes a day without the user present.
export const SYNC_SLOT_HOURS = 6;

/** The start of the six-hour slot that contains `at`. */
export function syncSlotStart(at: Date) {
  const slot = new Date(at);
  slot.setUTCHours(Math.floor(at.getUTCHours() / SYNC_SLOT_HOURS) * SYNC_SLOT_HOURS, 0, 0, 0);
  return slot;
}

// A short secret could be guessed; the route then refuses to run at all.
export function scheduledSyncConfigured(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}

/** Checks `Authorization: Bearer <CRON_SECRET>` without leaking its length or content. */
export function scheduledSyncAuthorized(header: string | null, secret: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header.slice("Bearer ".length)), hash(secret));
}
