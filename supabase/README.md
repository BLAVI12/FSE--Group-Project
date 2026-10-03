# Database

The database schema lives in `migrations/`, applied in file-name order.
`seed.sql` loads the sample data: Tink Demo Bank (German market, demo user 1),
with 3,534 transactions from June 2020 to 26 September 2026, owned by a demo
login. It is sandbox data with no real personal or financial information.

| File | What it does |
|---|---|
| `..._init.sql` | Tables `users`, `connections`, `accounts`, `transactions` |
| `..._tink_integration.sql` | `oauth_states`: single-use state for the Tink connect flow |
| `..._tink_external_user.sql` | Links each user to a permanent Tink user |
| `..._one_connection_per_user.sql` | Drops stored access tokens; one connection per user |
| `..._transaction_content_identity.sql` | Identifies transactions by content, not by Tink's ids |
| `..._enable_rls.sql` | Turns on row level security for every table |
| `..._link_supabase_auth.sql` | Users move to Supabase Auth; `user_id` on every table; "own rows only" rules |
| `seed.sql` | Demo login, its connection, 2 accounts and 3,534 transactions |

The reasoning behind the schema is recorded in the team's `DECISIONS.md`
(ADR-0005, ADR-0006 and ADR-0008), which moves into this repository next.

## Demo login

| Email | Password |
|---|---|
| `demo@example.com` | `demo-planner-2026` |

Public on purpose, so the examiners can try the app: it only owns sandbox data.
Re-running `seed.sql` resets the password to this value.

## Who can do what

The frontend reads straight from Supabase with the publishable key. What a
browser may do is decided by the database itself:

| | Not logged in | Logged in |
|---|---|---|
| `connections`, `accounts` | nothing | read own rows |
| `transactions` | nothing | read own rows; change `category` only |
| `oauth_states` | nothing | nothing |

Row level security decides *which rows*; column privileges decide *which
columns*. Without the second, a user could change the amount of their own
transaction or unflag a transfer and fake their savings rate. All bank data
is written by the backend (the Tink sync), which connects as the database
owner.

`user_id` on `accounts` and `transactions` is filled in by the database from
the parent row; code that inserts rows does not supply it. Composite foreign
keys make it impossible for a row's `user_id` to disagree with its parent's.

**Every new table needs RLS.** Supabase lets the publishable key reach any new
table in `public` until RLS is enabled on it, so every migration that creates
a table must enable RLS and add its rules in the same file.

## Rules

- **Change the schema only through a new migration file.** Never by clicking in
  the dashboard: the files must stay the full record of how the database is
  built.
- **Never edit a migration that has been applied.** Add a new one instead.
- Money is stored as integer cents (`bigint`); negative means money out.

## Hosted project

The hosted project `FSE--Group-Project` was set up on 3 October 2026 by
running the first six migrations and `seed.sql` in the SQL Editor.

**Applying `..._link_supabase_auth.sql` there:** run it in the SQL Editor,
then run `seed.sql` once more. The seed is safe to repeat: it adds nothing
twice, and this time it sets the demo login's password. Then check:

```sql
select
  (select count(*) from auth.users where email = 'demo@example.com') as demo_login,    -- 1
  (select count(*) from accounts)                                   as accounts,      -- 2
  (select count(*) from transactions)                               as transactions,  -- 3534 or more
  (select count(*) from transactions where is_transfer)             as transfers;     -- 152 or more
```

More than 3,534 is expected once a live Tink sync has run: the seed is the
26 September snapshot, and Demo Bank keeps adding transactions (3,545 after
the sync on 3 October).

Because the migrations were applied by hand, the Supabase CLI does not know
about them. Before the first `supabase db push`, mark them as applied:

```bash
supabase migration repair --status applied 20261003000001 20261003000002 20261003000003 20261003000004 20261003000005 20261003000006 20261003000007
```

## Rebuilding locally

With the Supabase CLI and Docker (after `supabase init` has added
`config.toml`): `supabase start`, then `supabase db reset` applies every
migration and then `seed.sql`. The migrations need Supabase's `auth` schema,
so a plain PostgreSQL database is no longer enough.
