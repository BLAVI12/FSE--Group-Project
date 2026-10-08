import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminRoleForm } from "@/components/admin-role-form";
import { LogoutButton } from "@/components/logout-button";
import {
  loadAdminProfiles,
  ProfileDataError,
} from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/admin");
  }

  let profiles;
  try {
    profiles = await loadAdminProfiles(supabase, user.id);
  } catch (error) {
    if (!(error instanceof ProfileDataError)) {
      throw error;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="max-w-lg rounded-2xl border border-red-400/30 bg-red-400/10 p-8 text-center">
          <h1 className="text-2xl font-bold">User management unavailable</h1>
          <p className="mt-3 text-slate-300">
            The profile list could not be loaded. Please try again.
          </p>
          <Link
            href="/dashboard/profile"
            className="mt-6 inline-block rounded-lg bg-white px-4 py-2 font-semibold text-slate-950"
          >
            Back to profile
          </Link>
        </div>
      </main>
    );
  }

  if (!profiles) {
    notFound();
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
              href="/dashboard/profile"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              Profile
            </Link>
            <Link
              href="/dashboard/admin"
              aria-current="page"
              className="rounded-lg bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-300"
            >
              Admin
            </Link>
            <LogoutButton className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10" />
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 pb-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
          Restricted area
        </p>
        <h1 className="mt-2 text-3xl font-bold">User management</h1>
        <p className="mt-2 max-w-3xl text-slate-400">
          Manage application roles. Admin access does not grant access to other
          users&apos; bank accounts or transactions.
        </p>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">User ID</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {profiles.map((profile) => {
                  const fullName = [profile.first_name, profile.last_name]
                    .filter(Boolean)
                    .join(" ");
                  const isCurrentUser = profile.id === user.id;

                  return (
                    <tr key={profile.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-white">
                          {profile.username ?? "Username not set"}
                        </p>
                        {fullName ? (
                          <p className="mt-1 text-slate-400">{fullName}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-400">
                        {profile.id}
                      </td>
                      <td className="px-5 py-4">
                        {isCurrentUser ? (
                          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold capitalize text-emerald-300">
                            {profile.role} · you
                          </span>
                        ) : (
                          <AdminRoleForm
                            userId={profile.id}
                            role={profile.role}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

