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
   Leave `TINK_TEST_MODE=true` for Demo Bank. For deployment, use the deployed
   app URL ending in `/api/tink` in both places.
3. The database needs all committed migrations and the category seed. Follow
   `../supabase/README.md` to check the existing schema and reconcile migration
   history first. After the team has confirmed the target project:

   ```bash
   supabase link --project-ref <PROJECT_REF>
   supabase db push --linked --include-seed --dry-run
   supabase db push --linked --include-seed
   ```

   `--include-seed` loads the configured sample data and category seed as well.
   The existing migration rule still applies: add a migration instead of editing
   applied migrations. Migration 009 adds sync status and keeps cents-only seed
   inserts compatible. Its default leaves existing demo rows as sample data.
4. Start the app, sign in and click **Connect bank**. After completing Tink Link,
   the first sync starts automatically. **Refresh** runs a manual check;
   **Renew bank permission** handles an expired consent.

Automatic checks happen on dashboard visits, at most once every 15 minutes.
Manual checks are limited to once a minute. There is no sync with the app closed.
The workflow fetches all pages before saving and writes in one transaction;
failed fetches preserve saved balances, transactions and categories.

The single endpoint uses `POST /api/tink?action=connect` or `?action=sync`;
`GET /api/tink` handles the callback. Only verified, signed-in users can connect
or sync, and the callback also requires the browser's single-use state.

Tests use fake Tink responses and an in-memory PostgreSQL database. They do
not verify your hosted project or Tink permissions. For a configured Demo Bank,
check the first import and then refresh again to confirm there are no duplicates.

## Use the changes in VS Code

Open your existing Git checkout, create a branch and copy the changed files from
this ZIP into that checkout, preserving the folders. The ZIP has no Git history.
Review the changes in Source Control; keep your existing `.env.local` private.
From the repository root:

```bash
git switch -c tink/simple-sync
npm ci
npm ci --prefix web
npm test
npm run lint --prefix web
npm run build --prefix web
git add .
git commit -m "Add simple Tink dashboard sync"
git push -u origin tink/simple-sync
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
