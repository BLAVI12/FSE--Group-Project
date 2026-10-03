import { AuthenticationError } from "./auth-service.js";

function safeInternalDestination(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

/**
 * Completes the browser PKCE flow after Supabase redirects back to the app.
 * The caller remains responsible for navigating to the returned destination.
 */
export async function completeOAuthCallback(supabase, callbackUrl) {
  if (!supabase?.auth) {
    throw new TypeError("A Supabase client with an auth API is required.");
  }

  let url;

  try {
    url = new URL(callbackUrl);
  } catch (error) {
    throw new AuthenticationError(
      "The login callback URL is invalid.",
      "invalid_callback_url",
      error
    );
  }

  const providerError = url.searchParams.get("error");
  if (providerError) {
    throw new AuthenticationError(
      providerError === "access_denied"
        ? "Google login was cancelled."
        : "Google login could not be completed.",
      providerError === "access_denied" ? "oauth_cancelled" : "oauth_callback_failed"
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    throw new AuthenticationError(
      "The login callback does not contain an authorization code.",
      "missing_oauth_code"
    );
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    throw new AuthenticationError(
      "Google login could not be completed.",
      error.code ?? "oauth_exchange_failed",
      error
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new AuthenticationError(
      "The signed-in user could not be verified.",
      userError?.code ?? "user_verification_failed",
      userError
    );
  }

  return {
    user: userData.user,
    session: data.session,
    redirectTo: safeInternalDestination(url.searchParams.get("next"))
  };
}
