const INTERNAL_ORIGIN = "https://internal.invalid";

export type GoogleAuthFlow = "login" | "register";

export function googleOAuthCallbackUrl(
  origin: string,
  flow: GoogleAuthFlow,
) {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", "/dashboard");
  callbackUrl.searchParams.set("flow", flow);
  return callbackUrl.toString();
}

export function oauthErrorPath(flow: string | null) {
  return flow === "register" ? "/register" : "/login";
}

export function safeInternalPath(
  candidate: string | null,
  fallback = "/dashboard",
) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(candidate, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
