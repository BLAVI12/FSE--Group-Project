import type { SupabaseClient } from "@supabase/supabase-js";
import { requiresProfileCompletion } from "./routes.ts";

export function hasCompleteNames(profile: {
  first_name: string | null;
  last_name: string | null;
} | null) {
  return Boolean(profile?.first_name?.trim() && profile?.last_name?.trim());
}

export function hasCompleteProfile(profile: {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
} | null) {
  return Boolean(profile?.username?.trim() && hasCompleteNames(profile));
}

// The profile page (including its save/logout actions) must remain accessible.
export async function profileAccessDecision(
  supabase: SupabaseClient,
  userId: string,
  pathname: string,
): Promise<"allow" | "complete" | "unavailable"> {
  if (!requiresProfileCompletion(pathname)) {
    return "allow";
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("username,first_name,last_name")
    .eq("id", userId)
    .single();
  if (error || !data) return "unavailable";
  return hasCompleteProfile(data) ? "allow" : "complete";
}
