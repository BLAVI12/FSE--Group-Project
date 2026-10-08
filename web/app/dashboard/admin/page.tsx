import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminRoleForm } from "@/components/admin-role-form";
import { BrandLink } from "@/components/brand/brand-link";
import { LogoutButton } from "@/components/logout-button";
import { loadAdminProfiles, ProfileDataError } from "@/lib/data/profile";
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
      <main className="flex min-h-screen items-center justify-center bg-[#fbfcfa] px-6 text-slate-900">
        <div className="max-w-lg rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            User management unavailable
          </h1>
          <p className="mt-3 text-slate-700">
            The profile list could not be loaded. Please try again.
          </p>
          <Link
            href="/dashboard/profile"
            className="mt-6 inline-block rounded-full bg-emerald-700 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
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
    <main className="min-h-screen bg-[#fbfcfa] text-slate-900">
      <header className="border-b border-slate-100 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <BrandLink />
            <p className="mt-1 break-all text-sm text-slate-500 sm:ml-[50px]">
              Signed in as {user.email ?? user.id}
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
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
              Profile
            </Link>
            <Link
              href="/dashboard/admin"
              aria-current="page"
              className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
            >
              Admin
            </Link>
            <LogoutButton className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700" />
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 pb-16">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">
          Restricted area
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          User management
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Manage application roles. Admin access does not grant access to other
          users&apos; bank accounts or transactions.
        </p>

        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">User ID</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((profile) => {
                  const fullName = [profile.first_name, profile.last_name]
                    .filter(Boolean)
                    .join(" ");
                  const isCurrentUser = profile.id === user.id;

                  return (
                    <tr key={profile.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {profile.username ?? "Username not set"}
                        </p>
                        {fullName ? (
                          <p className="mt-1 text-slate-500">{fullName}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">
                        {profile.id}
                      </td>
                      <td className="px-5 py-4">
                        {isCurrentUser ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold capitalize text-emerald-800">
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
