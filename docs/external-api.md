# External API: Tink

The planner gets its bank data from [Tink](https://tink.com), a PSD2-licensed
open banking provider, through Tink's sandbox and its Demo Bank test users.
This page describes how the app is connected to Tink, which calls it makes and
how it handles Tink's failures. Settings and setup are in
[`web/README.md`](../web/README.md#tink-bank-connection); why we chose Tink is
[decision 1](decisions.md#decision-1-tink-as-the-data-source-sandbox-only).

## Where the code is

| Part | File |
|---|---|
| The only server route that talks to Tink | [`web/app/api/tink/route.ts`](../web/app/api/tink/route.ts) |
| Connect and sync workflow, database writes | [`web/lib/tink.ts`](../web/lib/tink.ts) |
| Tink HTTP client: tokens, calls, timeouts | [`supabase/functions/_shared/tink/client.ts`](../supabase/functions/_shared/tink/client.ts) |
| When a bank permission must be renewed | [`supabase/functions/_shared/tink/consents.ts`](../supabase/functions/_shared/tink/consents.ts) |
| Tink's amounts and transactions into our rows | [`supabase/functions/_shared/tink/convert.ts`](../supabase/functions/_shared/tink/convert.ts) |
| Which stored transaction an incoming one is | [`supabase/functions/_shared/tink/reconcile.ts`](../supabase/functions/_shared/tink/reconcile.ts) |
| What the user is told | [`web/lib/use-bank-sync.ts`](../web/lib/use-bank-sync.ts) |
| What is logged | [`web/lib/bank-error.ts`](../web/lib/bank-error.ts) |

(The folder name `supabase/functions` comes from an earlier plan to run this
code as Supabase Edge Functions. It now runs inside the web app's server
route.)

## How a connection works

1. **Start.** The signed-in user clicks **Add bank now**. The browser calls
   `POST /api/tink?action=connect`. The server makes sure the user has their
   own permanent Tink user (`external_user_id` = our user id), gets a
   single-use code that lets Tink Link add a bank to exactly that Tink user,
   and saves a random state for 10 minutes, both in the database and in an
   HttpOnly cookie.
2. **Bank login at Tink.** The browser goes to Tink Link. The user picks Demo
   Bank and enters the bank login there. Our app never sees it.
3. **Return.** Tink redirects to `GET /api/tink` with the state and the new
   bank login's id. The server accepts it only if the state is unused, not
   expired, belongs to the signed-in user and matches the cookie of the
   browser that started it. Then it reads the accounts with its own
   short-lived token and saves them.
4. **First sync.** Right after the return, the server starts the first sync
   in the background; the bank page shows the progress and opens the
   dashboard when the data is saved.

**Later syncs.** Opening the dashboard checks for new data at most every 15
minutes; it reads the copy Tink already has. **Refresh data** on the bank page
first asks the bank for new data, at most once a minute. A sync fetches
everything first (accounts, all transaction pages, the bank permissions) and
then writes it to the database in one transaction.

## Calls the app makes

All calls go from our server to `https://api.tink.com`. Tink's client secret
and every token stay on the server.

| Purpose | Tink endpoint | Permissions (scopes) |
|---|---|---|
| Token for our app | `POST /api/v1/oauth/token` (client credentials) | `user:create`, `authorization:grant` |
| Create the user's Tink user | `POST /api/v1/user/create` | app token |
| Code for Tink Link | `POST /api/v1/oauth/authorization-grant/delegate` (actor: Tink Link) | `authorization:read`, `authorization:grant`, `credentials:read`, `credentials:refresh`, `credentials:write`, `providers:read`, `user:read` |
| Bank login page | `link.tink.com/1.0/transactions/connect-accounts`; renewal: `.../update-consent` | the code above |
| Token to read the user's data | `POST /api/v1/oauth/authorization-grant`, then `POST /api/v1/oauth/token` | `accounts:read`, `balances:read`, `transactions:read`, `provider-consents:read` |
| Bank permissions and their expiry | `GET /api/v1/provider-consents` | `provider-consents:read` |
| Accounts | `GET /data/v2/accounts` | `accounts:read`, `balances:read` |
| Transactions, page by page | `GET /data/v2/transactions` | `transactions:read` |
| Ask the bank for new data | `POST /api/v1/credentials/{id}/refresh`, then `GET /api/v1/credentials/{id}` until it is done | `credentials:refresh`, `credentials:read` |
| Remove a failed bank login before a new attempt | `DELETE /api/v1/credentials/{id}` | `credentials:write` |

Each token asks only for the permissions of its step. User tokens are
short-lived (we have seen 30 minutes and 2 hours), kept in memory for one
request and never stored.

## How failures are handled

The rule behind every row: **a failure never changes or loses saved data**,
the user is told what to do in plain words, and the log gets a known error
code, never bank data, tokens or Tink's free-text messages.

| Failure | What the app does | What the user sees |
|---|---|---|
| Tink does not answer in time | Each call is cut off after `TINK_TIMEOUT_MS` (default 20 s), a whole request after 45 s, a bank refresh after 30 s. The sync is marked as failed. | "The last update failed. Please try again in a minute." Saved data stays. |
| Tink cannot be reached | The network error becomes a Tink error with a code; same as above. | Same as above. |
| Tink's token has expired during a sync | A new token is fetched once and the sync continues. | Nothing; the sync succeeds. |
| The bank permission has expired | Detected from Tink's list of bank permissions, also before Tink changes the status. The connection is marked expired and not synced again until the user renews it. | "Your bank login needs to be renewed. Please reconnect your bank." Reconnect opens Tink's renewal page for exactly that bank login. |
| Tink no longer knows the user (`USER_NOT_FOUND`) or returns no accounts | Treated like an expired permission. On reconnect, a new Tink user is created; saved accounts are matched by IBAN, so history and categories stay. | "Please reconnect your bank." |
| The bank asks for a new login during **Refresh data** | Recognised from the bank login's status; no data is fetched. | "Please reconnect your bank." |
| Some transactions are incomplete (no booking date, no amount) | The usable ones are saved, the rest skipped and counted. Pending transactions are not deleted after an incomplete fetch, because they might only be missing from it. | "Some transactions are incomplete. Try Refresh again later." |
| An amount is too large to store exactly | The whole sync stops before writing anything. | "The last update failed." |
| A transaction page repeats or there are too many pages | The walk stops (at most 500 pages of 100) instead of looping. | "The last update failed." |
| Two syncs at the same time (two tabs, or a page reload) | The first claims a 90-second lease; the second is told a sync is running. An abandoned lease expires, and a late worker cannot overwrite a newer one. | The page waits for the running sync. |
| The user cancels in Tink Link | Nothing is saved. | "Bank connection cancelled. You can try again." |
| The bank login failed in Tink Link, or the same login is connected twice | A failed login without accounts is removed at Tink before the next attempt, so it does not block a retry. A login that has accounts is never removed. | "Your bank could not be connected. Please try again." or "This bank login is already connected." |
| The return from Tink is replayed, expired or from another browser | Refused; nothing is saved. | "Your bank could not be connected." |
| Bank settings are missing on the server | The bank page disables **Add bank now** and explains the configuration problem; the server log names the missing settings, never their values. | A disabled button with an explanation. |

**Tested by:** [`web/tests/tink.test.ts`](../web/tests/tink.test.ts) runs the
whole workflow against a real PostgreSQL database (PGlite) and a fake Tink, with
tests for these cases (timeouts, an unreachable Tink, expired tokens and
permissions, a missing Tink user, incomplete and unsafe data, endless pages,
parallel syncs, cancelled, failed, duplicate and replayed connections);
[`web/tests/bank-error.test.ts`](../web/tests/bank-error.test.ts) checks that
only known codes are logged;
[`web/tests/bank-settings.test.ts`](../web/tests/bank-settings.test.ts) checks
the settings check. Tests never call the real Tink API.

## Limits

- **How often:** dashboard visits at most every 15 minutes (only Tink's
  saved copy); **Refresh data** at most once a minute. Planned with pull
  request #58: a bank refresh for every user up to four times a day, the most
  PSD2 allows without the user present
  ([decision 7](decisions.md#decision-7-scheduled-bank-sync-through-github-actions-four-times-a-day)).
- **Demo Bank only.** The bank route refuses to start unless `TINK_TEST_MODE`
  is on. Real banks need a production Tink app and a PSD2 licence or partner.
- **Tink's free sandbox deletes users** after about a day; affected users are
  asked to reconnect, and their saved data stays. Details in the known
  limitations of the [root README](../README.md).
