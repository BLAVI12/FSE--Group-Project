-- One-off data fix for the demo login, run by hand in the SQL Editor. Not a
-- migration: it changes data, not the schema. Run it only after the team
-- agreed and AFTER `node scripts/clean-demo-bank-logins.mjs --apply` removed
-- the Demo Commerzbank login at Tink; otherwise the next sync brings the two
-- accounts and the "expired" status straight back.
--
-- 1. The two accounts "Daily expenses" and "For holiday" came from the Demo
--    Commerzbank login.
-- 2. The connection is reset from EXPIRED to ACTIVE: while it is EXPIRED the
--    app skips every sync (web/lib/tink.ts, prepareSync), so it would never
--    notice that only valid logins remain.

-- Check before: "Daily expenses" and "For holiday" (planned: 0 transactions),
-- and the connection's status (EXPIRED).
select a.name, a.type,
       (select count(*) from public.transactions t where t.account_id = a.id) as transactions
  from public.accounts a
  join auth.users u on u.id = a.user_id
 where u.email = 'demo@example.com'
 order by a.name;

select c.status, c.live_sync_enabled, c.last_synced
  from public.connections c
  join auth.users u on u.id = c.user_id
 where u.email = 'demo@example.com' and c.provider = 'tink';

-- The fix, all or nothing.
begin;

-- As run on 16 October 2026. The planned guard was "no transactions", but each
-- account held two Demo Commerzbank test payments (+1.01/-1.01 EUR, May 2025),
-- saved when that login was renewed on 8 October. The guard run instead allows
-- at most two transactions per account, all booked before 2026. Deleting an
-- account also deletes its transactions and their category assignments
-- (on delete cascade).
delete from public.accounts a
 using auth.users u
 where u.id = a.user_id
   and u.email = 'demo@example.com'
   and a.name in ('Daily expenses', 'For holiday')
   and (select count(*) from public.transactions t where t.account_id = a.id) <= 2
   and not exists (select 1 from public.transactions t
                    where t.account_id = a.id and t.booked_date >= '2026-01-01')
returning a.name;

update public.connections c
   set status = 'ACTIVE'
  from auth.users u
 where u.id = c.user_id
   and u.email = 'demo@example.com'
   and c.provider = 'tink'
   and c.status = 'EXPIRED'
returning c.status;

commit;

-- Check after: run the two queries at the top again. Expected: only Girokonto
-- and Sparkonto, and status ACTIVE. Then open the dashboard as the demo user.
