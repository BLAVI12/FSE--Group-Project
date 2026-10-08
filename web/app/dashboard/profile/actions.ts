"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  profileValuesFromFormData,
  validateProfile,
  type ProfileFormState,
} from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/profile");
  }

  const validation = validateProfile(profileValuesFromFormData(formData));
  if (!validation.ok) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      errors: validation.errors,
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update(validation.data)
    .eq("id", user.id);

  if (error?.code === "23505") {
    return {
      status: "error",
      message: "That username is already in use.",
      errors: { username: "Choose a different username." },
    };
  }

  if (error) {
    return {
      status: "error",
      message: "Your profile could not be saved. Please try again.",
    };
  }

  revalidatePath("/dashboard/profile");
  return { status: "success", message: "Profile saved." };
}

