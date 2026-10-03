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
login, local logout, verified current-user lookup and auth-state subscriptions.
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

### Google OAuth configuration

1. In Google Auth Platform, create an OAuth client of type **Web application**.
2. Add the app origin (for example `http://localhost:5173`) as an authorized
   JavaScript origin.
3. Add the Supabase callback shown in **Authentication > Providers > Google**
   as an authorized Google redirect URI. It has the form
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Enable Google in **Supabase > Authentication > Providers** and enter the
   Google client ID and secret there. Never add the client secret to this repo.
5. In **Supabase > Authentication > URL Configuration**, add the local and
   production app callbacks, for example
   `http://localhost:5173/auth/callback`.

The eventual `/auth/callback` page should call `completeOAuthCallback` with the
current URL and navigate only to the returned internal `redirectTo` path.

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
