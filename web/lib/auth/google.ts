import { createClient } from "@/lib/supabase/client";
import {
  googleOAuthCallbackUrl,
  type GoogleAuthFlow,
} from "@/lib/auth/redirects";

export async function startGoogleOAuth(flow: GoogleAuthFlow) {
  const supabase = createClient();

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: googleOAuthCallbackUrl(window.location.origin, flow),
    },
  });
}
