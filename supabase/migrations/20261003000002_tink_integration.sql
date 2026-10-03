-- Durable, single-use OAuth state for the Tink callback.
-- Access tokens are deliberately not persisted: the backend mints a fresh
-- short-lived user token from the permanent Tink user whenever it synchronises.
create table oauth_states (
    state         text primary key,
    user_id       uuid        not null references users (id) on delete cascade,
    tink_user_id  text        not null,
    expires_at    timestamptz not null,
    consumed_at   timestamptz,
    created_at    timestamptz not null default now()
);

create index oauth_states_user_idx on oauth_states (user_id);
create index oauth_states_expiry_idx on oauth_states (expires_at);
