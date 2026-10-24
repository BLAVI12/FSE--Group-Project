import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bankPhase, bankMenuLabel, bankAutomaticAction, bankImportReady, type BankConnectionData } from "../lib/bank-connection-state.ts";
import { bankAccessDecision, bankAccessProblem } from "../lib/auth/bank-access.ts";
import { loadOwnBankConnection, BankDataError } from "../lib/data/bank.ts";
import { requiresBankSetup } from "../lib/auth/routes.ts";
import { dashboardNavigationItems } from "../lib/dashboard-navigation.ts";

const ready: BankConnectionData = { status: "ACTIVE", live_sync_enabled: true, last_synced: "2026-10-13T10:00:00Z", needs_renewal: false };
const first: BankConnectionData = { ...ready, last_synced: null };

function client(data: unknown, error: object | null = null, rejects = false) {
  const calls: unknown[] = [];
  const query = {
    select(columns: string) { calls.push(columns); return query; },
    eq(column: string, value: string) { calls.push([column, value]); return query; },
    async maybeSingle() { if (rejects) throw new Error("Private upstream details"); return { data, error }; },
  };
  return { calls, supabase: { from(table: string) { calls.push(table); return query; } } as unknown as SupabaseClient };
}

test("no connection and seeded sample rows require bank setup", () => {
  assert.equal(bankPhase(null), "needs_setup");
  assert.equal(bankPhase({ ...ready, live_sync_enabled: false }), "needs_setup");
  assert.equal(bankPhase(first), "initial_import");
  assert.equal(bankPhase(ready), "ready");
});

test("later expiry and refresh errors preserve financial access, first-import errors do not unlock it", async () => {
  for (const status of ["ACTIVE", "EXPIRED", "ERROR"] as const) {
    assert.equal(bankPhase({ ...ready, status }), "ready");
    assert.equal(await bankAccessDecision(client({ ...ready, status }).supabase, "own-user", "/dashboard"), "allow");
    assert.equal(await bankAccessDecision(client({ ...first, status }).supabase, "own-user", "/dashboard"), "setup");
  }
});

test("bank loader reads only the signed-in user's own Tink metadata", async () => {
  const { supabase, calls } = client(ready);
  assert.deepEqual(await loadOwnBankConnection(supabase, "own-user"), ready);
  assert.deepEqual(calls, ["connections", "status,live_sync_enabled,last_synced,needs_renewal", ["user_id", "own-user"], ["provider", "tink"]]);
});

test("failed and malformed reads are unavailable, never a new-user or ready state", async () => {
  for (const input of [client(null, { message: "Private DB message" }), client(null, null, true),
    client({ ...ready, last_synced: "" }), client({ ...ready, live_sync_enabled: "true" }), client({ ...ready, needs_renewal: null }), client({ ...ready, status: "UNKNOWN" })]) {
    assert.equal(await bankAccessDecision(input.supabase, "own-user", "/dashboard"), "unavailable");
    await assert.rejects(loadOwnBankConnection(input.supabase, "own-user"), BankDataError);
  }
});

test("financial routes, exports and signed-in guest pages enforce setup", async () => {
  for (const path of ["/dashboard", "/dashboard/", "/dashboard/transactions", "/dashboard/transactions/nested", "/api/transactions/export", "/api/transactions/id", "/login", "/register"]) {
    assert.equal(requiresBankSetup(path), true);
    assert.equal(await bankAccessDecision(client(null).supabase, "own-user", path), "setup");
  }
});

test("bank setup, Tink callback/status/actions, profile, logout and admin never create a bank redirect loop", async () => {
  for (const path of ["/dashboard/bank", "/dashboard/profile", "/dashboard/admin", "/api/tink", "/auth/callback", "/account-unavailable", "/", "/dashboard-other", "/api/transactions-other"]) {
    const { supabase, calls } = client(null, { message: "Should not be read" });
    assert.equal(requiresBankSetup(path), false);
    assert.equal(await bankAccessDecision(supabase, "own-user", path), "allow");
    assert.deepEqual(calls, []);
  }
});

test("financial APIs use JSON setup errors and distinguish unavailable metadata", () => {
  assert.deepEqual(bankAccessProblem("setup"), { status: 403, body: {
    error: "Please finish connecting your bank before using transactions.", code: "BANK_SETUP_REQUIRED", setupUrl: "/dashboard/bank",
  } });
  assert.equal(bankAccessProblem("unavailable").status, 503);
  assert.equal(bankAccessProblem("unavailable").body.code, "BANK_UNAVAILABLE");
});

test("dropdown labels reflect setup, management and renewal without trusting transaction counts", () => {
  assert.equal(bankMenuLabel(null), "Add bank");
  assert.equal(bankMenuLabel({ ...ready, live_sync_enabled: false }), "Add bank");
  assert.equal(bankMenuLabel(first), "Manage bank");
  assert.equal(bankMenuLabel(ready), "Manage bank");
  assert.equal(bankMenuLabel({ ...ready, status: "ERROR" }), "Manage bank");
  assert.equal(bankMenuLabel({ ...ready, status: "EXPIRED" }), "Renew bank connection");
  assert.equal(bankMenuLabel({ ...ready, needs_renewal: true }), "Renew bank connection");
});

test("onboarding hides financial tabs but retains existing admin navigation", () => {
  assert.deepEqual(dashboardNavigationItems("bank", false, false), []);
  assert.deepEqual(dashboardNavigationItems("profile", true, false), [
    { page: "admin", label: "Admin", href: "/dashboard/admin", active: false },
  ]);
  assert.equal(dashboardNavigationItems("bank", false, true).length, 2);
});

test("automatic sync stays on dashboard; management does not silently refresh an established bank", () => {
  assert.equal(bankAutomaticAction(ready, true, "background"), "sync");
  assert.equal(bankAutomaticAction(ready, true, "management"), null);
  assert.equal(bankAutomaticAction(ready, true, "management", "connected"), "watch");
  assert.equal(bankAutomaticAction(first, true, "management", "connected"), "watch");
  assert.equal(bankAutomaticAction(first, true, "management"), "sync");
  assert.equal(bankAutomaticAction({ ...first, status: "ERROR" }, true, "management"), null);
  for (const mode of ["background", "management"] as const) {
    assert.equal(bankAutomaticAction(null, true, mode, "connected"), null);
    assert.equal(bankAutomaticAction(ready, false, mode), null);
    assert.equal(bankAutomaticAction({ ...ready, status: "EXPIRED" }, true, mode), null);
    assert.equal(bankAutomaticAction(ready, true, mode, "already_connected"), null);
  }
});

test("only a recorded initial import unlocks onboarding, including partial/empty results", () => {
  for (const state of ["synced", "partial", "error", "expired", "syncing"] as const) {
    assert.equal(bankImportReady({ connected: true, state, lastSynced: ready.last_synced }), true);
    assert.equal(bankImportReady({ connected: true, state, lastSynced: null }), false);
  }
  assert.equal(bankImportReady({ connected: false, state: "not_connected", lastSynced: ready.last_synced }), false);
});
