-- Before 20261024000001_needs_renewal, one expired bank login marked the whole
-- connection EXPIRED, and an EXPIRED connection is never synced again. Set
-- those connections back to ACTIVE once, so the next sync decides again with
-- the per-account rule (web/lib/tink.ts): one whose accounts all need a renewed
-- login, or whose Tink user is gone, becomes EXPIRED again on that sync; one
-- that still has a healthy login keeps syncing and gets needs_renewal. No bank
-- data is changed here. Connections with a legacy shared Tink identity are left
-- out; the app expires them without contacting Tink.
-- Apply only once the app code of the same pull request is deployed: the
-- previous code would expire the reset connections again.
update public.connections
   set status = 'ACTIVE'
 where provider = 'tink'
   and status = 'EXPIRED'
   and live_sync_enabled
   and tink_external_user_id = user_id::text;
