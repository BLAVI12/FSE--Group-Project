import assert from "node:assert/strict";
import test from "node:test";
import { bankErrorCode, bankErrorDetails } from "../lib/bank-error.ts";
import { tinkConfigFromEnv, TinkError } from "../../supabase/functions/_shared/tink/client.ts";

test("bank logs retain database and TLS codes without exposing error content", () => {
  for (const code of ["28P01", "42501", "42703", "42P01", "XX000", "SELF_SIGNED_CERT_IN_CHAIN", "ENOTFOUND"]) {
    const error = Object.assign(new Error("postgres://user:fake-secret@private-host/db"), {
      code, detail: "fake-token and customer account data", query: "sensitive query",
    });
    const result = bankErrorCode(error);
    assert.equal(result, code.length === 5 ? `POSTGRES_${code}` : code);
    assert.doesNotMatch(result, /fake-secret|fake-token|private-host|sensitive/);
  }
});

test("bank logs identify missing Tink settings and invalid timeout through the actual config reader", () => {
  const values: Record<string, string> = {
    TINK_CLIENT_ID: "fake-client", TINK_CLIENT_SECRET: "fake-secret",
    TINK_REDIRECT_URI: "http://localhost:3000/api/tink",
  };
  for (const name of Object.keys(values)) {
    assert.throws(() => tinkConfigFromEnv((key) => key === name ? undefined : values[key]),
      (error) => bankErrorCode(error) === `MISSING_${name}`);
  }
  assert.throws(() => tinkConfigFromEnv((key) => key === "TINK_TIMEOUT_MS" ? "" : values[key]),
    (error) => bankErrorCode(error) === "INVALID_TINK_TIMEOUT_MS");
});

test("bank logs unwrap network causes and stop at cyclic errors", () => {
  const cause = Object.assign(new Error("fake-password"), { code: "ECONNREFUSED" });
  assert.equal(bankErrorCode(new Error("fetch failed", { cause })), "ECONNREFUSED");
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  assert.equal(bankErrorCode(cycle), "DATABASE_OR_CONFIGURATION_ERROR");
});

test("bank logs redact arbitrary upstream codes, messages and non-error values", () => {
  for (const error of [null, "fake-secret", new Error("fake-secret"),
    { code: "fake-token", detail: "bank data" }]) {
    assert.equal(bankErrorCode(error), "DATABASE_OR_CONFIGURATION_ERROR");
  }
  for (const error of [
    new TinkError("fake-password", 502, "fake-token"),
    new TinkError("fake-password", 502, "ABCDE")]) {
    assert.equal(bankErrorCode(error), "TINK_ERROR");
  }
  for (const code of ["EMPTY_RESPONSE", "UNEXPECTED_RESPONSE"])
    assert.deepEqual(bankErrorDetails(new TinkError("fake-secret", 502, code)), { code, status: 502 });
  assert.equal(bankErrorCode(new TinkError("fake-token", 401, "HTTP_401")), "HTTP_401");
  assert.deepEqual(bankErrorDetails(new TinkError("fake-token", 503, "BANK_REFRESH_FAILED", undefined, "fake-secret")),
    { code: "BANK_REFRESH_FAILED", status: 503 });
  assert.deepEqual(bankErrorDetails(new TinkError("fake-token", 503, "BANK_REFRESH_FAILED", undefined, "LICENSED_PARTY_REJECTED")),
    { code: "BANK_REFRESH_FAILED", reason: "LICENSED_PARTY_REJECTED", status: 503 });
  assert.deepEqual(bankErrorDetails(new TinkError("fake-token", 400, "invalid_grant", undefined, undefined, "oauth-token")),
    { code: "invalid_grant", status: 400, operation: "oauth-token" });
  const malformed = Object.assign(new TinkError("fake-token", NaN, "fake-secret"), {
    operation: "https://example.invalid/?token=fake-secret",
  });
  assert.deepEqual(bankErrorDetails(malformed), { code: "TINK_ERROR" });
});
