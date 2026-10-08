export function SupabaseSetupNotice() {
  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      Sign-in is not configured yet. Add your Supabase project URL and
      publishable key to <code>web/.env.local</code>, then restart the dev
      server.
    </div>
  );
}
