import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminRoleForm } from "@/components/admin-role-form";
import { AdminStatusForm } from "@/components/admin-status-form";
import { BrandLink } from "@/components/brand/brand-link";
import { LogoutButton } from "@/components/logout-button";
import { loadAdminProfiles, ProfileDataError } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const filters = {
    search: value("q").slice(0, 100),
    role: ["user", "admin"].includes(value("role")) ? value("role") : "",
    status: ["active", "suspended"].includes(value("status")) ? value("status") : "",
    page: Math.min(100000, Math.max(1, Number.parseInt(value("page"), 10) || 1)),
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/admin");
  }

  let profiles;
  try {
    profiles = await loadAdminProfiles(supabase, user.id, filters);
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

  const { data: audit, error: auditError } = await supabase.from("admin_audit_log")
    .select("id,actor_id,target_id,action,old_value,new_value,reason,created_at")
    .order("created_at", { ascending: false }).order("id").limit(20);
  const pageUrl = (page: number) => `/dashboard/admin?${new URLSearchParams({
    q: filters.search, role: filters.role, status: filters.status, page: String(page),
  })}`;
  const formatDate = (date: string | null) => date ? new Date(date).toLocaleString("en-GB", { timeZone: "Europe/Berlin" }) : "Not available";

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

        <form className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">Username<input name="q" defaultValue={filters.search} maxLength={100} className="mt-1 block rounded-lg border border-slate-300 p-2" /></label>
          <label className="text-sm">Role<select name="role" defaultValue={filters.role} className="mt-1 block rounded-lg border border-slate-300 p-2"><option value="">All roles</option><option value="user">User</option><option value="admin">Admin</option></select></label>
          <label className="text-sm">Status<select name="status" defaultValue={filters.status} className="mt-1 block rounded-lg border border-slate-300 p-2"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
          <button className="rounded-full bg-emerald-700 px-5 py-2 text-white">Search</button>
          <Link href="/dashboard/admin" className="px-3 py-2 text-sm text-emerald-800">Reset</Link>
        </form>
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">User ID</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((profile) => {
                  const isCurrentUser = profile.id === user.id;

                  return (
                    <tr key={profile.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {profile.username ?? "Username not set"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Registered: {formatDate(profile.registered_at)}</p>
                        <p className="mt-1 text-xs text-slate-500">Last sign-in: {formatDate(profile.last_sign_in_at)} (Berlin)</p>
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
                          <AdminRoleForm key={profile.role}
                            userId={profile.id}
                            role={profile.role}
                          />
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="mb-2 text-sm capitalize">{profile.status}</p>
                        {!isCurrentUser && <AdminStatusForm key={profile.status} userId={profile.id} status={profile.status} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {profiles.length === 0 && <p className="mt-4">No matching users on this page.</p>}
        <nav aria-label="User list pages" className="mt-4 flex items-center gap-4 text-sm">
          {filters.page > 1 && <Link href={pageUrl(filters.page - 1)}>Previous</Link>}
          <span>Page {filters.page}</span>
          {profiles.length > 0 && filters.page * 20 < Number(profiles[0].total) && <Link href={pageUrl(filters.page + 1)}>Next</Link>}
        </nav>
        <section className="mt-10">
          <h2 className="text-xl font-bold">Latest admin actions</h2>
          <p className="mt-2 text-sm text-slate-600">Latest 20 actions. Times shown in Berlin time. Financial data is excluded.</p>
          {auditError ? <p role="alert">The admin log could not be loaded.</p> : (
            <ul className="mt-4 space-y-3">
              {(audit ?? []).map(entry => <li key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm break-words">
                <p>{entry.action}: {entry.old_value} → {entry.new_value} · {formatDate(entry.created_at)}</p>
                <p className="mt-1">Actor: {entry.actor_id} · User: {entry.target_id}</p>
                <p className="mt-1">Reason: {entry.reason}</p>
              </li>)}
              {audit?.length === 0 && <li>No admin actions recorded yet.</li>}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
