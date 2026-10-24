# Decisions: bank connection and bank data

The decisions behind the bank connection (Tink) and how bank data is stored,
with the reasoning behind each one and the downside we accepted. Each was
written when it was made, in our decision log outside this repository, and is
copied here with file names and references updated. Where a later decision
changed one, the entry says so instead of being rewritten, so the reasoning at
the time stays visible.

Only decisions where a reasonable person could have chosen differently are
listed. Decisions about the rest of the system (scope, hosting, login) are
documented elsewhere by the team.

| Decision | Title | Date | Status |
|---|---|---|---|
| Decision 1 | [Tink as the data source, sandbox only](#decision-1-tink-as-the-data-source-sandbox-only) | 26 Sep 2026 | Accepted |
| Decision 2 | [Why the bank data tables look the way they do](#decision-2-why-the-bank-data-tables-look-the-way-they-do) | 26 Sep 2026 | Accepted; point 1 changed by decision 6 |
| Decision 3 | [Permanent Tink users and scheduled synchronisation](#decision-3-permanent-tink-users-and-scheduled-synchronisation) | 2 Oct 2026 | Accepted; schedule changed by decision 7 |
| Decision 4 | [One connection per Tink user](#decision-4-one-connection-per-tink-user) | 3 Oct 2026 | Accepted |
| Decision 5 | [Start Tink Link with Tink's documented delegated grant](#decision-5-start-tink-link-with-tinks-documented-delegated-grant) | 3 Oct 2026 | Accepted |
| Decision 6 | [Transactions are identified by their content](#decision-6-transactions-are-identified-by-their-content) | 3 Oct 2026 | Accepted |
| Decision 7 | [Scheduled bank sync through GitHub Actions, four times a day](#decision-7-scheduled-bank-sync-through-github-actions-four-times-a-day) | 23 Oct 2026 | Proposed in pull request #58 |

---

## Decision 1: Tink as the data source, sandbox only

**Date:** 26 September 2026 · **Status:** Accepted

**Context.** Bank account aggregation needs a PSD2-licensed provider. Plaid is
better known but US-first, with thinner European coverage; we are building for
German users. Separately, using Tink with *real* accounts needs a commercial
agreement with Tink and a matching regulatory arrangement: either our own
licence as an Account Information Service Provider or a setup in which Tink's
licence covers the service, which Tink offers depending on the contract.
Neither was within reach of a student project.

**Decision.** Tink, against its sandbox and Demo Bank test users.

**Consequences.** Realistic German data (the sandbox returns Edeka, Aldi,
Miete, Deutsche Bahn rather than US merchants), which makes the categorisation
work meaningful. The integration uses Tink's production API, consent flow and
data model, so the design carries over. It is not one settings change away from
production, though. Going live would need the commercial and regulatory
arrangement above, code changes (the bank route refuses to start unless
`TINK_TEST_MODE` is on) and testing against real banks, whose consent renewals,
history limits, data quality and error cases we have not seen.

The costs are real. Tink's documentation is thinner than Plaid's, so more was
learned by experiment than by reading. And we cannot demonstrate behaviour
against real data, which is messier: real bank descriptions carry location codes
and reference numbers rather than clean merchant names, and many banks return a
much shorter history (often around 90 days) than the six years the sandbox
gives us. Our categorisation accuracy would drop against real accounts.

**Later.** Tink's free sandbox turned out to delete our Tink users after about
a day (known limitations in the [root README](../README.md)). Tink keeps users
longer only for Enterprise customers with permanent users.

---

## Decision 2: Why the bank data tables look the way they do

**Date:** 26 September 2026 · **Status:** Accepted; point 1 changed by
[decision 6](#decision-6-transactions-are-identified-by-their-content)

**Context.** The schema has to survive three things that are not obvious until
you look at real provider data. We tested each against the full sandbox dataset
before designing around it.

**Decision.** Separate tables for users, connections, accounts and
transactions, in third normal form, with three specific choices:

**1. Our own primary keys; the provider's ids are not identities.** We connected
to the same Demo Bank user twice and compared. Tink returned *different* account
and transaction ids each time, but identical IBANs and identical
`providerTransactionId` values: its ids are scoped to a connection, not to the
underlying account. So every table uses a database-generated UUID, and the
provider's ids are ordinary columns. Accounts are matched on **IBAN**;
transactions were matched on **`providerTransactionId`** (changed by
[decision 6](#decision-6-transactions-are-identified-by-their-content)).

Had we keyed on Tink's ids, re-linking a bank, which happens whenever the bank
requires renewed authentication, would have silently doubled every balance, and
the bug would only have surfaced months in.

**2. Money as integer cents, never a decimal or float.** Tink sends amounts as
`{ unscaledValue, scale }` and **the scale varies between records**: we saw
both 1 and 2 in the same dataset. E.ON arrived as `unscaledValue: -340,
scale: 1`, which is −€34.00; dividing by 100 everywhere would have produced
−€3.40, wrong by a factor of ten with no error raised. We convert once at the
boundary ([`convert.ts`](../supabase/functions/_shared/tink/convert.ts)) and
store `bigint` cents. No floating-point rounding can accumulate. The cost is
that every display path divides by 100, and a developer reading the database
sees `-3400` rather than `-34.00`.

**3. `connections` as its own table.** The bank connection's status and sync
state have to live somewhere. On `accounts` they would be duplicated across
every account of the same connection; on the users table they break the moment
somebody links a second bank. Neither is third normal form. The cost is one
more join between a user and their accounts.

**Consequences.** Two deliberate departures from strict normalisation, stated so
nobody thinks we missed them: `currency` is stored on transactions even though
it technically depends on the account (multi-currency accounts exist, and it
removes a join from every query), and balances are stored rather than summed
from transactions (Tink's value is authoritative, and summing is only correct
with complete history, which a real bank connection usually does not have).

---

## Decision 3: Permanent Tink users and scheduled synchronisation

**Date:** 2 October 2026 · **Status:** Accepted; the schedule changed by
[decision 7](#decision-7-scheduled-bank-sync-through-github-actions-four-times-a-day)

**Context.** The first Tink flow we proved by hand was a one-time-access flow.
It is useful for demonstrating consent and an initial import, but Tink removes
the temporary data after about 24 hours, so there is nothing durable for a
scheduler to use the next day. We also observed a user-token response with
`expires_in: 7199` (about two hours), while a Tink documentation example states
`1800`. Code must not hard-code either duration.

**Decision.** Create and keep a permanent Tink user for each application user
and build Tink Link for that specific Tink user. When a sync runs, the server
uses the `authorization:grant` capability to get short-lived user access
tokens, uses them in memory and discards them rather than storing them. The
same sync runs on a schedule (planned twice a day) and on request, for an
immediate manual refresh. Webhooks are deferred until the application has a
public HTTPS endpoint.

**Consequences.** The connection can keep refreshing without the user repeating
the browser flow for every sync. The schedule reuses the same sync as the manual
refresh, so there is no second import path. Not storing user access tokens
removes token-at-rest encryption from this design; the Tink application secret
still needs normal secret management. The costs are more OAuth lifecycle code,
scheduled-job coordination and explicit handling of expired or revoked consent.

**Later.** Implemented in the web app's server route
([`web/lib/tink.ts`](../web/lib/tink.ts)) rather than as a separate service.
The schedule became four times a day through GitHub Actions
([decision 7](#decision-7-scheduled-bank-sync-through-github-actions-four-times-a-day)).

---

## Decision 4: One connection per Tink user

**Date:** 3 October 2026 · **Status:** Accepted

**Context.** The first re-link design treated each `connections` row as one
bank consent: every new consent created a new row, matched accounts moved
onto it, and older rows were expired or deleted. That fitted one-time access,
where one token meant one consent.
[Decision 3](#decision-3-permanent-tink-users-and-scheduled-synchronisation)
moved us to permanent Tink users, where a user access token covers *every* bank
the Tink user has linked. Tested with a second bank, the old design marked the
healthy first connection `EXPIRED`, and a sync of one connection pulled the
other bank's accounts onto it.

**Decision.** An application user has exactly one connection: their link to
their permanent Tink user, enforced by a unique constraint
([`20261003000004_one_connection_per_user.sql`](../supabase/migrations/20261003000004_one_connection_per_user.sql)).
A first link creates it; a re-link or an additional bank updates it. Accounts
are matched onto it by IBAN within the user and keep their database ids, so
transactions and user-edited categories survive. Consent health is judged per
account from Tink's provider consents: the connection is `EXPIRED` when an
account no longer has any healthy consent. Several consents may cover one
account (an old expired one beside a fresh re-link), and failed logins leave
consents with no accounts; neither expires a working connection.

**Consequences.** Simpler code with no new rows, expiring or deleting, and it
matches how Tink models users and consents. The cost: a connection no longer
stands for one bank, so a single bank's lapsed consent shows as the whole
connection being `EXPIRED`; per-bank status would move to account level if
multi-bank use ever matters.

---

## Decision 5: Start Tink Link with Tink's documented delegated grant

**Date:** 3 October 2026 · **Status:** Accepted

**Context.** The first permanent-user attempt built the Tink Link URL from a
code issued by `/api/v1/oauth/authorization-grant`, the grant that lets *our
server* read data. Tink Link rejected it on 2 October with `INTERNAL_ERROR` /
`REQUEST_FAILED_FETCH_EXISTING_USER`. A follow-up used an endpoint that is not
in Tink's public documentation.

**Decision.** Follow Tink's documented continuous-access flow: create the
Tink user (`/api/v1/user/create`, `external_user_id` = our user id), issue a
*delegated* code for Tink Link
(`/api/v1/oauth/authorization-grant/delegate` with Tink Link's fixed
`actor_client_id`), and pass it as `authorization_code` in the Tink Link URL.
Tink then redirects back with `credentials_id` and `state` but no `code`; the
server gets its own short-lived user token through the plain authorization
grant. The single-use `state` is also stored in an HttpOnly cookie, and the
return from Tink requires both to match.

**Consequences.** Every step is in Tink's documentation and can be explained
from it. Verified live on 3 October: Tink redirected back with
`credentials_id` and `state` and no `code`, exactly as documented. The cookie
check prevents a Tink Link URL started by one person from being completed in
someone else's browser, which would attach that person's bank to the wrong
account. The cost is one more round trip on connect, and a connect has to
start and finish in the same browser.

Two consequences of Tink keeping every bank login under the permanent user,
both seen live: connecting a login Tink already has is refused
(`INVALID_STATE_DUPLICATE_CREDENTIALS`), and a login that failed stays behind
and blocks a retry the same way. So a lapsed consent is renewed through Tink's
documented update-consent link for that login, and each connect first deletes
the user's failed logins that never produced an account. A login that has
accounts is never deleted, because Tink would then delete its data.

---

## Decision 6: Transactions are identified by their content

**Date:** 3 October 2026 · **Status:** Accepted · **Changes
[decision 2](#decision-2-why-the-bank-data-tables-look-the-way-they-do),
point 1**

**Context.** Decision 2 made `(account_id, provider_transaction_id)` a
transaction's identity, checked by connecting to the same Demo Bank user twice
on one day. The first live sync after the 26 September seed showed this does
not hold over time. Demo Bank numbers transactions by position (1001 = newest),
and 11 new Girokonto transactions had moved every one of the 3455 older ids up
by 11: all 3455 seeded rows were found at id + 11 with identical merchant,
amount and date. Matching on the id rewrote each row with another
transaction's content ("E.on −€34.00, 26.09" became "Salary +€1,887.03,
02.10"). Nothing was categorised yet, but a user's category would have moved
to the wrong transaction with every new arrival.

**Decision.** A transaction is identified by account, booking date, amount and
description, plus an occurrence number that tells identical entries on the
same day apart
([`20261003000005_transaction_content_identity.sql`](../supabase/migrations/20261003000005_transaction_content_identity.sql)).
The sync pairs Tink's transactions with stored rows by content first
([`reconcile.ts`](../supabase/functions/_shared/tink/reconcile.ts)). For a row
whose content changed, it falls back to Tink's id, but only if the merchant, or
the amount and date, still agree, because Demo Bank gives a vanished row's id to
an unrelated newer transaction. `provider_transaction_id` is kept as the id
Tink used most recently, no longer unique.

**Consequences.** Rows keep their ids and categories however Tink renumbers.
The live replay (11 arrivals) reports `11 added, 0 updated, 3455 renumbered`.
A real bank's corrected description, or a hold booking with a new amount,
still updates the row in place. The cost: a pending transaction that books
with *both* a different merchant text and a different amount is treated as a
new transaction, so a category set on the pending row is lost. And the
guarantee that a repeated sync changes nothing now rests on the content key
instead of Tink's id.

---

## Decision 7: Scheduled bank sync through GitHub Actions, four times a day

**Date:** 23 October 2026 · **Status:** Proposed in pull request #58

**Context.** [Decision 3](#decision-3-permanent-tink-users-and-scheduled-synchronisation)
planned a scheduled sync, but until now data only updated when someone opened
the dashboard (which re-reads Tink's saved copy) or pressed **Refresh data**.
Vercel's free plan runs a cron job only once a day. PSD2 allows a bank four
refreshes a day without the user present.

**Decision.** A GitHub Actions schedule calls a protected route,
`POST /api/cron/bank-sync`, at 03:17, 09:17, 15:17 and 21:17 UTC. The route
accepts only a shared secret (`CRON_SECRET`) and asks the bank for new data for
one user per call; the workflow calls again until no user is due. The day has
four six-hour slots, and a user is due only if the bank was not asked for new
data in the current slot, recorded in a new column,
`connections.bank_refresh_attempted_at`. Expired, suspended and busy
connections are skipped. A failed user does not stop the others, but turns the
run red.

**Considered and rejected.** Vercel Cron (once a day on the free plan);
Supabase Cron (would work, but the secret would have to be stored in the
database and the runs would not be visible next to the code); refreshing everyone in one long call (one slow bank would push the
others past Vercel's 60-second limit).

**Consequences.** Bank data stays at most about six hours old without anyone
opening the app, and the limit of four refreshes a day holds however often the
schedule runs. The costs: the schedule depends on GitHub (it can start late,
and GitHub pauses scheduled workflows in a public repository after 60 days
without commits), the secret must be kept in two places (Vercel and GitHub),
and the migration must be applied to the live database before the code.
