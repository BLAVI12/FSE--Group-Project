"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut({
    scope: "local",
  });

  if (error) {
    throw new Error("Unable to sign out. Please try again.");
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
