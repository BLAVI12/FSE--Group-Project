# Financial Planner

Finance planner for students: a Next.js web app in `web/`, deployed on Vercel
at https://fse-group-project.vercel.app, with Supabase for the database and
login, and a bank connection through Tink (Demo Bank sandbox).

## Project structure

```text
web/                  Next.js app: pages, API routes, components (see web/README.md)
src/
	features/         Shared JavaScript: categorisation and exact amounts, auth helpers
	lib/supabase/     Supabase client for the shared code
supabase/
	migrations/       Database schema, applied in file-name order
	seed.sql          Demo login and sample data
	seed-data/        Category list; seeds/ holds the SQL generated from it
	functions/_shared/tink/   Tink client and bank-data rules, used by the web app
tests/                Tests for the shared code; tests/database/ checks the database
docs/                 Data model (fintech-erm.md)
```

## Supabase setup

The web app has its own settings file; see `web/README.md`. For the scripts in
`scripts/`, copy `.env.example` to `.env.local` and add your Supabase project
URL and publishable key. Never put a Supabase secret or service-role key in
client-side environment variables.

## Authentication foundation

The framework-neutral authentication service lives in
`src/features/auth/auth-service.js`. It supports email/password and Google
authentication, local logout, verified current-user lookup and auth-state subscriptions.
Google login uses the PKCE flow; `src/features/auth/oauth-callback.js` exchanges
the returned authorization code for a session.

Create one browser client for the application and inject it into the service:

```js
import { createAuthService } from "./src/features/auth/auth-service.js";
import { createSupabaseBrowserClient } from "./src/lib/supabase/client.js";

const supabase = createSupabaseBrowserClient({
  url: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY
});

const auth = createAuthService(supabase);
await auth.signIn({ email, password });

// Redirects the browser to Google and then back to /auth/callback.
await auth.signInWithGoogle();
```

The environment access shown above is an integration placeholder. Replace it
with the selected frontend framework's public-environment mechanism when the UI
stack is chosen.

The web app in `web/` does not use this service yet: it logs in with
`@supabase/ssr` directly (`web/app/login/page.tsx`) and finishes Google login
on the server in `web/app/auth/callback/route.ts`. See `web/README.md`.

### Google OAuth configuration

The web app runs on `http://localhost:3000` locally. Google sends the user back
to **Supabase**, and Supabase then sends them to the app's `/auth/callback`.

1. In **Google Auth Platform**, set up branding (app name, support email) and
   choose the **External** audience.
2. Create an OAuth client of type **Web application**:
   - Authorized JavaScript origins: `http://localhost:3000` (plus the Vercel
     URL once deployed).
   - Authorized redirect URIs: the Supabase callback shown in
     **Authentication > Sign In / Providers > Google**, of the form
     `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Enable Google in **Supabase > Authentication > Sign In / Providers** and
   enter the Google client ID and secret there. Never add the client secret to
   this repo.
4. In **Supabase > Authentication > URL Configuration**, set the Site URL to
   the app's address and add the app to the Redirect URLs, for example
   `http://localhost:3000/**` (plus `https://<vercel-app>.vercel.app/**` once
   deployed). Use the wildcard form: the app asks to return to
   `/auth/callback?next=/dashboard`, with a query string attached.
5. While the Google app is in **Testing** mode, only the Google accounts listed
   under **Audience > Test users** can log in. Add the team (and the examiners
   for the presentation), or publish the app; with only the basic sign-in
   scopes, Google does not require a review.

The same Google OAuth flow handles both login and registration. A first-time
Google user is registered in Supabase Auth; an existing user is logged in. The
web app exposes this flow on both `/login` and `/register`.

## Bank data (Tink)

The bank connection runs in the web app, in the server route `web/app/api/tink`
with `web/lib/tink.ts`; its settings and setup are in `web/README.md`. The Tink
code it uses lives in `supabase/functions/_shared/tink/` (the folder name comes
from an earlier plan to run it as Supabase Edge Functions). `client.ts` talks
to Tink, `consents.ts` decides when a bank permission must be renewed, and
`errors.ts` decides what the user is told when the bank or Tink fails.
`convert.ts` turns Tink's accounts and transactions into our rows (amounts
as integer cents from Tink's varying decimal scale, booked/pending status,
transfer flag); `reconcile.ts` decides which stored transaction each
incoming one is, so a repeated sync never duplicates rows. Both are pure
functions with tests in `tests/tink/`, run against 309 real Demo Bank
transactions in `tests/fixtures/`.

## Checks

Needs Node 24 or later.

```bash
npm test            # unit tests
npm run typecheck   # TypeScript type check
npm run check:category-seed
```

CI also builds a throwaway database from the migrations and seed files and
runs the checks in `tests/database/` against it: data, ownership and
cascade rules in the database itself (`db-check.sql`), and the access rules
through the real Auth and Data API (`rls-check.mjs`). Locally, with Docker and
the Supabase CLI:

```bash
supabase start
eval "$(supabase status -o env)"
psql "$DB_URL" -f tests/database/db-check.sql
node tests/database/rls-check.mjs "$API_URL" "$PUBLISHABLE_KEY"
```

## AI coding agents

Rules for every coding agent working in this repository, and for the people
instructing them, are in [AGENTS.md](AGENTS.md): no direct pushes to `main`,
no secrets in Git, a person types the bank login, and the data rules learned
from live Tink data. `CLAUDE.md` points to the same file.

## Categories

Category names, keyword rules, and ignored test descriptions are maintained in
`supabase/seed-data/transaction-categories.json`. The dashboard sorts
transactions into categories with this list (`web/lib/data/dashboard.ts`); a
category set by hand on the transaction takes precedence.

The same list fills the category tables of migration 008 through a generated,
idempotent SQL seed. Regenerate or verify it with:

```sh
npm run generate:category-seed
npm run check:category-seed
```

Bank data reaches the database only through the Tink sync, which uses the
categorisation and exact-amount helpers in
`src/features/transactions/transaction-rules.js`. See
[docs/fintech-erm.md](docs/fintech-erm.md) for the data model.
