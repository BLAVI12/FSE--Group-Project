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
export type AdminUser = {
  id: string;
  username: string | null;
  role: AppRole;
  status: "active" | "suspended";
  registered_at: string | null;
  last_sign_in_at: string | null;
  total: number;
};

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
  filters: { search: string; role: string; status: string; page: number },
): Promise<AdminUser[] | null> {
  const { data: ownRole, error: ownRoleError } = await supabase
    .from("user_roles")
    .select("role,status")
    .eq("user_id", userId)
    .single();

  if (ownRoleError || ownRole?.role !== "admin" || ownRole.status !== "active") {
    return null;
  }

  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: filters.search, p_role: filters.role, p_status: filters.status, p_page: filters.page,
  });
  if (error) {
    throw new ProfileDataError("The user list could not be loaded.");
  }

  return (data ?? []).map((entry: Omit<AdminUser, "id"> & { user_id: string }) => ({ ...entry, id: entry.user_id }));
}
