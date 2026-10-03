import assert from "node:assert/strict";
import test from "node:test";
import { safeInternalPath } from "../lib/auth/redirects.ts";

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
