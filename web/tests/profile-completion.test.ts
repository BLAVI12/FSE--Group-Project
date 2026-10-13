import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCompleteNames, hasCompleteProfile, profileAccessDecision } from "../lib/auth/profile-completion.ts";

function client(data: { username?: string | null; first_name: string | null; last_name: string | null } | null, error: object | null = null) {
  const calls: unknown[] = [];
  const query = {
    select(columns: string) { calls.push(columns); return query; },
    eq(column: string, value: string) { calls.push([column, value]); return query; },
    async single() { return { data: data ? { username: "ada", ...data } : null, error }; },
  };
  return { calls, supabase: { from(table: string) { calls.push(table); return query; } } as unknown as SupabaseClient };
}

test("both persisted names are required, not Google display-name metadata", () => {
  assert.equal(hasCompleteNames({ first_name: "Ada", last_name: "Lovelace" }), true);
  for (const data of [null, { first_name: "Ada", last_name: null }, { first_name: " ", last_name: "Name" }]) {
    assert.equal(hasCompleteNames(data), false);
  }
});

test("missing names gate dashboard, nested pages, guest routes and APIs", async () => {
  for (const path of ["/dashboard", "/dashboard/admin", "/dashboard/transactions", "/login", "/register", "/api/tink"]) {
    const { supabase, calls } = client({ first_name: "Ada", last_name: null });
    assert.equal(await profileAccessDecision(supabase, "own-user", path), "complete");
    assert.deepEqual(calls, ["profiles", "username,first_name,last_name", ["id", "own-user"]]);
  }
});

test("names alone are insufficient: a username is required for dashboard access", async () => {
  const profile = { username: null, first_name: "Ada", last_name: "Lovelace" };
  assert.equal(hasCompleteProfile(profile), false);
  assert.equal(hasCompleteProfile({ ...profile, username: " " }), false);
  assert.equal(hasCompleteProfile({ ...profile, username: "ada" }), true);
  assert.equal(await profileAccessDecision(client(profile).supabase, "own-user", "/dashboard"), "complete");
});

test("profile save/logout and public/OAuth routes do not create a redirect loop", async () => {
  for (const path of ["/dashboard/profile", "/", "/auth/callback", "/account-unavailable"]) {
    const { supabase, calls } = client(null);
    assert.equal(await profileAccessDecision(supabase, "own-user", path), "allow");
    assert.deepEqual(calls, []);
  }
});

test("complete profiles can continue; profile read errors fail closed", async () => {
  assert.equal(await profileAccessDecision(client({ first_name: "Ada", last_name: "Lovelace" }).supabase, "own-user", "/dashboard"), "allow");
  assert.equal(await profileAccessDecision(client(null, { message: "Unavailable" }).supabase, "own-user", "/dashboard"), "unavailable");
});
