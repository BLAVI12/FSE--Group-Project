-- One-off data fix for the demo login, run by hand in the SQL Editor. Not a
-- migration: it changes data, not the schema. Run it only after the team
-- agreed and AFTER `node scripts/clean-demo-bank-logins.mjs --apply` removed
-- the Demo Commerzbank login at Tink; otherwise the next sync brings the two
-- accounts and the "expired" status straight back.
--
-- 1. The two empty accounts came from the Demo Commerzbank login.
-- 2. The connection is reset from EXPIRED to ACTIVE: while it is EXPIRED the
--    app skips every sync (web/lib/tink.ts, prepareSync), so it would never
--    notice that only valid logins remain.

-- Check before: "Daily expenses" and "For holiday" with 0 transactions,
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

delete from public.accounts a
 using auth.users u
 where u.id = a.user_id
   and u.email = 'demo@example.com'
   and a.name in ('Daily expenses', 'For holiday')
   and not exists (select 1 from public.transactions t where t.account_id = a.id)
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
