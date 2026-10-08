"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";

export type RoleFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function updateUserRole(
  targetUserId: string,
  _previousState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/admin");
  }

  const role = String(formData.get("role") ?? "") as AppRole;
  if (role !== "user" && role !== "admin") {
    return { status: "error", message: "Choose a valid role." };
  }

  if (targetUserId === user.id) {
    return {
      status: "error",
      message: "You cannot change your own admin role.",
    };
  }

  const { data: ownRole, error: ownRoleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (ownRoleError || ownRole?.role !== "admin") {
    return { status: "error", message: "Admin access is required." };
  }

  const { error } = await supabase.rpc("admin_manage_user", {
    p_target: targetUserId, p_field: "role", p_value: role,
    p_reason: "Application role changed by administrator.",
  });

  if (error) {
    return {
      status: "error",
      message: "The role could not be updated.",
    };
  }

  revalidatePath("/dashboard/admin");
  return { status: "success", message: "Role updated." };
}

export async function updateUserStatus(
  targetUserId: string,
  _previousState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/admin");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (targetUserId === user.id || !["active", "suspended"].includes(status)
      || reason.length < 1 || reason.length > 500 || formData.get("confirmed") !== "on") {
    return { status: "error", message: "Confirm the change and enter a reason (1–500 characters)." };
  }
  const { error } = await supabase.rpc("admin_manage_user", {
    p_target: targetUserId, p_field: "status", p_value: status, p_reason: reason,
  });
  if (error) return { status: "error", message: "The account status could not be updated. Active admin access is required." };
  revalidatePath("/dashboard/admin");
  return { status: "success", message: "Account status updated." };
}
