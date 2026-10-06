import assert from "node:assert/strict";
import test from "node:test";

import { AuthenticationError } from "../src/features/auth/auth-service.js";
import { completeOAuthCallback } from "../src/features/auth/oauth-callback.js";

function callbackClient(overrides = {}) {
  return {
    auth: {
      exchangeCodeForSession: async () => ({
        data: { session: { access_token: "token" } },
        error: null
      }),
      getUser: async () => ({
        data: { user: { id: "user-1" } },
        error: null
      }),
      ...overrides
    }
  };
}

test("callback exchanges the code and returns a verified user", async () => {
  let receivedCode;
  const client = callbackClient({
    exchangeCodeForSession: async (code) => {
      receivedCode = code;
      return { data: { session: { access_token: "token" } }, error: null };
    }
  });

  const result = await completeOAuthCallback(
    client,
    "https://financial-planner.example/auth/callback?code=oauth-code&next=/dashboard"
  );

  assert.equal(receivedCode, "oauth-code");
  assert.equal(result.user.id, "user-1");
  assert.equal(result.session.access_token, "token");
  assert.equal(result.redirectTo, "/dashboard");
});

test("callback rejects a missing authorization code", async () => {
  await assert.rejects(
    completeOAuthCallback(
      callbackClient(),
      "https://financial-planner.example/auth/callback"
    ),
    (error) =>
      error instanceof AuthenticationError && error.code === "missing_oauth_code"
  );
});

test("callback reports when the user cancels Google login", async () => {
  await assert.rejects(
    completeOAuthCallback(
      callbackClient(),
      "https://financial-planner.example/auth/callback?error=access_denied"
    ),
    (error) =>
      error instanceof AuthenticationError && error.code === "oauth_cancelled"
  );
});

test("callback does not expose provider errors from the code exchange", async () => {
  const client = callbackClient({
    exchangeCodeForSession: async () => ({
      data: null,
      error: { code: "bad_code", message: "Sensitive provider details" }
    })
  });

  await assert.rejects(
    completeOAuthCallback(
      client,
      "https://financial-planner.example/auth/callback?code=expired-code"
    ),
    (error) =>
      error instanceof AuthenticationError &&
      error.code === "bad_code" &&
      error.message === "Google login could not be completed."
  );
});

test("callback replaces an external next destination with the home page", async () => {
  const result = await completeOAuthCallback(
    callbackClient(),
    "https://financial-planner.example/auth/callback?code=oauth-code&next=//attacker.example"
  );

  assert.equal(result.redirectTo, "/");
});
