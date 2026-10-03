-- 20261003000006_enable_rls.sql
--
-- Supabase exposes every table in the public schema through its Data API,
-- using the publishable key that ships in the frontend. Tables created with
-- SQL start with row level security (RLS) off, so until this runs anyone with
-- that key could read and change every row.
--
-- With RLS on and no policies yet, the Data API sees nothing. The dashboard,
-- the SQL Editor and server-side connections as the postgres role are not
-- affected. "Own rows only" policies follow once tables are linked to
-- Supabase Auth users.

alter table users        enable row level security;
alter table connections  enable row level security;
alter table accounts     enable row level security;
alter table transactions enable row level security;
alter table oauth_states enable row level security;
