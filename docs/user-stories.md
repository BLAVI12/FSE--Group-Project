# User stories

What the Financial Planner does for its users, as user stories with their
acceptance criteria. Each story says what the user gains; its acceptance
criteria say how we check that it is done. Every story names where it is
implemented and which tests verify it, so it can be followed from requirement
to code, test and deployment.

State of the `main` branch on 24 October 2026.

**Status:** **Done** = built, tested and running on the live site ·
**Partly** = built in part; the open acceptance criteria are named in the
story · **Planned** = not built yet

## Overview

| User story | Title | Status |
|---|---|---|
| **Account and access** | | |
| User story 1 | [Register and sign in](#user-story-1-register-and-sign-in) | Done |
| User story 2 | [Complete my profile](#user-story-2-complete-my-profile) | Done |
| **Bank connection** | | |
| User story 3 | [Connect my bank](#user-story-3-connect-my-bank) | Done |
| User story 4 | [Correct amounts and balances](#user-story-4-correct-amounts-and-balances) | Done |
| User story 5 | [Up-to-date data without duplicates](#user-story-5-up-to-date-data-without-duplicates) | Partly |
| User story 6 | [Clear messages when the bank connection fails](#user-story-6-clear-messages-when-the-bank-connection-fails) | Done |
| **Money overview** | | |
| User story 7 | [See my financial situation at a glance](#user-story-7-see-my-financial-situation-at-a-glance) | Done |
| User story 8 | [Explore my transactions](#user-story-8-explore-my-transactions) | Done |
| User story 9 | [Categorise my transactions](#user-story-9-categorise-my-transactions) | Done |
| User story 10 | [Export my transactions](#user-story-10-export-my-transactions) | Done |
| **Security and administration** | | |
| User story 11 | [Only I can see my data](#user-story-11-only-i-can-see-my-data) | Done |
| User story 12 | [Manage users as an administrator](#user-story-12-manage-users-as-an-administrator) | Partly |

---

## Account and access

### User story 1: Register and sign in

**As a** user, **I want to** create an account with my email address or my
Google account, **so that** my finance data belongs to me and only I can open
it.

**Acceptance criteria**

- A user can register with email and password, or with Google.
- If email confirmation is switched on, it comes before anything else.
- Signed-out visitors who open the dashboard are sent to the login page.
- Signed-in users who open the login or register page are sent to the
  dashboard.
- A suspended account cannot use the app: it gets an "account unavailable"
  page (see [user story 12](#user-story-12-manage-users-as-an-administrator)).

**Status:** Done

**Implemented in:** [`web/app/login`](../web/app/login),
[`web/app/register`](../web/app/register),
[`web/app/auth/callback`](../web/app/auth/callback),
[`web/lib/supabase/proxy.ts`](../web/lib/supabase/proxy.ts)

**Verified by:** [`web/tests/auth-routes.test.ts`](../web/tests/auth-routes.test.ts),
[`auth-redirects.test.ts`](../web/tests/auth-redirects.test.ts),
[`registration.test.ts`](../web/tests/registration.test.ts);
[`tests/auth-service.test.js`](../tests/auth-service.test.js),
[`tests/oauth-callback.test.js`](../tests/oauth-callback.test.js);
`npm run test:onboarding` in `web/` (against a temporary local Supabase)

### User story 2: Complete my profile

**As a** new user, **I want to** set my username, first name and last name
once, **so that** the app can greet me and administrators can identify my
account.

**Acceptance criteria**

- A user with a missing username, first name or last name is sent to the
  profile page before bank setup.
- Saving a complete profile continues the onboarding.
- Later profile changes stay on the profile page.

**Status:** Done

**Implemented in:** [`web/app/dashboard/profile`](../web/app/dashboard/profile),
[`web/lib/auth/profile-completion.ts`](../web/lib/auth/profile-completion.ts)

**Verified by:** [`web/tests/profile-completion.test.ts`](../web/tests/profile-completion.test.ts),
[`profile.test.ts`](../web/tests/profile.test.ts),
[`names.test.ts`](../web/tests/names.test.ts)

---

## Bank connection

How the app talks to Tink, and how it handles Tink's failures, is described in
[external-api.md](external-api.md).

### User story 3: Connect my bank

**As a** user, **I want to** connect my bank account, **so that** my accounts
and transactions appear in the planner without typing them in.

**Acceptance criteria**

- Only a signed-in user can start a connection.
- The bank login is entered only on Tink's page (Tink Link); the app never sees
  or stores it.
- After connecting, every account appears with name, type, IBAN and balance,
  together with its transactions.
- The bank is added only to the user who started the connection: the return
  from Tink is checked with a random, single-use state that is bound to that
  user and to that browser.
- Connecting the same bank again does not create a second copy of an account
  (accounts are matched by IBAN within the user).
- Each user has their own Tink user, even when two people use the same Demo
  Bank login.

**Status:** Done

**Implemented in:** [`web/app/api/tink/route.ts`](../web/app/api/tink/route.ts),
[`web/lib/tink.ts`](../web/lib/tink.ts),
[`supabase/functions/_shared/tink/client.ts`](../supabase/functions/_shared/tink/client.ts),
[`web/app/dashboard/bank`](../web/app/dashboard/bank)

**Verified by:** [`web/tests/tink.test.ts`](../web/tests/tink.test.ts)
(single-use, user-bound return from Tink Link; the same IBAN within one user;
separate Tink users); connected on the live site with Tink's Demo Bank, last on
23 October 2026

### User story 4: Correct amounts and balances

**As a** user, **I want** every amount, date and balance to match what my bank
shows, **so that** I can trust the planner's numbers.

**Acceptance criteria**

- Every amount is stored exactly, as whole cents, whatever number of decimal
  places Tink sends (for example `-340` with scale `1` is -34.00 EUR), also when
  the scale arrives as text.
- No amount ever passes through a floating-point number.
- Booked and pending transactions are kept apart.
- Transfers between the user's own accounts are marked and count neither as
  income nor as spending.

**Status:** Done

**Implemented in:** [`supabase/functions/_shared/tink/convert.ts`](../supabase/functions/_shared/tink/convert.ts)

**Verified by:** [`tests/tink/convert.test.ts`](../tests/tink/convert.test.ts),
against 309 real Demo Bank transactions in
[`tests/fixtures/`](../tests/fixtures)

### User story 5: Up-to-date data without duplicates

**As a** user, **I want** new transactions to arrive by themselves and when I
ask for them, **so that** the planner shows my current situation without me
reconnecting.

**Acceptance criteria**

- Opening the dashboard checks for new data at most every 15 minutes.
- **Refresh data** on the bank page asks the bank itself for new data, at most
  once a minute.
- Refreshing twice in a row changes nothing the second time.
- A transaction that Tink renumbers is recognised and not saved twice; a
  pending transaction that gets booked is updated in place.
- A refresh that fails part-way changes nothing: the data of the last
  successful refresh stays.
- Open: bank data is refreshed automatically up to four times a day, also while
  nobody uses the app (pull request #58).

**Status:** Partly

**Implemented in:** [`web/lib/tink.ts`](../web/lib/tink.ts),
[`web/lib/use-bank-sync.ts`](../web/lib/use-bank-sync.ts),
[`supabase/functions/_shared/tink/reconcile.ts`](../supabase/functions/_shared/tink/reconcile.ts)

**Verified by:** [`tests/tink/reconcile.test.ts`](../tests/tink/reconcile.test.ts);
[`web/tests/tink.test.ts`](../web/tests/tink.test.ts) (renumbered and changed
transactions, failed fetches, limits between refreshes)

### User story 6: Clear messages when the bank connection fails

**As a** user, **I want** a clear message when connecting or refreshing fails,
**so that** I know what happened and what to do next.

**Acceptance criteria**

- Expired bank permission, or a bank login that no longer exists at Tink: the
  user is asked to reconnect their bank.
- Any other failed update: the user is told that the last update failed and to
  try again in a minute.
- A cancelled or failed connection says so and can be tried again.
- In every case the saved accounts and transactions stay visible, with the
  time of the last update.
- No message shows error codes or technical terms. The server log records only
  known error codes, never bank data or secrets.

**Status:** Done

**Implemented in:** [`web/lib/use-bank-sync.ts`](../web/lib/use-bank-sync.ts)
(the messages), [`web/lib/tink.ts`](../web/lib/tink.ts) (which failure means
"reconnect"), [`web/lib/bank-error.ts`](../web/lib/bank-error.ts) (what is
logged), [`web/components/bank-connection.tsx`](../web/components/bank-connection.tsx)

**Verified by:** [`web/tests/tink.test.ts`](../web/tests/tink.test.ts) (missing
Tink user, expired consent, failed and partial fetches keep the saved data);
[`web/tests/bank-error.test.ts`](../web/tests/bank-error.test.ts) (only known
codes are logged)

---

## Money overview

### User story 7: See my financial situation at a glance

**As a** user, **I want** a dashboard with my balance, this month's income and
spending and my latest transactions, **so that** I see where I stand without
going through every transaction.

**Acceptance criteria**

- **Available to spend** is the available balance of the checking accounts,
  shown in red when it is negative.
- This month's income and spending count only booked transactions, not
  internal transfers and not excluded ones.
- Spending by category is compared with the previous month.
- The eight most recent transactions are listed, booked or pending.

**Status:** Done

**Implemented in:** [`web/app/dashboard/page.tsx`](../web/app/dashboard/page.tsx),
[`web/lib/data/dashboard.ts`](../web/lib/data/dashboard.ts),
[`web/lib/data/totals.ts`](../web/lib/data/totals.ts),
[`web/components/dashboard/monthly-spending.tsx`](../web/components/dashboard/monthly-spending.tsx)

**Verified by:** [`web/tests/dashboard-data.test.ts`](../web/tests/dashboard-data.test.ts)

### User story 8: Explore my transactions

**As a** user, **I want to** search and filter my transactions, **so that** I
understand where my money goes.

**Acceptance criteria**

- Transactions can be filtered by period, account, category, booked or
  pending, currency and internal transfers, and searched by text.
- A period summary shows income, spending and net cash flow for the current
  selection.
- Months follow the German calendar (time zone Europe/Berlin).

**Status:** Done

**Implemented in:** [`web/app/dashboard/transactions`](../web/app/dashboard/transactions),
[`web/components/transactions-explorer.tsx`](../web/components/transactions-explorer.tsx),
[`web/lib/data/transactions.ts`](../web/lib/data/transactions.ts)

**Verified by:** [`web/tests/transactions-data.test.ts`](../web/tests/transactions-data.test.ts),
[`time.test.ts`](../web/tests/time.test.ts)

### User story 9: Categorise my transactions

**As a** user, **I want to** correct the category of a transaction, **so that**
my spending overview is right.

**Acceptance criteria**

- Every transaction gets a category automatically.
- The user can choose another category or set it back to **Automatic**.
- The user can change only the category, never the amount, the date or the
  transfer flag; the database itself refuses such changes.

**Status:** Done

**Implemented in:** [`web/app/api/transactions/[id]/route.ts`](../web/app/api/transactions/[id]/route.ts),
[`web/lib/data/categories.ts`](../web/lib/data/categories.ts),
[`web/lib/data/category-options.ts`](../web/lib/data/category-options.ts)

**Verified by:** [`web/tests/category-options.test.ts`](../web/tests/category-options.test.ts);
[`tests/transaction-rules.test.js`](../tests/transaction-rules.test.js),
[`tests/category-seed.test.js`](../tests/category-seed.test.js);
[`tests/database/rls-check.mjs`](../tests/database/rls-check.mjs) (changing an
amount is refused)

### User story 10: Export my transactions

**As a** user, **I want to** download my transactions as a CSV file, **so
that** I can keep my own records or work with them in a spreadsheet.

**Acceptance criteria**

- The export contains only the signed-in user's transactions.
- Cells that start with `=`, `+`, `-` or `@` are escaped, so a spreadsheet does
  not run them as formulas.

**Status:** Done

**Implemented in:** [`web/app/api/transactions/export/route.ts`](../web/app/api/transactions/export/route.ts),
[`web/lib/data/transactions-export.ts`](../web/lib/data/transactions-export.ts)

**Verified by:** [`web/tests/transactions-export.test.ts`](../web/tests/transactions-export.test.ts)

---

## Security and administration

### User story 11: Only I can see my data

**As a** user, **I want** nobody else to be able to see my bank data, **so
that** my finances stay private.

**Acceptance criteria**

- Without signing in, no account or transaction can be read.
- A signed-in user reads only their own rows. The database enforces this
  itself (row-level security), not only the app.
- Bank logins are never stored. The Tink secret, Tink access tokens and the
  database password never reach the browser.

**Status:** Done

**Implemented in:** [`supabase/migrations/`](../supabase/migrations)
(row-level security, see [`supabase/README.md`](../supabase/README.md)),
[`web/app/api/tink/route.ts`](../web/app/api/tink/route.ts) (server only)

**Verified by:** [`tests/database/rls-check.mjs`](../tests/database/rls-check.mjs)
and [`tests/database/db-check.sql`](../tests/database/db-check.sql), run in CI
against a fresh database; [`web/tests/tink.test.ts`](../web/tests/tink.test.ts)
(database reads limited to the signed-in user)

### User story 12: Manage users as an administrator

**As an** administrator, **I want to** see all users, change their role and
suspend or reactivate accounts, **so that** I can deal with misuse.

**Acceptance criteria**

- Only administrators can open the admin page.
- A suspended user is blocked at once, including sessions that are already
  open.
- Every change needs a reason and is written to an audit log.
- Users cannot make themselves administrators.
- Open: the time of a user's last sign-in is not updated yet (issue #43; its
  migration is not yet applied to the live database).
- Open: administrators can read users' names and addresses.

**Status:** Partly

**Implemented in:** [`web/app/dashboard/admin`](../web/app/dashboard/admin),
[`supabase/migrations/20261008000002_admin_management.sql`](../supabase/migrations/20261008000002_admin_management.sql)

**Verified by:** [`web/tests/tink.test.ts`](../web/tests/tink.test.ts)
(suspension blocks open sessions; roles cannot be raised by the user)

---

## Changed or dropped features

| Feature | What changed and why |
|---|---|
| Planner for students | First designed for students. Student-specific features would have widened the scope too far, so it became a planner for anyone with a current account. |
| Monthly budget | Not built. The landing page shows a monthly budget as an example; the team decides whether to build it or remove the example, and records the reason here. |
| Automatic bank updates | First planned twice a day; now up to four times a day, the most PSD2 allows without the user present ([decision 7](decisions.md#decision-7-scheduled-bank-sync-through-github-actions-four-times-a-day), pull request #58). |
| Investments | Out of scope on purpose: stocks, ETFs and crypto each need their own data source. Named as the next step. |
