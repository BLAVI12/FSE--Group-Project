// Log only known codes. Error messages, URLs, SQL details and upstream bodies
// can contain credentials or bank data and must never reach the log.
const knownCodes = new Set([
  "NOT_CONFIGURED", "UNSAFE_AMOUNT", "DEMO_MODE_REQUIRED",
  "MISSING_CATEGORY_SEED", "NOT_CONNECTED", "NOTHING_TO_RENEW",
  "INVALID_STATE", "RECONNECT_REQUIRED", "LINK_FAILED", "INVALID_CALLBACK",
  "NO_ACCOUNTS", "TINK_TIMEOUT", "TINK_UNREACHABLE", "EMPTY_RESPONSE", "UNEXPECTED_RESPONSE",
  "NO_REFRESHABLE_BANK", "BANK_RECONNECT_REQUIRED", "BANK_REFRESH_FAILED", "BANK_REFRESH_NOT_ALLOWED",
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "ERR_INVALID_URL", "ERR_INVALID_PROTOCOL",
  "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID",
]);

const configMessages = new Map([
  ["TINK_CLIENT_ID is not set", "MISSING_TINK_CLIENT_ID"],
  ["TINK_CLIENT_SECRET is not set", "MISSING_TINK_CLIENT_SECRET"],
  ["TINK_REDIRECT_URI is not set", "MISSING_TINK_REDIRECT_URI"],
  ["TINK_TIMEOUT_MS must be a positive integer", "INVALID_TINK_TIMEOUT_MS"],
]);

// Tink's machine-readable reasons only. Free-form bank messages may contain
// customer data and must never be copied into logs.
const bankReasons = new Set([
  "UNKNOWN_ERROR", "TINK_INTERNAL_SERVER_ERROR", "OPERATION_NOT_SUPPORTED",
  "AUTHENTICATION_METHOD_NOT_SUPPORTED", "PROVIDER_UNAVAILABLE", "LICENSED_PARTY_REJECTED",
  "THIRD_PARTY_AUTHENTICATION_UNAVAILABLE", "STATIC_CREDENTIALS_INCORRECT",
  "DYNAMIC_CREDENTIALS_INCORRECT", "DYNAMIC_CREDENTIALS_FLOW_CANCELLED", "DYNAMIC_CREDENTIALS_FLOW_TIMEOUT",
  "USER_NOT_A_CUSTOMER", "USER_CONCURRENT_LOGINS", "USER_BLOCKED", "ACTION_NOT_PERMITTED",
  "SESSION_EXPIRED", "USER_ACTION_REQUIRED_UNSIGNED_AGREEMENT", "USER_ACTION_REQUIRED", "NO_ACCOUNTS",
]);

export function bankErrorDetails(error: unknown): { code: string; reason?: string } {
  const code = bankErrorCode(error);
  const reason = typeof error === "object" && error !== null && "reason" in error ? error.reason : undefined;
  return typeof reason === "string" && bankReasons.has(reason) ? { code, reason } : { code };
}

/** A safe, actionable server-log code, including wrapped network errors. */
export function bankErrorCode(error: unknown): string {
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 4; depth++) {
    if (typeof error !== "object" || error === null || seen.has(error)) break;
    seen.add(error);
    const record = error as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
    if (typeof record.code === "string") {
      if (knownCodes.has(record.code)) return record.code;
      // SQLSTATE is a five-character machine code. Exclude arbitrary Tink
      // error codes, which are supplied by an external response body.
      if (record.name !== "TinkError" && /^[0-9A-Z]{5}$/.test(record.code))
        return `POSTGRES_${record.code}`;
      if (record.name === "TinkError" && /^HTTP_[1-5][0-9]{2}$/.test(record.code))
        return record.code;
    }
    // An unrecognised Tink code is still a Tink failure. Never label it as a
    // database/configuration error or copy its arbitrary upstream text.
    if (record.name === "TinkError") return "TINK_ERROR";
    if (typeof record.message === "string") {
      const configCode = configMessages.get(record.message);
      if (configCode) return configCode;
    }
    error = record.cause;
  }
  return "DATABASE_OR_CONFIGURATION_ERROR";
}
