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

Run the unit tests with `npm test`.
