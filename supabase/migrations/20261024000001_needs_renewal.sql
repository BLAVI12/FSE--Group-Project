-- Whether at least one account of the connection is covered only by expired
-- bank logins at Tink. The other accounts keep syncing; status becomes
-- EXPIRED only when every account needs a renewed login (web/lib/tink.ts).
-- The bank page then offers Reconnect next to Refresh data.
alter table public.connections
    add column if not exists needs_renewal boolean not null default false;
