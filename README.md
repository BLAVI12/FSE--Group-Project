# Financial Planner

Personal finance planner: a Next.js web app in `web/`, deployed on Vercel
at https://fse-group-project.vercel.app, with Supabase for the database and
login, and a bank connection through Tink (Demo Bank sandbox).

The project documentation (user stories with acceptance criteria, the Tink
integration, decisions) starts at [docs/README.md](docs/README.md).

## How to evaluate

Nothing needs to be installed.

1. Open https://fse-group-project.vercel.app and log in with
   `demo@example.com` and password `demo-planner-2026`. This login is public on
   purpose and owns only sandbox data ([demo login](supabase/README.md#demo-login)).
2. Look at the dashboard (balances, income and spending per month, spending
   by category), **Transactions** (filter, search, change a category, export
   as CSV) and **Manage bank** (connection status, **Refresh data**).
3. If the bank page says the connection has expired: the saved accounts and
   transactions stay visible. Tink's free sandbox deletes its users (see
   [known limitations](#known-limitations)). Click **Reconnect bank**, choose
   **Tink Demo Bank** in Tink Link and log in with a Tink Demo Bank test user;
   the import starts by itself when you return.
4. Each user story names the code that implements it and the tests that check
   it: [docs/user-stories.md](docs/user-stories.md).

## Project structure

```text
web/                  Next.js app: pages, API routes, components (see web/README.md)
src/
	features/         Shared JavaScript: categorisation and exact amounts; auth/ is unused (see Authentication)
	lib/supabase/     Supabase client for the shared code
supabase/
	migrations/       Database schema, applied in file-name order
	seed.sql          Demo login and sample data
	seed-data/        Category list; seeds/ holds the SQL generated from it
	functions/_shared/tink/   Tink client and bank-data rules, used by the web app
tests/                Tests for the shared code; tests/database/ checks the database
docs/                 Project documentation: user stories, Tink integration, decisions, data model
```

## Supabase setup

The web app has its own settings file; see `web/README.md`. For the scripts in
`scripts/`, copy `.env.example` to `.env.local` and add your Supabase project
URL and publishable key. Never put a Supabase secret or service-role key in
client-side environment variables.

## Authentication

The web app logs in with `@supabase/ssr` directly: email and password in
`web/app/login/page.tsx`, and Google login finished on the server in
`web/app/auth/callback/route.ts`. See `web/README.md`.

`src/features/auth/` is an earlier, framework-neutral login service written
before the web stack was chosen. The web app does not use it; only the manual
check `scripts/try-login.mjs` and its own tests in `tests/` do.

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
with `web/lib/tink.ts`; its settings and setup are in `web/README.md`. A GitHub
Actions schedule (`.github/workflows/bank-sync.yml`) also updates every user's
bank data four times a day through `web/app/api/cron/bank-sync`. The Tink
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

### Known limitations

- **Tink's free sandbox deletes our users.** Tink keeps users and their data
  longer than 24 hours only for Enterprise customers with permanent users ([Tink
  Docs](https://docs.tink.com/entries/articles/ingest-accounts-and-transactions));
  our sandbox app is not one. By 24 October 2026, 6 of the 7 app users with a
  bank connection had lost their Tink user at least once (Tink answers
  `USER_NOT_FOUND`). In a controlled test, two users connected on 23 October
  were still there after 10 hours and gone after 38 hours, untouched. One user
  created on 2 October has not been deleted; we don't know why. We ruled out our
  own code (no version of it ever deleted a Tink user) and two people sharing
  one Demo Bank login (two app users on the same Demo Bank login stayed healthy
  side by side). Support is not available to sandbox apps. Effect: the app asks
  the person to reconnect; their saved accounts, transactions and categories
  stay. An hourly read-only check on 26 and 27 October saw this happen: one
  user's Tink user disappeared between 14:58 and 08:53 UTC; the app marked the
  connection expired and kept all 3,582 saved transactions. The demo login was
  not affected.
- **Demo Bank only.** The bank connection refuses to start with
  `TINK_TEST_MODE=false`. Real banks would need a commercial and regulatory
  arrangement with Tink, code changes and testing against real banks.
- **Euro only.** Only banks in the EU with accounts in euro are in scope
  (team decision, 25 October 2026). Totals add up amounts without converting
  currencies, so an account in another currency would make them wrong.
- **One bank per user.** After the first bank is connected, the app offers
  only **Manage bank** for it, not a second bank.

### Remaining security limitations

- **Administrators can read every user's profile**, including name and
  address (policy "Admins read profiles"). The admin page itself shows only
  the username. The team accepts this
  ([user story 12](docs/user-stories.md#user-story-12-manage-users-as-an-administrator)).
- **The demo password is public** on purpose, so the examiners can log in. The
  demo login owns only sandbox data.
- **No multi-factor login.** Email and password, or Google.
- **`main` is not protected on GitHub.** Reviews and green checks before
  merging are a team rule ([AGENTS.md](AGENTS.md)), not enforced by GitHub.
- **The server code runs in the US.** Vercel runs the app's server routes in
  its default region (Washington, D.C., `iad1`); the database is in the EU
  (Ireland). Bank data passes through the US on its way to the database.

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
from live Tink data. The agent configuration is versioned here:
[AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) (points to `AGENTS.md`) and
[web/AGENTS.md](web/AGENTS.md) (notes for the Next.js app).

- **Data the agents see:** the project holds no real bank data; all bank data
  is Tink sandbox data (the Demo Bank). Agents work in the repository and,
  only when a team member asks, run read-only checks on the hosted database,
  which holds the team's own test accounts. Secrets stay in git-ignored local
  files; agents must not print them or ask for them.
- **Same bar as human code:** AI-written changes go through the same pull
  request template (with its "AI use" section), the same CI checks and a
  teammate's review. Their commits end with a `Co-Authored-By:` line naming
  the agent.

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
