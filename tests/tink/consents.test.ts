import assert from "node:assert/strict";
import test from "node:test";
import {
  accountsNeedingRelink,
  consentIsHealthy,
  credentialsToRenew,
  failedLoginsToRemove,
  needsRelink,
} from "../../supabase/functions/_shared/tink/consents.ts";

// Ported from the test build (minimal-slice/test/mapping.test.ts), where these
// rules were worked out against the live Tink sandbox.

const now = Date.UTC(2026, 9, 3);

test("only states the user must fix need a re-link; Tink retries temporary errors itself", () => {
  for (const status of ["SESSION_EXPIRED", "AUTHENTICATION_ERROR", "PERMANENT_ERROR", "DELETED"]) {
    assert.equal(needsRelink(status), true, status);
  }
  for (const status of ["UPDATED", "UPDATING", "TEMPORARY_ERROR", undefined]) {
    assert.equal(needsRelink(status), false, String(status));
  }
});

test("a consent is unhealthy when Tink says so or its session has expired", () => {
  assert.equal(consentIsHealthy({ status: "UPDATED", sessionExpiryDate: now + 86_400_000 }, now), true);
  assert.equal(consentIsHealthy({ status: "TEMPORARY_ERROR" }, now), true);
  assert.equal(consentIsHealthy({ status: "SESSION_EXPIRED" }, now), false);
  assert.equal(consentIsHealthy({ status: "AUTHENTICATION_ERROR" }, now), false);
  // Status still UPDATED, but the consent has lapsed: Tink flips the status only on the next refresh.
  assert.equal(consentIsHealthy({ status: "UPDATED", sessionExpiryDate: now - 1 }, now), false);
  assert.equal(consentIsHealthy({ status: "UPDATED", sessionExpiryDate: String(now - 1) }, now), false);
});

test("an account needs a re-link only when every consent covering it is unhealthy", () => {
  const expired = { status: "SESSION_EXPIRED", accountIds: ["giro", "spar"] };
  const fresh = { status: "UPDATED", accountIds: ["giro"], sessionExpiryDate: now + 1000 };
  const failedLogin = { status: "AUTHENTICATION_ERROR", accountIds: [] }; // e.g. a Demo Bank user 2 attempt

  // Old expired consent next to a fresh re-link: only the Sparkonto is left uncovered.
  assert.deepEqual(accountsNeedingRelink([expired, fresh], ["giro", "spar"], now), ["spar"]);
  // A failed login with no accounts does not expire a working connection.
  assert.deepEqual(accountsNeedingRelink([fresh, failedLogin], ["giro"], now), []);
  // No consent mentions the account: no evidence either way, leave it alone.
  assert.deepEqual(accountsNeedingRelink([], ["giro"], now), []);
});

test("the login to renew is an unhealthy consent covering an account that needs it", () => {
  const consents = [
    { credentialsId: "fresh", accountIds: ["giro"], status: "UPDATED" },
    { credentialsId: "lapsed", accountIds: ["giro", "spar"], status: "SESSION_EXPIRED" },
  ];
  assert.equal(credentialsToRenew(consents, ["giro", "spar"], now), "lapsed");
  assert.equal(credentialsToRenew([{ credentialsId: "ok", accountIds: ["giro"], status: "UPDATED" }], ["giro"], now), null);
});

test("only failed logins without accounts are removed before a new connect", () => {
  const ids = failedLoginsToRemove([
    { credentialsId: "user2", status: "AUTHENTICATION_ERROR", accountIds: [] },
    { credentialsId: "user3", status: "TEMPORARY_ERROR" },
    { credentialsId: "gone", status: "PERMANENT_ERROR", accountIds: [] },
    { credentialsId: "user1", status: "UPDATED", accountIds: ["giro"] },
    { credentialsId: "has-data", status: "AUTHENTICATION_ERROR", accountIds: ["giro"] }, // deleting would delete data
    { credentialsId: "in-progress", status: "AUTHENTICATING", accountIds: [] },
  ]);
  assert.deepEqual(ids, ["user2", "user3", "gone"]);
});
