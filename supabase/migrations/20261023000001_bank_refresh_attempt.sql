-- When the bank itself was last asked for new data ("Refresh data" or the
-- scheduled sync, web/app/api/cron/bank-sync). sync_attempted_at cannot tell:
-- it also moves on every dashboard visit, which only re-reads the copy Tink
-- already has. The scheduled sync allows one bank refresh per six-hour slot
-- based on this column.
alter table public.connections
    add column if not exists bank_refresh_attempted_at timestamptz;
