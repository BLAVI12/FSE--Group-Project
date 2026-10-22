# Financial Planner — web app

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

## Dashboard navigation

Overview and Transactions stay in the main navigation once a live bank connection
has completed its first import. Without one, financial pages redirect to
`/dashboard/bank` and these tabs are hidden. The circular placeholder avatar in
the top-right corner opens the account panel with Profile, a bank link and Log out.
The bank link reads **Add bank**, **Manage bank**, or **Renew bank connection**
depending on the verified connection metadata.
The panel supports keyboard navigation, closes on Escape or a click outside, and
returns focus to the avatar on Escape. Existing Admin links remain visible on
the profile and admin pages for admins, even without a bank. The shared header is used on all five
dashboard pages; logout still uses the shared server action. No profile-picture
upload or database changes are required for this placeholder.

After email or Google registration, users complete any missing username and
names before bank setup. Email confirmation, when enabled, still comes first.
Saving an incomplete profile successfully continues onboarding; ordinary profile
edits remain on the profile page. Bank setup, profile/logout, the Tink callback
and status endpoint stay reachable, avoiding redirect loops. Suspended accounts
remain blocked before onboarding is considered.

The gate uses only the signed-in user's `connections` metadata. A live connection
without `last_synced` stays on the first-import page; a successful partial or empty
import is enough. Later expiry or sync failures preserve access to saved data.
Database read failures are shown as unavailable, not as a missing bank. Transaction
APIs return JSON (`BANK_SETUP_REQUIRED`, HTTP 403; `BANK_UNAVAILABLE`, HTTP 503),
not a page redirect. This is application onboarding, not a replacement for RLS.
Seeded sample data is not a live connection: the demo login also needs to connect
a bank before using financial pages. The seed and existing data are unchanged.

## Tink bank connection

The bank integration has four parts: the shared Tink client in
`../supabase/functions/_shared/tink/`, `lib/tink.ts` for the workflow, the `app/api/tink/route.ts` endpoint, the
scheduled-sync endpoint `app/api/cron/bank-sync/route.ts`, and the bank UI with
shared `useBankSync` logic. Only these two routes read the database password and
the Tink secret, through `lib/bank-workflow.ts`.

### Settings

Server-only values: never give them a `NEXT_PUBLIC_` name. Locally they go in
`web/.env.local` (copy `.env.example`); for Vercel see "Deploying on Vercel".

| Variable | Value |
|---|---|
| `DATABASE_URL` | The **Transaction pooler** address from Supabase **Connect**: `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`. Not the direct `db.<project-ref>.supabase.co` address: it only has an IPv6 address, which Vercel cannot reach. |
| `DATABASE_CA_CERT` | Supabase's certificate from **Project Settings > Database > SSL Configuration > Download certificate**: the whole file, from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`. Without it the secure connection to the database is refused. Not needed for a database on `localhost`. |
| `TINK_CLIENT_ID`, `TINK_CLIENT_SECRET` | From the app in Tink Console. |
| `TINK_REDIRECT_URI` | `http://localhost:3000/api/tink` locally, `https://<vercel-app>.vercel.app/api/tink` on Vercel. It must match a redirect URI registered in Tink Console exactly. |
| `TINK_TEST_MODE` | `true` (the default). The app supports Demo Bank only; with `false` the bank route refuses to start. |
| `TINK_DEMO_PROVIDER` | Optional, default `de-demobank-password`: Tink Link opens this Demo Bank login directly instead of a bank list. Tested 9 October 2026: both accounts imported and the login has no expiry date. |
| `TINK_MARKET`, `TINK_LOCALE`, `TINK_TIMEOUT_MS` | Optional, defaults `DE`, `en_US` and `20000`. |
| `CRON_SECRET` | Only for the scheduled sync (see below): a random value of at least 32 characters, for example from `openssl rand -hex 32`. The same value goes in the GitHub secret `CRON_SECRET`. Without it the scheduled-sync route refuses every call. |

In `.env.local`, put the certificate in double quotes; the line breaks inside
the quotes are kept. If the database password contains `@ : / ? # %`, write
those characters percent-encoded in `DATABASE_URL` (for example `@` as `%40`).

### First connection

1. Register both redirect URIs (local and live) in Tink Console.
2. The database needs every file in `../supabase/migrations` and the category
   seed (`../supabase/seeds/transaction-categories.sql`). The hosted project has
   both; `../supabase/README.md` records its state and the procedure for new
   migrations (Supabase CLI with a dry run first). Never run the seed on the
   hosted project. Without the category seed, the first sync stops with
   `MISSING_CATEGORY_SEED`.
3. Start the app, sign in and open **Add bank** from the avatar menu (or follow
   onboarding to `/dashboard/bank`). Click **Add bank now**. Enter the Tink Demo Bank user's
   credentials in the hosted Tink Link login. The first sync starts automatically
   after returning to the bank page. While the first import is running, this
   page polls its status and opens the dashboard after data has been saved. If
   the import finished before the page loaded, **Open dashboard** is available.
   An aborted or failed bank login remains retryable on this page.
   **Refresh data** on **Manage bank** refreshes the existing bank login in the
   background, waits for Tink to finish, then imports the new snapshot and
   updates the dashboard without opening Tink Link;
   **Reconnect bank** handles an expired bank permission.

The dashboard no longer contains bank-action buttons. Its separate background
sync component retains automatic checks; opening an established bank's management
page does not silently start a refresh. Missing local bank settings show a disabled
**Add bank now** button and a configuration explanation instead of hiding it.
The Tink redirect URI remains `/api/tink`; no console callback change is needed.

Optional route integration test: with Docker running and the app's dev server
stopped, run `npm run test:onboarding` from `web/`. Ports 3001, 55431, 55432 and
55430 must be free. It creates an isolated temporary Supabase project, applies
the local migrations and synthetic seed, and tests real Auth/RLS and Next.js HTTP
responses. It covers new registration, profile-first onboarding, bank setup,
first-import failure, stored-data access after expiry/errors, unavailable bank
reads, transaction API gating and admin access without a bank. It never uses
hosted credentials or calls Tink; bank secrets are explicitly cleared for the
temporary app. The app and local test database are stopped on completion; local
test data is discarded. This does not replace a real Google/Tink browser test.

Automatic checks happen on dashboard visits, at most once every 15 minutes.
Manual checks are limited to once a minute. A started sync continues after the
response. The workflow
claims a 90-second lease for the signed-in user, releases the database, fetches
all pages, and then saves in one transaction. An expired lease can be retried;
a late worker cannot overwrite a newer attempt. Failed fetches preserve saved
balances, transactions and categories. Tink calls share a 45-second budget,
and browser requests also time out so a failed request does not leave controls
disabled indefinitely.

### Scheduled sync

Four times a day the app also updates every user's bank data while nobody has
it open. A dashboard visit only re-reads what Tink already has; the scheduled
sync asks the bank for new data first, like **Refresh data**.

- **Who starts it:** the GitHub Actions workflow
  `../.github/workflows/bank-sync.yml`, at 03:17, 09:17, 15:17 and 21:17 UTC.
  Vercel's free plan runs a cron job only once a day. The workflow calls
  `POST /api/cron/bank-sync` with `Authorization: Bearer <CRON_SECRET>`; any
  other call gets `401`, and without `CRON_SECRET` set the route answers `503`.
- **One user per call:** each call syncs the user who has waited longest and
  answers `{ "status": …, "remaining": n }`. The workflow calls again until
  `remaining` is 0 (at most 50 calls per run), so one slow bank never pushes
  the others past the 60-second function limit.
- **At most four a day:** the day has four six-hour slots (UTC). A user is due
  only if they had no sync or attempt in the current slot, so a late, repeated
  or manual run never syncs anyone twice in a slot. A user who pressed
  **Refresh data** in this slot is skipped. A failed attempt also counts and is
  tried again in the next slot.
- **Left out:** expired connections (the person must reconnect in Tink Link),
  suspended users, and connections with a sync already running.
- **Setup, once:** `CRON_SECRET` in Vercel (Production, then redeploy), and in
  GitHub **Settings > Secrets and variables > Actions** the secret
  `CRON_SECRET` (same value) and the variable `APP_URL`
  (`https://<vercel-app>.vercel.app`). Without `APP_URL` the workflow is
  skipped. Test it with **Actions > Scheduled bank sync > Run workflow**.
- GitHub turns off scheduled workflows in a public repository after 60 days
  without commits; **Run workflow** or a new commit turns it back on.

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
authentication shows **Reconnect bank**; the app never supplies bank
credentials itself. Dashboard visits import the available Tink snapshot;
they do not start an on-demand bank refresh. An unchanged complete snapshot
shows **No new transactions**. Refresh cannot create new bank transactions.
Failed refreshes request Tink's `detailedError` and log only an allowlisted
machine-readable `reason` alongside the error code; messages and bank data
are never logged.

A missing connected Tink user (404 from the authorization grant) requires
**Reconnect bank**. Refresh preserves saved data and does not create an
empty replacement user. Reconnect creates a user for the same app login and
starts a new Tink Link bank login, retaining local transaction history.
Check the application's permanent-user entitlement in Tink when this happens
the day after connection: Tink documents a 24-hour persistence limit without
permanent users. This limit is external to the database migration; enabling
long-lived access depends on the application's Tink permissions.
See [Tink's persistence prerequisites](https://docs.tink.com/entries/articles/ingest-accounts-and-transactions).

Manual refresh was tested against Tink on 9 October 2026 with the default
`de-demobank-password` login: Tink updated the login in about 7 seconds and the
sync completed without opening Tink Link. An earlier test returned
`BANK_REFRESH_FAILED` with reason `UNKNOWN_ERROR`; if it reappears, the server
log names the code and reason. Automated tests use fake Tink responses and
cannot replace this live check.

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
| `/dashboard` | Active, signed-in users with a complete profile and a bank's first import saved |
| `/dashboard/transactions` | Financial views require the same completed bank setup |
| `/dashboard/bank` | Add, refresh or renew the signed-in user's bank connection |
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
- **Include source files outside the Root Directory:** enabled; the app imports
  code from `../src` and `../supabase`.
- **Environment variables** (Settings > Environment Variables), each name once,
  for **Production**: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the bank settings above, with the
  live `TINK_REDIRECT_URI`.
  - Type each name exactly as written. The app reads no other names, so a
    `DATA_BASE_URL` or `DATABASE_URL1` is silently ignored.
  - Don't import a local `.env` file: it brings the local redirect address, and
    a direct database address that may work at home does not work on Vercel.
  - No quotes around values; paste the certificate with its line breaks.
  - The variables added by the Supabase integration (`POSTGRES_…`,
    `SUPABASE_…`) are not read by the app. Leave them as they are.
  - A change takes effect only after **Deployments > ⋯ > Redeploy**. Values
    marked Sensitive can't be viewed again, only replaced.
- **Check after a redeploy:** signed in on the live site, open
  `/api/tink?action=status`. A reply with `"connected"` means the database
  connection works; `{"error": …}` means a bank setting is wrong. Supabase
  **Logs > Pooler** shows whether the app reached the database at all. While a
  bank setting is missing or unusable, the bank page disables its connection
  button and explains the configuration problem. The server log lists only the
  variable names to fix, never their values. Dashboard background sync stays off
  until the same settings check passes.
- In Supabase **Authentication > URL Configuration**, set the Site URL to the
  Vercel address and add `https://<vercel-app>.vercel.app/**` to the Redirect
  URLs. For Google login, also add the Vercel address as an authorized
  JavaScript origin in the Google OAuth client.
