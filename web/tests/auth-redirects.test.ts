import assert from "node:assert/strict";
import test from "node:test";
import {
  googleOAuthCallbackUrl,
  oauthErrorPath,
  safeInternalPath,
} from "../lib/auth/redirects.ts";

test("keeps an internal OAuth destination", () => {
  assert.equal(safeInternalPath("/dashboard?month=10"), "/dashboard?month=10");
});

test("rejects a protocol-relative destination", () => {
  assert.equal(safeInternalPath("//attacker.example"), "/dashboard");
});

test("rejects a backslash-based external destination", () => {
  assert.equal(safeInternalPath("/\\attacker.example"), "/dashboard");
});

test("uses the fallback when no destination is supplied", () => {
  assert.equal(safeInternalPath(null, "/"), "/");
});

test("builds a Google registration callback URL", () => {
  assert.equal(
    googleOAuthCallbackUrl("http://localhost:3000", "register"),
    "http://localhost:3000/auth/callback?next=%2Fdashboard&flow=register",
  );
});


test("builds a Google login callback URL that requests a bank refresh", () => {
  assert.equal(
    googleOAuthCallbackUrl("http://localhost:3000", "login"),
    "http://localhost:3000/auth/callback?next=%2Fdashboard%3Fbank%3Dlogin&flow=login",
  );
});

test("returns Google registration failures to registration", () => {
  assert.equal(oauthErrorPath("register"), "/register");
});

test("returns unknown Google flows to login", () => {
  assert.equal(oauthErrorPath("unexpected"), "/login");
});
