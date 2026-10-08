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
| `..._fintech_import.sql` | Profiles, import batches, categories/rules, exclusions, exact amounts, and import audit fields |
| `..._record_live_changes.sql` | Records changes made by hand on the hosted database: `amount_exact` filled from the cents on insert, sync columns on `connections` |
| `..._profiles_and_roles.sql` | Editable personal profiles, application roles, admin checks and their RLS policies |
| `seed.sql` | Demo login, its connection, 2 accounts and 3,534 transactions |
| `seeds/transaction-categories.sql` | Generated, repeatable category, keyword, and exclusion seed |

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
| `transactions` | nothing | read own rows; use `set_transaction_category` for audited category changes |
| `oauth_states` | nothing | nothing |
| `raw_payload` | nothing | nothing; service-role import context only |
| `profiles` | nothing | read and update own profile; admins can read profiles for user management |
| `user_roles` | nothing | read own role; admins can read roles and change another user's role |

System categories and rules are readable to authenticated users. Custom
categories and rules are scoped to their owner. Import batches and assignments
are readable only by their owner; writes are reserved for the trusted importer
or the category-assignment RPC.

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

### Application administrators

Every new and existing account receives the application role `user`. The app
does not offer self-promotion. After the profile-and-role migration has been
applied, a project owner can bootstrap the first administrator once in a
trusted SQL session, replacing the placeholder with the chosen account:

```sql
update public.user_roles
   set role = 'admin'
 where user_id = (
   select id from auth.users where email = '<ADMIN_EMAIL>'
 );
```

After that, the admin page can change other users between `user` and `admin`.
An administrator cannot change their own role, ensuring the acting admin does
not accidentally remove the final admin account. Application-admin status does
not bypass the RLS policies protecting accounts or transactions.

## Rules

- **Change the schema only through a new migration file.** Never by clicking in
  the dashboard: the files must stay the full record of how the database is
  built.
- **Never edit a migration that has been applied.** Add a new one instead.
- Money is stored as integer cents (`bigint`); negative means money out.

## Hosted project

The hosted project `FSE--Group-Project` was set up on 3 October 2026 by
running the first six migrations and `seed.sql` in the SQL Editor.

The hosted setup below is historical documentation of work applied manually
before this repository had CLI migration tracking. Do not apply new migrations
or seeds through the Dashboard. New changes belong in migration/seed files and
must be applied through the Supabase CLI only after the target is approved.

Then check the existing hosted seed with:

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

**Verified state, 4 October 2026.** The hosted schema matches migrations
001 to 008 plus `..._record_live_changes.sql` exactly: a fresh local build
from this repository and the hosted database produce the same output from
`tests/database/schema-fingerprint.sql` (tables, columns, constraints,
indexes, policies, grants, functions, triggers). All of it was applied by hand
in the SQL Editor, so the hosted project has no CLI migration history. One
table on the hosted database belongs to no migration: `Mastertabelle`, a
manual upload of the 3,534 Demo Bank transactions. RLS is on and it has no
policies, so the API cannot read it; the app does not use it.

To check again, run `tests/database/schema-fingerprint.sql` in the SQL Editor
and against a local rebuild, and compare: only the `data` line and
`Mastertabelle` may differ. It only reads.

**Category list, 5 October 2026.** The category tables on the hosted database
were empty, so the Tink sync stopped with `MISSING_CATEGORY_SEED` for new
users. With the owner's approval, `seeds/transaction-categories.sql` was run
in the SQL Editor: an exception to the rule above, because the CLI history is
not set up yet. It is the same file CI loads into its test database, with one
word changed: the 2 transactions already stored with a category came from the
Tink sync, so their history entry says `automatic` instead of `manual`.

| | categories | rules | exclusions | assignments |
|---|---|---|---|---|
| Before | 0 | 0 | 0 | 0 |
| After | 14 | 30 | 3 | 2 |

To check again (`assignments` grows with every sync; the other three stay at
14, 30 and 3 unless users add their own):

```sql
select (select count(*) from public.categories)           as categories,
       (select count(*) from public.category_rules)       as rules,
       (select count(*) from public.exclusion_rules)      as exclusions,
       (select count(*) from public.category_assignments) as assignments;
```

Because the migrations were applied by hand, the Supabase CLI does not know
about them. After explicit project approval, mark the verified migrations as
applied (`supabase migration repair --status applied <versions>`), and then
use:

```sh
supabase db push --project-ref <APPROVED_PROJECT_REF>
```

## Rebuilding locally

With the Supabase CLI and Docker: `supabase start`, then `supabase db reset`
applies every migration and configured seed file. **`supabase db reset`
destroys the local Supabase database**, so use it only for a disposable local
instance. The migrations need Supabase's `auth` schema, so plain PostgreSQL is
not sufficient. The repository config runs `seed.sql` followed by the
generated transaction-category seed.

The hosted project has migration history from manual SQL Editor application;
the CLI's migration history must be reconciled before a future approved remote
push. Do not run a remote command until the target project is explicitly
approved. Once approved and linked, the migration application command is:

```sh
supabase db push --project-ref <APPROVED_PROJECT_REF>
```
