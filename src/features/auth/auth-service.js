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

export function createAuthService(supabase) {
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
