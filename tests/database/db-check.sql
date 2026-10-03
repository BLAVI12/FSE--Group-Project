-- Database-level guarantees, checked as the database owner (the role the
-- backend uses): demo data loaded, user_id derived from the parent, a row
-- cannot belong to a different user than its parent, one IBAN per user, and
-- deleting a login deletes its data. Everything runs in a transaction that is
-- rolled back, so the data is left untouched.
--
-- Against a local Supabase after `supabase db reset`:
--   docker exec -i supabase_db_<project> psql -U postgres < tests/database/db-check.sql
\set ON_ERROR_STOP on
begin;

-- Counts and ownership.
select 'counts' as check,
       (select count(*) from auth.users where id = '00000000-0000-4000-8000-000000000001') as demo_login,
       (select count(*) from accounts)     as accounts,
       (select count(*) from transactions) as transactions,
       (select count(*) from transactions where is_transfer) as transfers,
       (select count(*) from transactions where user_id <> '00000000-0000-4000-8000-000000000001') as foreign_rows,
       (select to_regclass('public.users') is null) as users_table_gone;

-- The trigger fills user_id from the parent, even when the caller gives a wrong one.
insert into transactions (account_id, provider_transaction_id, amount, description, booked_date, status, user_id)
select id, 'trigger-check', -100, 'trigger check', '2026-10-03', 'BOOKED', gen_random_uuid()
  from accounts where name = 'Girokonto';
select 'trigger' as check,
       (select user_id = '00000000-0000-4000-8000-000000000001'
          from transactions where provider_transaction_id = 'trigger-check') as user_id_from_parent;

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
select 'cascade' as check,
       (select count(*) from connections)  as connections_left,
       (select count(*) from accounts)     as accounts_left,
       (select count(*) from transactions) as transactions_left;

rollback;
