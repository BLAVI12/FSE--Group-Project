import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLink } from "@/components/brand/brand-link";
import { LogoutButton } from "@/components/logout-button";
import { ProfileForm } from "@/components/profile-form";
import { loadOwnProfile, ProfileDataError } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";
import { hasCompleteNames } from "@/lib/auth/profile-completion";
import { profileGreeting } from "@/lib/greeting";

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
      <main className="flex min-h-screen items-center justify-center bg-[#fbfcfa] px-6 text-slate-900">
        <div className="max-w-lg rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Profile unavailable
          </h1>
          <p className="mt-3 text-slate-700">
            We could not load your profile. Please try again after the database
            migration has been applied.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-full bg-emerald-700 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fbfcfa] text-slate-900">
      <header className="border-b border-slate-100 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <BrandLink />
            <p className="mt-1 break-words text-sm text-slate-500 sm:ml-[50px]">
              {profileGreeting(profile.first_name)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
              Overview
            </Link>
            <Link
              href="/dashboard/transactions"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
              Transactions
            </Link>
            <Link
              href="/dashboard/profile"
              aria-current="page"
              className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
            >
              Profile
            </Link>
            {profile.role === "admin" ? (
              <Link
                href="/dashboard/admin"
                className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
              >
                Admin
              </Link>
            ) : null}
            <LogoutButton className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700" />
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 pb-16">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">
          Account settings
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Your profile
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Manage the personal details associated with your finance planner
          account.
        </p>

        {!hasCompleteNames(profile) && (
          <p role="status" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            Please enter your first and last name and save your profile before continuing to the dashboard.
          </p>
        )}
        <ProfileForm profile={profile} email={user.email ?? "Not available"} />
      </div>
    </main>
  );
}
