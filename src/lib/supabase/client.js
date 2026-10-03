import { createClient } from "@supabase/supabase-js";

function required(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

/**
 * Creates the browser-side Supabase client.
 *
 * Pass only a publishable/anon key here. A service-role key must never be
 * exposed to browser code.
 */
export function createSupabaseBrowserClient({ url, publishableKey }) {
  return createClient(
    required(url, "Supabase URL"),
    required(publishableKey, "Supabase publishable key"),
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  );
}
