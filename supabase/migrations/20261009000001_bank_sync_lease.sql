-- A short, user-scoped lease replaces holding a database transaction open
-- while Tink is responding. The claim id fences out superseded workers.
-- Accept lease columns already created by the local prototype; version
-- 20261008000002 is reserved for the committed admin-management migration.
alter table public.connections
    add column if not exists sync_claim_id uuid,
    add column if not exists sync_expires_at timestamptz;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.connections'::regclass
          and conname = 'connections_sync_claim_check'
    ) then
        alter table public.connections
            add constraint connections_sync_claim_check check (
                (sync_claim_id is null) = (sync_expires_at is null)
            );
    end if;
end;
$$;

-- Only the server owns sync bookkeeping. Browser reads keep their existing
-- RLS policies, and no browser update permission is added.
