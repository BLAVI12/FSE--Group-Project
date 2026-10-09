# Student Finance Planner — web app

Next.js app (App Router) that logs users in with Supabase Auth and reads their
data straight from Supabase. What a user may see or change is enforced by the
database's row level security (see `../supabase/README.md`), not by this app.

## Run it locally

Needs Node 24 or later.

```bash
cd web
npm ci
cp .env.example .env.local   # fill in the Supabase and bank settings
npm run dev                  # http://localhost:3000
```

`.env.local` needs the project URL and the **publishable** key from Supabase
(**Project Settings > API Keys**). Both are public by design. Every
`NEXT_PUBLIC_` value is shipped to the browser; bank passwords and Tink secrets
use the server-only names from `.env.example`, without that prefix.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |

Demo login: `demo@example.com` / `demo-planner-2026` (owns the sample data).

## Tink bank connection

The existing login and dashboard stay in place. The bank integration has four
parts: the shared Tink client, `lib/tink.ts` for the workflow, one
`app/api/tink/route.ts` endpoint, and the `BankConnection` component.
The existing `convert.ts`, `reconcile.ts` and transaction classification are reused.

1. Add `DATABASE_URL`, `TINK_CLIENT_ID`, `TINK_CLIENT_SECRET` and
   `TINK_REDIRECT_URI` to `web/.env.local` using `.env.example`.
   Use the **transaction pooler** URL from Supabase **Connect**, pointing to
   the same project as the login. Keep these server values without `NEXT_PUBLIC_`.
2. Register `http://localhost:3000/api/tink` as a redirect URI in Tink Console.
   Keep `TINK_TEST_MODE=true`; this app supports Demo Bank only.
   `TINK_DEMO_PROVIDER=de-demobank-password` preselects the German Demo Bank
   login instead of showing the bank picker. For deployment, use the deployed
   app URL ending in `/api/tink` in both places.
3. The database needs all committed migrations and the category seed. Follow
   `../supabase/README.md` to check the existing schema and reconcile migration
   history first. After the team has confirmed the target project:

   ```bash
   supabase link --project-ref <PROJECT_REF>
   supabase migration list --linked
   supabase db push --linked --dry-run
   supabase db push --linked
   ```

   Do not use `--include-seed` on the hosted project: the configured seed
   includes sample users and transactions. Existing category data is retained.
   Fresh local databases load the seeds through `supabase start` / `db reset`.
   The existing migration rule still applies: add a migration instead of editing
   applied migrations. Migration 009 adds sync status and keeps cents-only seed
   inserts compatible. Its default leaves existing demo rows as sample data.
   `20261009000001_bank_sync_lease.sql` adds the sync claim and expiry fields;
   apply it before deploying this workflow. It also accepts existing lease
   columns from the local prototype. It does not require reseeding.
   For the live release, follow the bank-sync deployment steps in
   [`../supabase/README.md`](../supabase/README.md#bank-sync-deployment).
   Apply and verify the migration before the merged app version is deployed;
   a GitHub merge or Vercel deployment does not apply it automatically.
4. Start the app, sign in and click **Add bank**. Enter the Tink Demo Bank user's
   credentials in the hosted Tink Link login. The first sync starts automatically
   after returning. **Refresh data** refreshes the existing bank login in the
   background, waits for Tink to finish, then imports the new snapshot and
   updates the dashboard without opening Tink Link;
   **Reconnect Demo Bank** handles an expired bank permission.

Automatic checks happen on dashboard visits, at most once every 15 minutes.
Manual checks are limited to once a minute. A started sync continues after the
response; there is no scheduled sync while the app is closed. The workflow
claims a 90-second lease for the signed-in user, releases the database, fetches
all pages, and then saves in one transaction. An expired lease can be retried;
a late worker cannot overwrite a newer attempt. Failed fetches preserve saved
balances, transactions and categories. Tink calls share a 45-second budget,
and browser requests also time out so a failed request does not leave controls
disabled indefinitely.

Each app user has a separate Tink identity, even when two people enter the same
Demo Bank username. A slow import does not hold a database connection while
another user signs in or syncs. Older connections with a shared external identity
must reconnect rather than importing someone else's data. Reconnecting with
duplicate credentials reuses only that verified user's existing accounts.

The single endpoint uses `POST /api/tink?action=connect` or `?action=sync`;
sync returns `202` while work continues through Next.js `after`.
`GET /api/tink?action=status` reads the user's saved sync state without calling
Tink, and `GET /api/tink` handles the callback. Only verified, signed-in users
can connect or sync, and the callback also requires the browser's single-use state.

Tests use fake Tink responses and an in-memory PostgreSQL database. They do
not verify your hosted project or Tink permissions. For a configured Demo Bank,
check the first import and then refresh again to confirm there are no duplicates.
Also sign in as two separate app users using the same Demo Bank credentials:
both should finish independently and continue to see only their own saved rows.
Manual refresh uses `POST /api/v1/credentials/{id}/refresh?authenticate=false`
and requires Tink access to `credentials:read` and `credentials:refresh`.
The request includes `productNames: ["PRODUCT_ACCOUNT_AGGREGATION"]`, matching
the existing credentials-refresh flow in Tink Link. Bank credentials are not
sent by the app.
The backend requests these scopes only for a manual refresh. Tink documents
the refresh endpoint as an Enterprise capability; availability depends on
the application's Tink permissions. A refused or unfinished refresh preserves
saved data and reports a failed update rather than claiming old data is new.
Only healthy consents covering this user's saved accounts are refreshed.
The refresh must reach `UPDATED` with a newer successful update timestamp,
within 30 seconds, before transactions are fetched. A bank asking for renewed
authentication shows **Reconnect Demo Bank**; the app never supplies bank
credentials itself. Dashboard visits import the available Tink snapshot;
they do not start an on-demand bank refresh. An unchanged complete snapshot
shows **Keine neuen Transaktionen**. Refresh cannot create new bank transactions.
Failed refreshes request Tink's `detailedError` and log only an allowlisted
machine-readable `reason` alongside the error code; messages and bank data
are never logged.

A missing connected Tink user (404 from the authorization grant) requires
**Reconnect Demo Bank**. Refresh preserves saved data and does not create an
empty replacement user. Reconnect creates a user for the same app login and
starts a new Tink Link bank login, retaining local transaction history.
Check the application's permanent-user entitlement in Tink when this happens
the day after connection: Tink documents a 24-hour persistence limit without
permanent users. This limit is external to the database migration; enabling
long-lived access depends on the application's Tink permissions.
See [Tink's persistence prerequisites](https://docs.tink.com/entries/articles/ingest-accounts-and-transactions).

Known issue before release: the current Demo Bank background refresh has
returned `BANK_REFRESH_FAILED` with reason `UNKNOWN_ERROR` in manual testing.
Its cause remains unresolved; unchanged transactions alone do not explain a
failed refresh. Automated tests use fake Tink responses and cannot establish
that this live refresh works. Keep this change in draft until manual refresh
succeeds without opening Tink Link. Initial connection and importing the
available snapshot have been tested manually.

## Use the changes in VS Code

Open your existing Git checkout, create a branch and copy the changed files from
this ZIP into that checkout, preserving the folders. The ZIP has no Git history.
Review the changes in Source Control; keep your existing `.env.local` private.
From the repository root:

```bash
git switch -c tink/demo-bank-sync-rework
npm ci
npm ci --prefix web
npm test
npm run lint --prefix web
npm run build --prefix web
git add .
git commit -m "Simplify Demo Bank login and isolate bank sync"
git push -u origin tink/demo-bank-sync-rework
```

Then open a pull request to `main`. Setting up the bank variables and migration
is still needed for a live connection; pushing code alone does not configure them.

## Checks

```bash
npm test      # unit tests (tests/)
npm run lint
npm run build
```

## How login works

| Path | What it does |
|---|---|
| `/` | Landing page |
| `/register` | Sign-up with email/password or Google OAuth |
| `/login` | Email/password login, or "Continue with Google" |
| `/auth/callback` | Server route that finishes Google login (`exchangeCodeForSession`) and redirects to a checked internal path |
| `/dashboard` | Logged-in users only |
| `/dashboard/profile` | Edit the signed-in user's username, personal details and optional address |
| `/dashboard/admin` | Admin-only role management; it does not expose other users' financial data |

`proxy.ts` runs before every page: it refreshes the Supabase session cookies,
sends logged-out visitors from `/dashboard` to `/login`, and sends logged-in
users away from `/login` and `/register`. The dashboard checks the user again
on the server. Redirect targets pass through `lib/auth/redirects.ts`, which
only accepts paths on this site.

Google login and registration use the same OAuth provider flow: Supabase creates
a user on first use and signs in an existing user afterwards. The provider only
needs to be set up in Google and Supabase once; the steps are in the root
`README.md` under "Google OAuth configuration".

## Deploying on Vercel

- **Root directory:** `web`.
- **Include source files outside the Root Directory:** enabled for the shared repo modules.
- **Environment variables:** those from `.env.example`, including the server bank settings.
- In Supabase **Authentication > URL Configuration**, set the Site URL to the
  Vercel address and add `https://<vercel-app>.vercel.app/**` to the Redirect
  URLs. For Google login, also add the Vercel address as an authorized
  JavaScript origin in the Google OAuth client.
