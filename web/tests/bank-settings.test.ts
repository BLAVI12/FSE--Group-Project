import assert from "node:assert/strict";
import test from "node:test";
import { missingBankSettings } from "../lib/bank-settings.ts";

const certificate = [
  "-----BEGIN CERTIFICATE-----",
  "MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYw",
  "-----END CERTIFICATE-----",
].join("\n");

const live = {
  DATABASE_URL: "postgresql://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  DATABASE_CA_CERT: certificate,
  TINK_CLIENT_ID: "client-id",
  TINK_CLIENT_SECRET: "client-secret",
  TINK_REDIRECT_URI: "https://app.example/api/tink",
};

test("a complete live setup is usable", () => {
  assert.deepEqual(missingBankSettings(live), []);
});

test("a hosted database without the certificate is not usable", () => {
  assert.deepEqual(missingBankSettings({ ...live, DATABASE_CA_CERT: undefined }), ["DATABASE_CA_CERT"]);
  assert.deepEqual(missingBankSettings({ ...live, DATABASE_CA_CERT: "certificate" }), ["DATABASE_CA_CERT"]);
});

test("a database on this computer needs no certificate", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const env = { ...live, DATABASE_URL: `postgresql://postgres:pw@${host}:54322/postgres`, DATABASE_CA_CERT: undefined };
    assert.deepEqual(missingBankSettings(env), [], host);
  }
});

test("a misspelt name counts as missing, and only names are reported", () => {
  const { DATABASE_URL, ...rest } = live;
  const missing = missingBankSettings({ ...rest, DATA_BASE_URL: DATABASE_URL });
  assert.deepEqual(missing, ["DATABASE_URL"]);
  assert.ok(!JSON.stringify(missing).includes("pw"));
});

test("leaving Demo Bank test mode is not usable, as the bank route refuses it", () => {
  assert.deepEqual(missingBankSettings({ ...live, TINK_TEST_MODE: "false" }), ["TINK_TEST_MODE"]);
  assert.deepEqual(missingBankSettings({ ...live, TINK_TEST_MODE: "true" }), []);
});

test("a Tink timeout the route would reject is not usable", () => {
  for (const value of ["0", "-5", "1.5", "abc", ""]) {
    assert.deepEqual(missingBankSettings({ ...live, TINK_TIMEOUT_MS: value }), ["TINK_TIMEOUT_MS"], value);
  }
  assert.deepEqual(missingBankSettings({ ...live, TINK_TIMEOUT_MS: "20000" }), []);
});

test("empty values and an address that is not a URL are not usable", () => {
  assert.deepEqual(
    missingBankSettings({ ...live, TINK_CLIENT_ID: "", TINK_CLIENT_SECRET: "  " }),
    ["TINK_CLIENT_ID", "TINK_CLIENT_SECRET"],
  );
  assert.deepEqual(missingBankSettings({ ...live, DATABASE_URL: "not a url" }), ["DATABASE_URL"]);
});
