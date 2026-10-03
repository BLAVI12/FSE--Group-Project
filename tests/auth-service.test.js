import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthenticationError,
  createAuthService
} from "../src/features/auth/auth-service.js";

function clientWith(overrides = {}) {
  return {
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: "user-1" }, session: { access_token: "token" } },
        error: null
      }),
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: {} } }),
      ...overrides
    }
  };
}

test("signIn normalizes the email and returns user and session", async () => {
  let receivedCredentials;
  const auth = createAuthService(
    clientWith({
      signInWithPassword: async (credentials) => {
        receivedCredentials = credentials;
        return {
          data: { user: { id: "user-1" }, session: { access_token: "token" } },
          error: null
        };
      }
    })
  );

  const result = await auth.signIn({
    email: "  USER@Example.com ",
    password: "secret-password"
  });

  assert.deepEqual(receivedCredentials, {
    email: "user@example.com",
    password: "secret-password"
  });
  assert.equal(result.user.id, "user-1");
  assert.equal(result.session.access_token, "token");
});

test("signIn rejects malformed input before calling Supabase", async () => {
  let called = false;
  const auth = createAuthService(
    clientWith({
      signInWithPassword: async () => {
        called = true;
        return { data: null, error: null };
      }
    })
  );

  await assert.rejects(
    auth.signIn({ email: "not-an-email", password: "secret-password" }),
    (error) => error instanceof AuthenticationError && error.code === "invalid_email"
  );
  assert.equal(called, false);
});

test("signIn exposes a generic invalid-credentials message", async () => {
  const auth = createAuthService(
    clientWith({
      signInWithPassword: async () => ({
        data: null,
        error: { code: "invalid_credentials", message: "Provider-specific message" }
      })
    })
  );

  await assert.rejects(
    auth.signIn({ email: "user@example.com", password: "wrong" }),
    (error) =>
      error instanceof AuthenticationError &&
      error.code === "invalid_credentials" &&
      error.message === "Invalid email or password."
  );
});

test("signOut only ends the current local session", async () => {
  let options;
  const auth = createAuthService(
    clientWith({
      signOut: async (receivedOptions) => {
        options = receivedOptions;
        return { error: null };
      }
    })
  );

  await auth.signOut();

  assert.deepEqual(options, { scope: "local" });
});

test("getCurrentUser asks Supabase to verify the user", async () => {
  const auth = createAuthService(clientWith());

  assert.deepEqual(await auth.getCurrentUser(), { id: "user-1" });
});
