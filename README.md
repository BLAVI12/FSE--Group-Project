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