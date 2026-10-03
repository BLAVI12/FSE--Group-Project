-- 005_transaction_content_identity.sql
--
-- A transaction is identified by its content, not by Tink's
-- providerTransactionId.
--
-- Observed on 2026-10-03, the first live sync after the 26 September seed: Tink
-- Demo Bank numbers transactions by position, newest = 1001. Eleven new
-- Girokonto transactions had arrived, and every older Girokonto transaction's
-- providerTransactionId had moved up by 11. All 3455 seeded rows were found at
-- id + 11 with identical merchant, amount and date. Matching on the id
-- rewrote every row with another transaction's content, so anything attached
-- to a row (a user's category) would have landed on the wrong transaction.
-- Two connections made on the same day, which is how ADR-0005 checked the id,
-- cannot show this.
--
-- The identity is now account + booking date + amount + description, plus an
-- occurrence number that tells identical entries on the same day apart (two
-- coffees for 2.49). provider_transaction_id is kept as the id Tink used most
-- recently: the sync falls back to it for a row whose content changed (a bank
-- correcting a booked description, say), but it is no longer unique.

alter table transactions add column occurrence smallint not null default 1;

-- Number identical same-day entries in provider id order.
with numbered as (
    select id,
           row_number() over (
               partition by account_id, booked_date, amount, description
               order by provider_transaction_id) as n
      from transactions)
update transactions t
   set occurrence = numbered.n
  from numbered
 where t.id = numbered.id
   and numbered.n > 1;

alter table transactions
    drop constraint transactions_account_id_provider_transaction_id_key;

alter table transactions
    add constraint transactions_identity
    unique (account_id, booked_date, amount, description, occurrence);

-- For the sync's fallback lookup by Tink's id.
create index transactions_provider_id_idx on transactions (account_id, provider_transaction_id);
