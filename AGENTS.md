# Rules for AI coding agents

These rules apply to every coding agent working in this repository (Codex,
Claude Code, Copilot and others) and to the people instructing them.
`CLAUDE.md` points here, so all agents read the same rules. `web/AGENTS.md`
adds notes for the Next.js app.

The repository is public.

## Git

- **Never commit or push to `main`.** Work on a branch named after the change
  (for example `tink/sync-function` or `web/month-picker`), push it and open a
  pull request.
- **Don't merge pull requests.** A teammate reviews and merges; nobody merges
  their own.
- Keep one topic per pull request, so it can be reviewed.
- When you open a pull request, use `.github/pull_request_template.md` as its
  description and fill it in, including the AI use section. Don't claim
  checks nobody ran.
- Commit and push only when the person asks. Don't force-push, rewrite history
  or delete branches unless they ask.
- Before opening a pull request, run the checks CI runs:
  - in the repository root: `npm test`, `npm run typecheck`,
    `npm run check:category-seed`
  - in `web/`: `npm test`, `npm run lint`, `npm run build`
- End commits written with an AI agent with a `Co-Authored-By:` line naming
  the agent, so AI-assisted work stays traceable.

## Secrets

- **No secrets in code, docs, tests, logs, commits or pull requests.** Real
  values live only in git-ignored `.env` and `.env.local` files on your own
  machine, and in the Vercel and Supabase settings in production.
  `.env.example` files hold variable names and placeholders only.
- Secret: the Tink client secret, Tink access tokens, the Supabase secret
  (service-role) key, the database password, the Google OAuth client secret.
  Not secret: the Supabase URL and publishable key, which every browser
  receives anyway.
- **Never give a secret a `NEXT_PUBLIC_` name.** Next.js ships those to every
  browser.
- Don't ask the person to paste a secret into the chat. Tell them which file
  or setting it goes in.

## Bank connection (Tink)

- **A person types the Demo Bank credentials in Tink Link.** Don't automate
  that.
- **Don't call the real Tink API from scripts or tests** unless asked. Tests
  use the recorded Demo Bank data in `tests/fixtures/`.
- **Never delete a Tink bank login that has accounts.** Tink deletes the data
  with it.

## Database

- Change the schema only with a new file in `supabase/migrations/`. **Never
  edit a migration that has been applied**; add a new one.
- Don't run anything against the hosted Supabase project (migrations, deletes,
  imports) unless the person asks.
- Every table keeps row-level security on. A user must never see another
  user's data.

## Data rules

Each of these was learned against live Tink data. A change that drops one must
say why in its pull request.

- **Money is never a floating-point number.** `amount` is integer cents. Tink
  sends `{ unscaledValue, scale }`; the scale varies and can arrive as a string
  (`-340` with scale `1` is -34.00 EUR). Format only for display.
- **Accounts match by IBAN within the user.** Tink's account ids change with
  every connection.
- **Transactions don't match on Tink's ids.** Demo Bank renumbers them;
  `supabase/functions/_shared/tink/reconcile.ts` matches by content.
- **Internal transfers** (`Übertrag`) are flagged and count neither as income
  nor as spending.
