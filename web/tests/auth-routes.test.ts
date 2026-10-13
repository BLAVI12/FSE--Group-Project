import assert from "node:assert/strict";
import test from "node:test";
import { matchesRoute, protectedRoutes, guestOnlyRoutes, requiresProfileCompletion } from "../lib/auth/routes.ts";

test("shared routes match exact paths and descendants, not similar prefixes", () => {
  assert.equal(matchesRoute("/dashboard/admin", protectedRoutes), true);
  assert.equal(matchesRoute("/dashboard-other", protectedRoutes), false);
  assert.equal(matchesRoute("/register/extra", guestOnlyRoutes), true);
  assert.equal(matchesRoute("/register-other", guestOnlyRoutes), false);
});

test("profile completion leaves save/logout and callbacks available", () => {
  for (const path of ["/dashboard", "/dashboard/admin", "/register/extra", "/login", "/api/tink"]) {
    assert.equal(requiresProfileCompletion(path), true);
  }
  for (const path of ["/dashboard/profile", "/auth/callback", "/account-unavailable", "/", "/api-other"]) {
    assert.equal(requiresProfileCompletion(path), false);
  }
});
