# Financial Planner

Starter repository for a financial planning app. The structure is intentionally framework-neutral and ready for a future Supabase integration.

## Project structure

```text
src/
	components/       Shared UI components
	features/         Feature-specific modules
	lib/supabase/     Supabase client and helpers
	pages/            App views
	styles/           Global styles and design tokens
supabase/
	functions/        Edge Functions
	migrations/       Database migrations
tests/              Automated tests
```

## Supabase setup

Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key. Never put a Supabase secret or service-role key in client-side environment variables.

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

Code shared by the Supabase Edge Functions lives in `supabase/functions/_shared/`.
`tink/convert.ts` turns Tink's accounts and transactions into our rows (amounts
as integer cents from Tink's varying decimal scale, booked/pending status,
transfer flag); `tink/reconcile.ts` decides which stored transaction each
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

## Transaction imports

Category names, keyword rules, and ignored test descriptions are maintained in
`supabase/seed-data/transaction-categories.json`. Regenerate or verify the
idempotent SQL seed with:

```sh
npm run generate:category-seed
npm run check:category-seed
```

The importer accepts a JSON array or an object containing `transactions`. It
uses an external path and defaults to a local dry run; the export is never
copied into the repository or printed:

```sh
npm run import:transactions -- /path/to/private-transactions.json
```

Applying requires an explicit `--apply`, a user UUID, and server-side Supabase
environment variables. Use only a local Supabase URL unless a remote target
has been explicitly approved. The service-role key is consumed only by this
Node command and must never be added to browser configuration.

```sh
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SUPABASE_SERVICE_ROLE_KEY" \
SUPABASE_USER_ID=<local-auth-user-uuid> \
npm run import:transactions -- /path/to/private-transactions.json --apply
```

The importer keeps the exact amount in `amount_exact`; the older integer-cent
`amount` column remains a rounded compatibility value. Pending rows are
reconciled to booked rows only when the source transaction identity is stable.
See [docs/fintech-erm.md](docs/fintech-erm.md) for the schema and import rules.
