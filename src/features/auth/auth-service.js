export class AuthenticationError extends Error {
  constructor(message, code = "authentication_failed", cause) {
    super(message, { cause });
    this.name = "AuthenticationError";
    this.code = code;
  }
}

function normalizedCredentials({ email, password } = {}) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new AuthenticationError("Enter a valid email address.", "invalid_email");
  }

  if (typeof password !== "string" || password.length === 0) {
    throw new AuthenticationError("Enter your password.", "missing_password");
  }

  return { email: normalizedEmail, password };
}

function toAuthenticationError(error) {
  if (error?.code === "invalid_credentials") {
    return new AuthenticationError(
      "Invalid email or password.",
      "invalid_credentials",
      error
    );
  }

  return new AuthenticationError(
    "Login is currently unavailable. Please try again.",
    error?.code ?? "authentication_failed",
    error
  );
}

function browserOrigin() {
  return globalThis.location?.origin ?? null;
}

function sameOriginRedirect(redirectTo, appOrigin) {
  if (!appOrigin) {
    throw new AuthenticationError(
      "The application URL is not configured.",
      "missing_app_origin"
    );
  }

  let origin;
  let redirectUrl;

  try {
    origin = new URL(appOrigin).origin;
    redirectUrl = new URL(redirectTo ?? "/auth/callback", origin);
  } catch (error) {
    throw new AuthenticationError(
      "The login redirect URL is invalid.",
      "invalid_redirect_url",
      error
    );
  }

  if (redirectUrl.origin !== origin) {
    throw new AuthenticationError(
      "The login redirect must use the application origin.",
      "invalid_redirect_url"
    );
  }

  return redirectUrl.toString();
}

export function createAuthService(supabase, { appOrigin = browserOrigin() } = {}) {
  if (!supabase?.auth) {
    throw new TypeError("A Supabase client with an auth API is required.");
  }

  return {
    async signIn(credentials) {
      const { data, error } = await supabase.auth.signInWithPassword(
        normalizedCredentials(credentials)
      );

      if (error) {
        throw toAuthenticationError(error);
      }

      return {
        user: data.user,
        session: data.session
      };
    },

    async signInWithGoogle({ redirectTo } = {}) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: sameOriginRedirect(redirectTo, appOrigin)
        }
      });

      if (error) {
        throw new AuthenticationError(
          "Google login is currently unavailable. Please try again.",
          error.code ?? "oauth_start_failed",
          error
        );
      }

      return data;
    },

    async signOut() {
      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error) {
        throw new AuthenticationError(
          "Logout failed. Please try again.",
          error.code ?? "logout_failed",
          error
        );
      }
    },

    async getCurrentUser() {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        throw toAuthenticationError(error);
      }

      return data.user ?? null;
    },

    onAuthStateChange(callback) {
      return supabase.auth.onAuthStateChange(callback);
    }
  };
}
