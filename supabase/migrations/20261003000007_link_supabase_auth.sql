-- 20261003000007_link_supabase_auth.sql
--
-- Connects the data to Supabase Auth so that a logged-in user can read their
-- own accounts and transactions straight from Supabase (the frontend uses
-- supabase-js; there is no API server in between for reads).
--
-- 1. Supabase Auth owns the users. Our own `users` table (email + password
--    hash) is replaced by auth.users; connections and oauth_states point
--    there. Existing users are copied over first, keeping their id, email and
--    bcrypt password hash (Supabase Auth also uses bcrypt).
--
-- 2. accounts and transactions get a user_id, so every access rule is a plain
--    "user_id = auth.uid()". It can never disagree with the ownership chain
--    transactions -> accounts -> connections: composite foreign keys require
--    each row's user_id to equal its parent's, and a trigger fills it in from
--    the parent, so code that writes rows never has to supply it.
--    This replaces the reasoning in ADR-0006 for not having user_id there.
--
-- 3. One IBAN per user, which needs user_id on accounts to be enforceable.
--
-- 4. Access from the browser. Logged-in users may read their own connection,
--    accounts and transactions, and change only a transaction's category.
--    Not logged in: nothing. All bank data and oauth_states are written only
--    by the backend, which connects as the database owner and bypasses RLS.


-- ---------------------------------------------------------------------------
-- 1. Users live in Supabase Auth
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
       u.email, u.password_hash, now(),
       '{"provider": "email", "providers": ["email"]}', '{}',
       u.created_at, now(),
       '', '', '', ''          -- Supabase Auth cannot read NULL in these columns
  from public.users u
 where not exists (select 1 from auth.users a where a.id = u.id);

insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                             created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now()
  from public.users u
 where not exists (select 1 from auth.identities i
                    where i.user_id = u.id and i.provider = 'email');

alter table connections
    drop constraint connections_user_id_fkey,
    add constraint connections_user_id_fkey
        foreign key (user_id) references auth.users (id) on delete cascade;

alter table oauth_states
    drop constraint oauth_states_user_id_fkey,
    add constraint oauth_states_user_id_fkey
        foreign key (user_id) references auth.users (id) on delete cascade;

drop table users;


-- ---------------------------------------------------------------------------
-- 2. user_id on accounts and transactions, tied to the parent's
-- ---------------------------------------------------------------------------
alter table connections
    add constraint connections_id_user_key unique (id, user_id);

alter table accounts add column user_id uuid;
update accounts a
   set user_id = c.user_id
  from connections c
 where c.id = a.connection_id;
alter table accounts
    alter column user_id set not null,
    drop constraint accounts_connection_id_fkey,
    add constraint accounts_connection_user_fkey
        foreign key (connection_id, user_id) references connections (id, user_id)
        on delete cascade on update cascade,
    add constraint accounts_id_user_key unique (id, user_id);

alter table transactions add column user_id uuid;
update transactions t
   set user_id = a.user_id
  from accounts a
 where a.id = t.account_id;
alter table transactions
    alter column user_id set not null,
    drop constraint transactions_account_id_fkey,
    add constraint transactions_account_user_fkey
        foreign key (account_id, user_id) references accounts (id, user_id)
        on delete cascade on update cascade;

-- user_id always comes from the parent row; a value supplied by the caller is
-- ignored rather than trusted.
create function public.accounts_set_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    select c.user_id into new.user_id
      from public.connections c
     where c.id = new.connection_id;
    return new;
end;
$$;

create trigger accounts_set_user_id
    before insert or update of connection_id on accounts
    for each row execute function public.accounts_set_user_id();

create function public.transactions_set_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    select a.user_id into new.user_id
      from public.accounts a
     where a.id = new.account_id;
    return new;
end;
$$;

create trigger transactions_set_user_id
    before insert or update of account_id on transactions
    for each row execute function public.transactions_set_user_id();

create index transactions_user_date_idx on transactions (user_id, booked_date desc);


-- ---------------------------------------------------------------------------
-- 3. One IBAN per user
-- ---------------------------------------------------------------------------
create unique index accounts_user_iban_key on accounts (user_id, iban) where iban is not null;


-- ---------------------------------------------------------------------------
-- 4. Access from the browser
--
-- RLS decides which rows; privileges decide which columns. Both are needed:
-- an RLS update rule alone would also let a user change the amount of their
-- own transaction, or unflag a transfer, and fake their savings rate.
-- ---------------------------------------------------------------------------
revoke all on connections, accounts, transactions, oauth_states from anon, authenticated;

grant select on connections, accounts, transactions to authenticated;
grant update (category) on transactions to authenticated;

create policy "Users read their own connection"
    on connections for select to authenticated
    using (user_id = (select auth.uid()));

create policy "Users read their own accounts"
    on accounts for select to authenticated
    using (user_id = (select auth.uid()));

create policy "Users read their own transactions"
    on transactions for select to authenticated
    using (user_id = (select auth.uid()));

create policy "Users categorise their own transactions"
    on transactions for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- Categories come from user input, so keep them to something a page can show.
alter table transactions
    add constraint transactions_category_length
    check (category is null or char_length(category) between 1 and 50);
