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
| `..._admin_management.sql` | Account suspension, bounded user lookup, serialized admin changes and audit log |
| `..._bank_sync_lease.sql` | Per-user sync claims and expiry; abandoned attempts can recover without a long database transaction |
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

### Account management

Apply `20261008000002_admin_management.sql` before deploying the updated app.
Existing accounts default to `active`. The admin lookup searches usernames and
filters role/status in pages of 20; it returns registration and last sign-in
timestamps, not addresses, emails or financial details.

Suspension restricts application access; it is not an Auth ban or deletion.
Authentication may still issue tokens, but restrictive RLS checks current
status on each database request, including existing JWTs. The category RPC
enforces the same check. The web app displays an access-unavailable page and
rejects API requests. Previously downloaded data cannot be recalled. Trusted
background imports and service-role access are outside browser RLS.

`admin_manage_user` validates active admin access, forbids self-changes,
serializes concurrent changes and records each change in the same transaction.
Direct authenticated role/status writes are denied. Status changes require a
reason and confirmation. Only active admins can read the audit log, which stores
actor/target IDs, action, old/new values and reason. Reasons must not contain
financial or sensitive personal data. This release retains records until a
separate retention policy is agreed; no automatic purge is configured.
The UI shows the latest 20 events. Account deletion and user-activity tracking
are separate future features.

## Rules

- **Change the schema only through a new migration file.** Never by clicking in
  the dashboard: the files must stay the full record of how the database is
  built.
- **Never edit a migration that has been applied.** Add a new one instead.
- Money is stored as integer cents (`bigint`); negative means money out.

## Hosted project

### Verified state and application, 11 October 2026

The hosted project has CLI migration history. Before this deployment it had
11 entries through `20261008000002_admin_management`. Schema inspection
confirmed that `20261009000001_bank_sync_lease` already existed and matched
the committed migration: nullable UUID/timestamptz lease columns, the paired
null constraint, and browser SELECT-only access. Its missing history entry
was therefore marked applied, without executing its SQL again:

```sh
supabase migration repair --linked --status applied 20261009000001
supabase migration list --linked
supabase db push --linked --dry-run --include-all
```

Protected local schema/data backups were taken before any history repair or
migration. The plain dry run requested `--include-all` because the two
registration migrations precede the already recorded bank-sync version.
The dry run with that flag listed **exactly**:

- `20261008000003_registration_names.sql`
- `20261008000004_registration_name_fallback.sql`

Both were then applied on **11 October 2026** with:

```sh
supabase db push --linked --include-all
supabase migration list --linked
```

The resulting list has **14 matching Local/Remote entries**: the eight
`2026100300000…` migrations, `20261004000001`, all four `2026100800000…`
migrations, and `20261009000001`. No migrations from this branch remain
pending. The final hosted signup trigger matches `...0004` exactly. Comparing
the exports confirmed that the rest of the schema and all exported public
table rows were unchanged, including 7 profiles, 7 roles, 10 accounts and
14,215 transactions. No seed or profile backfill was run.

All local CI checks passed after the Main update: 55 root tests, typecheck,
category-seed check, 109 web tests, lint, production build, database SQL checks,
and 16 Auth/Data API access checks in a disposable local Supabase instance.
This does not substitute for the still-pending interactive Google signup test.

### 8 October 2026 migration record

At the last verified application in this project's work log, migrations
`20261008000001_profiles_and_roles` and `20261008000002_admin_management`
were present on hosted. Admin management was applied with the linked Supabase
CLI (`db push --linked`) after backup and verification; its incorrect history
entry was first repaired with `migration repair --status reverted`.
The original application event for `...0001` is not reconstructed here.

At that stage, the registration migrations had not yet been applied. Their
application and verification are recorded above under 11 October 2026.

The hosted project `FSE--Group-Project` was set up on 3 October 2026 by
running the first six migrations and `seed.sql` in the SQL Editor.

The setup below is historical documentation of manual work before CLI
migration tracking. It is not the current deployment procedure. New schema
changes belong in migration files and are applied through the CLI only after
project approval, backup, history/schema verification and review of the dry
run. Do not apply new migration files through the SQL Editor or rerun seeds on
hosted. If history is inconsistent, stop: never infer applied status from a
version number alone. Repair history only after verifying the existing schema.

### Bank-sync deployment

`20261009000001_bank_sync_lease.sql` records the lease schema used by the
prototype. It was added to the hosted project by hand from that prototype and
verified identical to the committed migration on 9 October 2026: both
`public.connections.sync_claim_id` and `sync_expires_at` are present, the
`connections_sync_claim_check` constraint matches, and browsers retain SELECT
only. Its initially missing CLI entry was reconciled on 11 October 2026, as
recorded above. The bank-sync migration SQL was not executed again.

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
in the SQL Editor; it had no CLI migration history **at that time**. One
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

The historical manual migrations now have verified CLI history. For future
approved changes, check the linked project, take a backup, and use:

```sh
supabase migration list --linked
supabase db push --linked --dry-run
# Only after confirming that the preview lists exactly the approved files:
supabase db push --linked
supabase migration list --linked
```

If pending migrations precede the latest remote version, the CLI may require
`--include-all`; add it to both the dry run and the application, and inspect
the complete preview again. If any unexpected file appears, stop and
investigate. Do not add `--include-seed` for hosted schema deployments.

## Rebuilding locally

### Names at registration

Migration `20261008000003_registration_names.sql` copies `first_name` and
`last_name` from signup metadata into each new profile. Google metadata can
instead provide `given_name` and `family_name` if those keys are present;
Google OAuth is not guaranteed to retain them (Supabase commonly stores
`name`/`full_name`). Full names are never split automatically. Missing, non-string, empty or
overlength values remain null and can be edited in the Profile tab. No names
are guessed from a display name, and existing profiles are not backfilled.
Email/password registration requires separate first and last name fields.
The web app checks persisted profile names after either login method. Users
with an incomplete username or names (including existing accounts) must complete the Profile
tab before accessing other dashboard pages or web API routes. Profile saving
requires a username and both names server-side; address fields remain optional. This is an
application onboarding check, not a new database privilege or RLS restriction.
The database trigger works even when email confirmation means signup does not
immediately return a session. Apply this migration through the approved
migration process before relying on signup names in the hosted project.

Migration `20261008000004_registration_name_fallback.sql` treats JSON null as
missing when falling back to `given_name`/`family_name`. It replaces only the
trigger function and does not backfill any existing profiles. Apply both
registration migrations in order on new environments; both are already
applied on hosted. Web validation counts up to 100
Unicode codepoints, matching PostgreSQL length; HTML maxlength allows up to
200 UTF-16 units so supplementary characters are not blocked prematurely.
The local demo seed fills missing username and names with `demo_student`,
`Demo`, `Student`, while retaining already saved values.


With the Supabase CLI and Docker: `supabase start`, then `supabase db reset`
applies every migration and configured seed file. **`supabase db reset`
destroys the local Supabase database**, so use it only for a disposable local
instance. The migrations need Supabase's `auth` schema, so plain PostgreSQL is
not sufficient. The repository config runs `seed.sql` followed by the
generated transaction-category seed.

Hosted now has matching CLI migration history. The rebuild/reset commands above
are still for disposable local databases only; never use them against hosted.
