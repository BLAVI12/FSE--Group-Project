import type { SupabaseClient } from "@supabase/supabase-js";
import { profileGreeting } from "@/lib/greeting";

export async function UserGreeting({ supabase, userId }: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data, error } = await supabase.from("profiles")
    .select("first_name").eq("id", userId).single();
  return (
    <p className="mt-1 break-words text-sm text-slate-500 sm:ml-[50px]">
      {profileGreeting(error ? null : data?.first_name)}
    </p>
  );
}
