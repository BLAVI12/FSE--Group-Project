import assert from "node:assert/strict";
import test from "node:test";
import { dashboardNavigationItems } from "../lib/dashboard-navigation.ts";

test("primary navigation keeps overview and transactions, not profile or logout", () => {
  assert.deepEqual(dashboardNavigationItems("overview"), [
    { page: "overview", label: "Overview", href: "/dashboard", active: true },
    { page: "transactions", label: "Transactions", href: "/dashboard/transactions", active: false },
  ]);
});

test("transactions marks only its own tab active", () => {
  assert.deepEqual(dashboardNavigationItems("transactions").map((item) => item.active), [false, true]);
});

test("profile does not incorrectly highlight a primary tab", () => {
  assert.ok(dashboardNavigationItems("profile").every((item) => !item.active));
});

test("existing admin link is opt-in and marked active on the admin page", () => {
  assert.equal(dashboardNavigationItems("admin").length, 2);
  assert.deepEqual(dashboardNavigationItems("admin", true).at(-1), {
    page: "admin", label: "Admin", href: "/dashboard/admin", active: true,
  });
  assert.equal(dashboardNavigationItems("profile", true).at(-1)?.active, false);
});
