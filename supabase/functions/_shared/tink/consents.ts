/**
 * Rules about the health of a user's bank logins at Tink ("provider
 * consents", GET /api/v1/provider-consents). Pure, like convert.ts: no
 * network, no database.
 *
 * Under PSD2 a consent lapses after 90 to 180 days, so an expired consent is
 * a normal state, not an error: the user renews it through Tink's
 * update-consent flow. Both rules below were found against the live sandbox
 * with the test build (minimal-slice).
 */

/** One bank login of the Tink user, as GET /api/v1/provider-consents lists it. */
export interface TinkProviderConsent {
  credentialsId?: string;
  providerName?: string;
  accountIds?: string[];
  status?: string;
  sessionExpiryDate?: number | string;
}

// States only the user can recover from, by reconnecting. TEMPORARY_ERROR is
// not one of them: Tink retries those itself.
const NEEDS_RELINK = new Set(["SESSION_EXPIRED", "AUTHENTICATION_ERROR", "PERMANENT_ERROR", "DELETED"]);

/** Whether a bank login in this state can only be fixed by the user reconnecting. */
export function needsRelink(status: string | undefined): boolean {
  return status !== undefined && NEEDS_RELINK.has(status);
}

export function consentIsHealthy(consent: TinkProviderConsent, now: number): boolean {
  if (needsRelink(consent.status)) return false;
  // Tink only flips the status to SESSION_EXPIRED on the next refresh after
  // expiry, so the expiry date is checked as well.
  const expiry = Number(consent.sessionExpiryDate);
  return !(Number.isFinite(expiry) && expiry <= now);
}

/**
 * Tink account ids whose data no healthy consent covers any more.
 *
 * Several consents can cover the same account (an old expired one next to a
 * fresh re-link), and failed logins leave consents with no accounts at all.
 * So an account needs a re-link only when every consent covering it is
 * unhealthy. Accounts no consent mentions are left alone: no information is
 * not evidence of expiry.
 */
export function accountsNeedingRelink(
  consents: TinkProviderConsent[],
  providerAccountIds: string[],
  now = Date.now()
): string[] {
  return providerAccountIds.filter((id) => {
    const covering = consents.filter((c) => c.accountIds?.includes(id));
    return covering.length > 0 && !covering.some((c) => consentIsHealthy(c, now));
  });
}

/**
 * How many of the accounts need a re-link: "none", "some" (the others still
 * have a healthy login and keep syncing) or "all" (nothing can be updated
 * until the user reconnects).
 */
export function relinkScope(
  consents: TinkProviderConsent[],
  providerAccountIds: string[],
  now = Date.now()
): "none" | "some" | "all" {
  const needing = accountsNeedingRelink(consents, providerAccountIds, now).length;
  return needing === 0 ? "none" : needing === providerAccountIds.length ? "all" : "some";
}

/**
 * The bank login to send through Tink's update-consent flow: an unhealthy
 * consent covering one of the accounts that need a re-link. null if none.
 */
export function credentialsToRenew(
  consents: TinkProviderConsent[],
  providerAccountIds: string[],
  now = Date.now()
): string | null {
  const needing = new Set(accountsNeedingRelink(consents, providerAccountIds, now));
  const consent = consents.find(
    (c) => c.credentialsId && !consentIsHealthy(c, now) && c.accountIds?.some((id) => needing.has(id))
  );
  return consent?.credentialsId ?? null;
}

// End states of a login attempt that failed. In-progress states (AUTHENTICATING,
// AWAITING_*, UPDATING) are left alone: the user may still be finishing them.
const FAILED_LOGIN = new Set(["AUTHENTICATION_ERROR", "TEMPORARY_ERROR", "PERMANENT_ERROR"]);

/**
 * Bank logins to delete before a new connect attempt
 * (DELETE /api/v1/credentials/{id}): those that failed and never produced an
 * account. Tink keeps them, and a retry of the same login is then refused as
 * a duplicate (error_reason INVALID_STATE_DUPLICATE_CREDENTIALS). A login that
 * has accounts is never selected: deleting it would delete that data at Tink.
 */
export function failedLoginsToRemove(consents: TinkProviderConsent[]): string[] {
  return consents
    .filter((c) => c.credentialsId && c.status && FAILED_LOGIN.has(c.status) && !c.accountIds?.length)
    .map((c) => c.credentialsId as string);
}

/**
 * Bank logins of the named providers, to delete by hand (maintenance, not part
 * of the app). Returns null, so nothing is deleted, unless at least one other
 * login stays that is healthy and has accounts: a clean-up must never leave the
 * user without a working bank connection. Deleting a login also deletes its
 * data at Tink; the transactions saved in our database stay.
 */
export function loginsToRemoveByProvider(
  consents: TinkProviderConsent[],
  providers: string[],
  now = Date.now()
): string[] | null {
  const remove = consents.filter(
    (c) => c.credentialsId && c.providerName !== undefined && providers.includes(c.providerName)
  );
  const keep = consents.filter((c) => !remove.includes(c));
  const workingLoginStays = keep.some((c) => consentIsHealthy(c, now) && (c.accountIds?.length ?? 0) > 0);
  return workingLoginStays ? remove.map((c) => c.credentialsId as string) : null;
}
