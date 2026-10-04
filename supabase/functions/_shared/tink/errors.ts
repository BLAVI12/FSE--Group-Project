/**
 * What the user is told when connecting or refreshing a bank fails (user
 * story US-4). Pure, like convert.ts: Tink's error codes in; a stable code, a
 * plain message and the one thing the user can do out.
 *
 * This decides only what to say. Whether anything is saved is the flow's job:
 * a failed connect saves nothing, and a failed refresh leaves the last data in
 * place, because the sync writes all-or-nothing (ADR-0016). The messages
 * promise exactly that.
 *
 * Tink's own codes and texts are for the logs, never for the user.
 */

export type BankProblemCode =
  | "BANK_LOGIN_REJECTED"
  | "TEMPORARY_PROBLEM"
  | "RECONNECT_NEEDED"
  | "ALREADY_CONNECTED"
  | "NO_ACCOUNTS"
  | "CONNECT_EXPIRED"
  | "UNKNOWN";

/** What the user can do about it; the frontend shows the matching button. */
export type UserAction = "retry" | "retry_later" | "reconnect" | "refresh";

export interface BankProblem {
  code: BankProblemCode;
  message: string;
  action: UserAction;
}

const PROBLEMS: Record<BankProblemCode, Omit<BankProblem, "code">> = {
  BANK_LOGIN_REJECTED: {
    message: "Your bank did not accept the login. Check your details and try again. Nothing was saved.",
    action: "retry",
  },
  TEMPORARY_PROBLEM: {
    message:
      "Your bank or our banking partner has a temporary problem. Your data is unchanged. Please try again later.",
    action: "retry_later",
  },
  RECONNECT_NEEDED: {
    message:
      "Your bank access has ended. Banks require you to renew it regularly. Reconnect your bank to keep your transactions up to date.",
    action: "reconnect",
  },
  ALREADY_CONNECTED: {
    message: "This bank login is already connected. Refresh it to get the latest transactions.",
    action: "refresh",
  },
  NO_ACCOUNTS: {
    message: "Your bank returned no accounts, so nothing was saved.",
    action: "retry",
  },
  CONNECT_EXPIRED: {
    message: "This connection attempt expired or was already used. Please start again.",
    action: "retry",
  },
  UNKNOWN: {
    message: "Something went wrong with your bank connection. Your data is unchanged. Please try again.",
    action: "retry",
  },
};

export function bankProblem(code: BankProblemCode): BankProblem {
  return { code, ...PROBLEMS[code] };
}

/** The error fields Tink Link adds to the redirect back to our app. */
export interface TinkLinkResult {
  error?: string;
  error_reason?: string;
}

/**
 * The outcome of a Tink Link round trip, from its redirect parameters:
 * null when Tink reported no error, "cancelled" when the user backed out
 * (Tink: not an error, so no error message), otherwise the problem.
 *
 * Demo Bank user 2 (wrong login) returns AUTHENTICATION_ERROR, user 3
 * TEMPORARY_ERROR.
 */
export function tinkLinkProblem(result: TinkLinkResult): BankProblem | "cancelled" | null {
  const error = result.error ?? result.error_reason;
  if (!error) return null;
  if (error === "USER_CANCELLED") return "cancelled";
  if (error === "AUTHENTICATION_ERROR") return bankProblem("BANK_LOGIN_REJECTED");
  if (error === "TEMPORARY_ERROR") return bankProblem("TEMPORARY_PROBLEM");
  // Tink refuses a bank login it already has for this user. The connect flow
  // removes failed logins before each attempt, so this one is a working
  // connection.
  if (error === "BAD_REQUEST" && result.error_reason === "INVALID_STATE_DUPLICATE_CREDENTIALS") {
    return bankProblem("ALREADY_CONNECTED");
  }
  return bankProblem("UNKNOWN");
}

/**
 * A failed Tink API call. `code` is what the Tink client puts on its errors:
 * Tink's error field, or TINK_TIMEOUT / TINK_UNREACHABLE when no answer came.
 */
export function tinkRequestProblem(error: { status: number; code: string }): BankProblem {
  const temporary =
    error.code === "TINK_TIMEOUT" ||
    error.code === "TINK_UNREACHABLE" ||
    error.code === "TEMPORARY_ERROR" ||
    error.status === 429 ||
    error.status >= 500;
  return bankProblem(temporary ? "TEMPORARY_PROBLEM" : "UNKNOWN");
}

// Bank login states only the user can recover from, by reconnecting. Under
// PSD2 access lapses after 90 to 180 days, so SESSION_EXPIRED is routine.
const NEEDS_RECONNECT = new Set(["SESSION_EXPIRED", "AUTHENTICATION_ERROR", "PERMANENT_ERROR", "DELETED"]);

/**
 * The problem with an existing bank login, from its Tink status, or null if
 * it is fine or still in progress. TEMPORARY_ERROR is not the user's to fix:
 * Tink retries it.
 */
export function bankLoginProblem(status: string | undefined): BankProblem | null {
  if (status && NEEDS_RECONNECT.has(status)) return bankProblem("RECONNECT_NEEDED");
  if (status === "TEMPORARY_ERROR") return bankProblem("TEMPORARY_PROBLEM");
  return null;
}
