import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        <p className="mt-3 text-slate-400">
          Signed in as {user.email ?? user.id}.
        </p>

        <div className="mt-8 flex items-center gap-4">
          <Link
            href="/"
            className="text-emerald-300 hover:text-emerald-200"
          >
            Return home
          </Link>

          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
