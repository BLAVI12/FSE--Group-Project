# Student Finance Planner — web app

Next.js app (App Router) that logs users in with Supabase Auth and reads their
data straight from Supabase. What a user may see or change is enforced by the
database's row level security (see `../supabase/README.md`), not by this app.

## Run it locally

Needs Node 24 or later.

```bash
cd web
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev                  # http://localhost:3000
```

`.env.local` needs the project URL and the **publishable** key from Supabase
(**Project Settings > API Keys**). Both are public by design. Never put a
secret or service-role key here: every `NEXT_PUBLIC_` value is shipped to the
browser.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |

Demo login: `demo@example.com` / `demo-planner-2026` (owns the sample data).

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
| `/register` | Sign-up with email and password (`supabase.auth.signUp`) |
| `/login` | Email/password login, or "Continue with Google" |
| `/auth/callback` | Server route that finishes Google login (`exchangeCodeForSession`) and redirects to a checked internal path |
| `/dashboard` | Logged-in users only |

`proxy.ts` runs before every page: it refreshes the Supabase session cookies,
sends logged-out visitors from `/dashboard` to `/login`, and sends logged-in
users away from `/login` and `/register`. The dashboard checks the user again
on the server. Redirect targets pass through `lib/auth/redirects.ts`, which
only accepts paths on this site.

Google login needs the provider set up in Google and Supabase once; the steps
are in the root `README.md` under "Google OAuth configuration".

## Deploying on Vercel

- **Root directory:** `web`.
- **Environment variables:** the two from `.env.example`.
- In Supabase **Authentication > URL Configuration**, set the Site URL to the
  Vercel address and add `https://<vercel-app>.vercel.app/**` to the Redirect
  URLs. For Google login, also add the Vercel address as an authorized
  JavaScript origin in the Google OAuth client.
