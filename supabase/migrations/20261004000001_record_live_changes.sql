-- Records the changes made by hand to the hosted database (SQL Editor) after
-- migration 008, so that the migrations describe the hosted database again.
-- Compared against the hosted schema on 4 October 2026.
--
-- Every statement is idempotent. On the hosted database, where these changes
-- already exist, running this file changes nothing; on a fresh database it
-- builds the same schema.

-- 1. Inserts that leave out amount_exact get it from the integer cents. The
--    Tink sync and seed.sql write cents only, and migration 008 made
--    amount_exact required, so without this every such insert fails.
create or replace function public.transactions_fill_exact_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.amount_exact is null then
        new.amount_exact := new.amount::numeric / 100;
    end if;
    return new;
end;
$$;

create or replace trigger transactions_fill_exact_amount
    before insert on public.transactions
    for each row execute function public.transactions_fill_exact_amount();

-- 2. Sync bookkeeping on the connection.
alter table public.connections
    add column if not exists live_sync_enabled boolean not null default false,
    add column if not exists sync_attempted_at timestamptz;

-- 3. A connection always keeps its permanent Tink user. Migration 008 had made
--    this optional; the hosted database still requires it.
alter table public.connections
    alter column tink_external_user_id set not null;
