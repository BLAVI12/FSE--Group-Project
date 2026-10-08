export function SupabaseSetupNotice() {
  return (
    <div
      role="status"
      className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"
    >
      Sign-in is not configured yet. Add your Supabase project URL and
      publishable key to <code>web/.env.local</code>, then restart the dev
      server.
    </div>
  );
}
