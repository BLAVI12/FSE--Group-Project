# Database

The database schema lives in `migrations/`, applied in file-name order.
`seed.sql` loads the sample data: Tink Demo Bank (German market, demo user 1),
with 3,534 transactions from June 2020 to 26 September 2026. It is sandbox data
with no real personal or financial information.

| File | What it does |
|---|---|
| `..._init.sql` | Tables `users`, `connections`, `accounts`, `transactions` |
| `..._tink_integration.sql` | `oauth_states`: single-use state for the Tink connect flow |
| `..._tink_external_user.sql` | Links each user to a permanent Tink user |
| `..._one_connection_per_user.sql` | Drops stored access tokens; one connection per user |
| `..._transaction_content_identity.sql` | Identifies transactions by content, not by Tink's ids |
| `..._enable_rls.sql` | Turns on row level security for every table |
| `seed.sql` | Sample user, connection, 2 accounts and 3,534 transactions |

The reasoning behind the schema is recorded in the team's `DECISIONS.md`
(ADR-0005, ADR-0006 and ADR-0008), which moves into this repository next.

## Rules

- **Change the schema only through a new migration file.** Never by clicking in
  the dashboard: the files must stay the full record of how the database is
  built.
- **Never edit a migration that has been applied.** Add a new one instead.
- Money is stored as integer cents (`bigint`); negative means money out.

## Hosted project

The hosted project `FSE--Group-Project` was set up on 3 October 2026 by
running the six migrations and `seed.sql` in the SQL Editor. Expected result:

```sql
select
  (select count(*) from users)                          as users,         -- 1
  (select count(*) from accounts)                       as accounts,      -- 2
  (select count(*) from transactions)                   as transactions,  -- 3534
  (select count(*) from transactions where is_transfer) as transfers;     -- 152
```

Because these were applied by hand, the Supabase CLI does not know about them
yet. Before the first `supabase db push`, mark them as applied:

```bash
supabase migration repair --status applied 20261003000001 20261003000002 20261003000003 20261003000004 20261003000005 20261003000006
```

## Rebuilding locally

With the Supabase CLI and Docker (after `supabase init` has added
`config.toml`): `supabase db reset` applies every migration and then
`seed.sql`. Without the CLI, run the migrations in order and then `seed.sql`
against any PostgreSQL 13+ database.
