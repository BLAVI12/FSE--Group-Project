import type { SupabaseClient } from "@supabase/supabase-js";

export function hasCompleteNames(profile: {
  first_name: string | null;
  last_name: string | null;
} | null) {
  return Boolean(profile?.first_name?.trim() && profile?.last_name?.trim());
}

// The profile page (including its save/logout actions) must remain accessible.
export async function profileAccessDecision(
  supabase: SupabaseClient,
  userId: string,
  pathname: string,
): Promise<"allow" | "complete" | "unavailable"> {
  const needsCheck =
    (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) &&
    pathname !== "/dashboard/profile";
  if (!needsCheck && pathname !== "/login" && pathname !== "/register" && !pathname.startsWith("/api/")) {
    return "allow";
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name,last_name")
    .eq("id", userId)
    .single();
  if (error || !data) return "unavailable";
  return hasCompleteNames(data) ? "allow" : "complete";
}
