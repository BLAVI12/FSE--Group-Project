import assert from "node:assert/strict";
import test from "node:test";
import {
  bankLoginProblem,
  bankProblem,
  tinkLinkProblem,
  tinkRequestProblem,
  type BankProblemCode,
} from "../../supabase/functions/_shared/tink/errors.ts";

// User story US-4: a clear message when connecting or refreshing fails.

test("Demo Bank user 2: the bank rejects the login, the user can try again", () => {
  const problem = tinkLinkProblem({ error: "AUTHENTICATION_ERROR", error_reason: "STATIC_CREDENTIALS_INCORRECT" });
  assert.ok(problem && problem !== "cancelled");
  assert.equal(problem.code, "BANK_LOGIN_REJECTED");
  assert.equal(problem.action, "retry");
  assert.match(problem.message, /Nothing was saved/);
});

test("Demo Bank user 3: a temporary problem, the user tries again later", () => {
  const problem = tinkLinkProblem({ error: "TEMPORARY_ERROR" });
  assert.ok(problem && problem !== "cancelled");
  assert.equal(problem.code, "TEMPORARY_PROBLEM");
  assert.equal(problem.action, "retry_later");
  assert.match(problem.message, /data is unchanged/);
});

test("cancelling in Tink Link is not an error", () => {
  assert.equal(tinkLinkProblem({ error: "USER_CANCELLED", error_reason: "USER_DECLINED_CONSENT" }), "cancelled");
});

test("a successful return carries no problem", () => {
  assert.equal(tinkLinkProblem({}), null);
});

test("Tink's error is read from error_reason when error is missing", () => {
  assert.deepEqual(tinkLinkProblem({ error_reason: "AUTHENTICATION_ERROR" }), bankProblem("BANK_LOGIN_REJECTED"));
});

test("connecting a bank login that is already connected suggests a refresh", () => {
  const problem = tinkLinkProblem({ error: "BAD_REQUEST", error_reason: "INVALID_STATE_DUPLICATE_CREDENTIALS" });
  assert.deepEqual(problem, bankProblem("ALREADY_CONNECTED"));
});

test("any other Tink Link error gets the general message", () => {
  assert.deepEqual(
    tinkLinkProblem({ error: "BAD_REQUEST", error_reason: "INVALID_PARAMETER_CLIENT_ID" }),
    bankProblem("UNKNOWN")
  );
  assert.deepEqual(tinkLinkProblem({ error: "SOMETHING_NEW" }), bankProblem("UNKNOWN"));
});

test("Tink unreachable, slow or overloaded during a refresh is temporary", () => {
  for (const error of [
    { status: 504, code: "TINK_TIMEOUT" },
    { status: 503, code: "TINK_UNREACHABLE" },
    { status: 500, code: "INTERNAL_ERROR" },
    { status: 503, code: "TEMPORARY_ERROR" },
    { status: 429, code: "HTTP_429" },
  ]) {
    assert.equal(tinkRequestProblem(error).code, "TEMPORARY_PROBLEM", error.code);
  }
});

test("a rejected Tink request that is not temporary gets the general message", () => {
  assert.equal(tinkRequestProblem({ status: 400, code: "BAD_REQUEST" }).code, "UNKNOWN");
  assert.equal(tinkRequestProblem({ status: 404, code: "HTTP_404" }).code, "UNKNOWN");
});

test("an expired or broken bank login asks the user to reconnect", () => {
  for (const status of ["SESSION_EXPIRED", "AUTHENTICATION_ERROR", "PERMANENT_ERROR", "DELETED"]) {
    assert.deepEqual(bankLoginProblem(status), bankProblem("RECONNECT_NEEDED"), status);
  }
});

test("a bank login that works or is still in progress is not a problem", () => {
  for (const status of ["UPDATED", "UPDATING", "AUTHENTICATING", "AWAITING_SUPPLEMENTAL_INFORMATION", "CREATED"]) {
    assert.equal(bankLoginProblem(status), null, status);
  }
  assert.equal(bankLoginProblem(undefined), null);
  assert.equal(bankLoginProblem("TEMPORARY_ERROR")?.code, "TEMPORARY_PROBLEM");
});

test("every message is plain language: no codes, no Tink jargon", () => {
  const codes: BankProblemCode[] = [
    "BANK_LOGIN_REJECTED",
    "TEMPORARY_PROBLEM",
    "RECONNECT_NEEDED",
    "ALREADY_CONNECTED",
    "NO_ACCOUNTS",
    "CONNECT_EXPIRED",
    "UNKNOWN",
  ];
  for (const code of codes) {
    const { message } = bankProblem(code);
    assert.ok(message.length > 20, code);
    assert.doesNotMatch(message, /[A-Z]{2,}_[A-Z]+|Tink|error/i, code);
  }
});
