-- 004_one_connection_per_user.sql
--
-- 1. User access tokens are never stored (ADR-0008): the backend mints a
--    short-lived token from the permanent Tink user for every sync and keeps it
--    in memory only. The columns 001 created for a stored token are therefore
--    always empty, and their presence contradicts the design.
--
-- 2. With a permanent Tink user, one user token covers every bank that Tink
--    user has linked, so a connection row is "this app user's link to their
--    Tink user", not one bank consent. A re-link or an additional bank updates
--    that single row, and accounts are matched onto it by IBAN.

alter table connections
    drop column if exists access_token,
    drop column if exists token_expires;

alter table connections
    add constraint connections_one_per_user unique (user_id);

-- The unique constraint brings its own index on user_id.
drop index if exists connections_user_idx;
