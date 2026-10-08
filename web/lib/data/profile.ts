import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole = "user" | "admin";

export type Profile = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileWithRole = Profile & { role: AppRole };

const profileColumns =
  "id,username,first_name,last_name,street,postal_code,city,country_code,created_at,updated_at";

export class ProfileDataError extends Error {}

export async function loadOwnProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileWithRole> {
  const [profileResult, roleResult] = await Promise.all([
    supabase.from("profiles").select(profileColumns).eq("id", userId).single(),
    supabase.from("user_roles").select("role").eq("user_id", userId).single(),
  ]);

  if (profileResult.error || roleResult.error) {
    throw new ProfileDataError("The profile could not be loaded.");
  }

  return {
    ...(profileResult.data as Profile),
    role: roleResult.data.role as AppRole,
  };
}

export async function loadAdminProfiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileWithRole[] | null> {
  const { data: ownRole, error: ownRoleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (ownRoleError || ownRole?.role !== "admin") {
    return null;
  }

  const [profilesResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select(profileColumns).order("created_at"),
    supabase.from("user_roles").select("user_id,role"),
  ]);

  if (profilesResult.error || rolesResult.error) {
    throw new ProfileDataError("The user list could not be loaded.");
  }

  const roles = new Map(
    rolesResult.data.map((entry) => [entry.user_id, entry.role as AppRole]),
  );

  return (profilesResult.data as Profile[]).map((profile) => ({
    ...profile,
    role: roles.get(profile.id) ?? "user",
  }));
}

