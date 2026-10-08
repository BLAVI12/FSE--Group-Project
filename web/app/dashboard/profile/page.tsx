import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { ProfileForm } from "@/components/profile-form";
import { loadOwnProfile, ProfileDataError } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/profile");
  }

  let profile;
  try {
    profile = await loadOwnProfile(supabase, user.id);
  } catch (error) {
    if (!(error instanceof ProfileDataError)) {
      throw error;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="max-w-lg rounded-2xl border border-red-400/30 bg-red-400/10 p-8 text-center">
          <h1 className="text-2xl font-bold">Profile unavailable</h1>
          <p className="mt-3 text-slate-300">
            We could not load your profile. Please try again after the database
            migration has been applied.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-lg bg-white px-4 py-2 font-semibold text-slate-950"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <Link href="/" className="text-xl font-bold">
              Student Finance Planner
            </Link>
            <p className="mt-1 text-sm text-slate-400">
              Signed in as {user.email ?? user.id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              Overview
            </Link>
            <Link
              href="/dashboard/transactions"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              Transactions
            </Link>
            <Link
              href="/dashboard/profile"
              aria-current="page"
              className="rounded-lg bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-300"
            >
              Profile
            </Link>
            {profile.role === "admin" ? (
              <Link
                href="/dashboard/admin"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                Admin
              </Link>
            ) : null}
            <LogoutButton className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10" />
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 pb-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
          Account settings
        </p>
        <h1 className="mt-2 text-3xl font-bold">Your profile</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Manage the personal details associated with your finance planner
          account.
        </p>

        <ProfileForm profile={profile} email={user.email ?? "Not available"} />
      </div>
    </main>
  );
}

