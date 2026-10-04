-- Database-level guarantees, checked as the database owner (the role the
-- backend uses): demo data loaded, user_id derived from the parent, a row
-- cannot belong to a different user than its parent, one IBAN per user, and
-- deleting a login deletes its data. Everything runs in a transaction that is
-- rolled back, so the data is left untouched. Every check raises an error
-- when it fails, so psql exits non-zero (CI runs this file).
--
-- Only against a fresh local Supabase (the counts are those of seed.sql):
--   psql "$DB_URL" -f tests/database/db-check.sql
\set ON_ERROR_STOP on
begin;

-- Counts and ownership.
do $$
declare
  demo_login   bigint := (select count(*) from auth.users where id = '00000000-0000-4000-8000-000000000001');
  accounts     bigint := (select count(*) from public.accounts);
  transactions bigint := (select count(*) from public.transactions);
  transfers    bigint := (select count(*) from public.transactions where is_transfer);
  foreign_rows bigint := (select count(*) from public.transactions
                           where user_id <> '00000000-0000-4000-8000-000000000001');
begin
  if (demo_login, accounts, transactions, transfers, foreign_rows) <> (1, 2, 3534, 152, 0)
     or to_regclass('public.users') is not null then
    raise exception 'FAIL: seed data: % demo login, % accounts, % transactions, % transfers, % rows of another user',
      demo_login, accounts, transactions, transfers, foreign_rows;
  end if;
  raise notice 'PASS: seed loaded: 1 demo login, 2 accounts, 3534 transactions, 152 transfers, all owned by the demo login';
end $$;

-- The trigger fills user_id from the parent, even when the caller gives a wrong one.
insert into transactions (account_id, provider_transaction_id, amount, description, booked_date, status, user_id)
select id, 'trigger-check', -100, 'trigger check', '2026-10-03', 'BOOKED', gen_random_uuid()
  from accounts where name = 'Girokonto';
do $$
begin
  if (select user_id from transactions where provider_transaction_id = 'trigger-check')
     is distinct from '00000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL: user_id was not taken from the account';
  end if;
  raise notice 'PASS: user_id is filled in from the account, even when the caller gives a wrong one';
end $$;

-- A row's user_id cannot be changed to disagree with its account.
savepoint s1;
do $$
begin
  update transactions set user_id = gen_random_uuid() where provider_transaction_id = 'trigger-check';
  raise exception 'FAIL: user_id could be changed to disagree with the account';
exception when foreign_key_violation then
  raise notice 'PASS: user_id cannot disagree with the account (composite foreign key)';
end $$;
rollback to savepoint s1;

-- One IBAN per user.
do $$
begin
  insert into accounts (connection_id, provider_account_id, iban, name, type)
  select connection_id, 'duplicate-check', iban, 'Duplicate', 'CHECKING'
    from accounts where name = 'Girokonto';
  raise exception 'FAIL: a second account with the same IBAN was accepted';
exception when unique_violation then
  raise notice 'PASS: a second account with the same IBAN is refused';
end $$;

-- Deleting the login removes all of that user's data (cascade).
delete from auth.users where id = '00000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from connections) or exists (select 1 from accounts)
     or exists (select 1 from transactions) then
    raise exception 'FAIL: data was left behind after deleting the login';
  end if;
  raise notice 'PASS: deleting the login deletes its connection, accounts and transactions';
end $$;

rollback;
