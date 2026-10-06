-- 001_init.sql
-- Initial schema for the Finance Management App.
--
-- Design notes live in docs/DECISIONS.md. The short version:
--   * Surrogate UUID primary keys everywhere. Tink's own ids are scoped to a
--     connection and change when a user re-links their bank, so they cannot be
--     primary keys (see ADR-0005 in docs/DECISIONS.md).
--   * Money is stored as integer cents in BIGINT. Never floats (ADR-0005).
--   * Every table chains up to users.id. Authorisation is enforced by making
--     every query join all the way up to the session user (ADR-0006).
--
-- Target: PostgreSQL 13+ (gen_random_uuid() is built in; no extension needed).

-- ---------------------------------------------------------------------------
-- users — one row per person using the application
-- ---------------------------------------------------------------------------
create table users (
    id            uuid primary key default gen_random_uuid(),
    email         text        not null unique,
    password_hash text        not null,
    created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- connections — one row per bank the user has linked through Tink
--
-- This table exists because the access token, its expiry, the connection
-- status and the sync cursor all depend on the *connection*, not on an
-- individual account. Storing them on accounts would duplicate the same token
-- across every account of that connection; storing them on users breaks as
-- soon as somebody links a second bank. Neither is 3NF. (ADR-0005)
-- ---------------------------------------------------------------------------
create table connections (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid        not null references users (id) on delete cascade,
    tink_user_id  text        not null,
    access_token  text,                      -- encrypted at rest by the application
    token_expires timestamptz,
    status        text        not null default 'ACTIVE'
                  check (status in ('ACTIVE', 'EXPIRED', 'ERROR')),
    sync_cursor   text,                      -- last nextPageToken; lets a backfill resume
    sync_complete boolean     not null default false,
    last_synced   timestamptz,
    created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounts — one row per bank account
--
-- provider_account_id is Tink's id. It is NOT stable across connections, so it
-- is a uniqueness constraint within a connection rather than an identity.
-- The IBAN is the stable real-world identity and is what the sync matches on
-- when deciding whether an account already exists. (ADR-0005)
-- ---------------------------------------------------------------------------
create table accounts (
    id                  uuid primary key default gen_random_uuid(),
    connection_id       uuid not null references connections (id) on delete cascade,
    provider_account_id text not null,
    iban                text,
    name                text not null,                       -- 'Girokonto'
    type                text not null
                        check (type in ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'OTHER')),
    balance_booked      bigint,                              -- cents
    balance_available   bigint,                              -- cents
    currency            text not null default 'EUR',
    last_refreshed      timestamptz,
    unique (connection_id, provider_account_id)
);

-- ---------------------------------------------------------------------------
-- transactions
--
-- provider_transaction_id comes from identifiers.providerTransactionId, NOT
-- from Tink's `id` field. Provider ids are per-account counters, so they are
-- only unique in combination with the account — verified against the full
-- 3,534-row sandbox dataset, which contains 79 cross-account collisions.
-- (ADR-0005)
--
-- category is a plain text column for now rather than a foreign key to a
-- categories table. Revisit if users are allowed to define their own
-- categories. See "Smaller implementation decisions".
-- ---------------------------------------------------------------------------
create table transactions (
    id                      uuid primary key default gen_random_uuid(),
    account_id              uuid not null references accounts (id) on delete cascade,
    provider_transaction_id text not null,
    amount                  bigint not null,                 -- cents; negative = expense
    currency                text   not null default 'EUR',
    description             text   not null,                 -- raw, e.g. 'Edeka'
    booked_date             date   not null,
    status                  text   not null
                            check (status in ('BOOKED', 'PENDING')),
    category                text,                            -- null = uncategorised
    is_transfer             boolean not null default false,  -- excluded from spending totals
    unique (account_id, provider_transaction_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index transactions_account_date_idx on transactions (account_id, booked_date desc);
create index transactions_category_idx     on transactions (category);
create index accounts_connection_idx       on accounts (connection_id);
create index accounts_iban_idx             on accounts (iban);
create index connections_user_idx          on connections (user_id);
