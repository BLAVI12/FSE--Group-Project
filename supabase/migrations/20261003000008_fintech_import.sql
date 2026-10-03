-- Add an auditable file-import model without changing the legacy Tink identity
-- or cents-based amount fields used by the current application.

create table public.profiles (
    id         uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

create function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
    return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

create trigger auth_user_creates_profile
    after insert on auth.users
    for each row execute function public.create_profile_for_auth_user();

alter table public.connections
    drop constraint connections_one_per_user,
    alter column tink_external_user_id drop not null,
    add column provider text not null default 'tink'
        check (provider = lower(provider) and length(btrim(provider)) > 0),
    add column institution_id text,
    add column institution_name text,
    add column metadata jsonb not null default '{}'::jsonb,
    add column updated_at timestamptz not null default now(),
    add constraint connections_user_provider_key unique (user_id, provider),
    add constraint connections_tink_external_user_check
        check (provider <> 'tink' or tink_external_user_id is not null);

-- Imported file accounts have no provider connection unless the source says
-- otherwise. Existing provider-linked rows remain unchanged.
alter table public.accounts
    alter column connection_id drop not null,
    alter column provider_account_id drop not null,
    alter column name drop not null,
    alter column type drop not null,
    add column source text,
    add column source_account_id text,
    add column metadata jsonb not null default '{}'::jsonb,
    add column created_at timestamptz not null default now(),
    add column updated_at timestamptz not null default now(),
    add constraint accounts_source_id_user_key unique (user_id, source, source_account_id);

create index accounts_source_account_idx on public.accounts (user_id, source, source_account_id)
where source_account_id is not null;

create or replace function public.accounts_set_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.connection_id is null then
        if new.user_id is null then
            raise exception 'user_id is required for an unconnected account';
        end if;
        return new;
    end if;

    select c.user_id into new.user_id
      from public.connections c
     where c.id = new.connection_id;
    return new;
end;
$$;

create table public.import_batches (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users (id) on delete cascade,
    source            text not null check (length(btrim(source)) > 0),
    filename          text not null check (length(btrim(filename)) > 0),
    checksum          text not null check (checksum ~ '^[0-9a-f]{64}$'),
    importer_version  text not null,
    status            text not null default 'processing'
                      check (status in ('processing', 'completed', 'partial', 'failed')),
    started_at        timestamptz not null default now(),
    ended_at          timestamptz,
    received_count    integer not null default 0 check (received_count >= 0),
    inserted_count    integer not null default 0 check (inserted_count >= 0),
    updated_count     integer not null default 0 check (updated_count >= 0),
    skipped_count     integer not null default 0 check (skipped_count >= 0),
    excluded_count    integer not null default 0 check (excluded_count >= 0),
    unmatched_count   integer not null default 0 check (unmatched_count >= 0),
    ambiguous_count   integer not null default 0 check (ambiguous_count >= 0),
    failed_count      integer not null default 0 check (failed_count >= 0),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (user_id, source, checksum)
);

create index import_batches_user_started_idx
    on public.import_batches (user_id, started_at desc);

create table public.categories (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid references auth.users (id) on delete cascade,
    name       text not null check (length(btrim(name)) between 1 and 80),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id)
);

create unique index categories_system_name_key
    on public.categories (lower(name)) where user_id is null;
create unique index categories_user_name_key
    on public.categories (user_id, lower(name)) where user_id is not null;

create table public.category_rules (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid references auth.users (id) on delete cascade,
    category_id       uuid not null references public.categories (id) on delete cascade,
    keyword           text not null check (length(btrim(keyword)) > 0),
    normalized_keyword text not null check (length(btrim(normalized_keyword)) > 0),
    match_fields      text[] not null default array['original', 'display']::text[]
                      check (cardinality(match_fields) > 0
                        and match_fields <@ array['original', 'display']::text[]),
    match_method      text not null default 'contains'
                      check (match_method in ('contains', 'exact')),
    priority          integer not null default 100,
    active            boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create unique index category_rules_system_key
    on public.category_rules (category_id, normalized_keyword, match_fields, match_method)
    where user_id is null;
create unique index category_rules_user_key
    on public.category_rules (user_id, category_id, normalized_keyword, match_fields, match_method)
    where user_id is not null;
create index category_rules_active_priority_idx
    on public.category_rules (active, priority, normalized_keyword);

create table public.exclusion_rules (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid references auth.users (id) on delete cascade,
    pattern            text not null check (length(btrim(pattern)) > 0),
    normalized_pattern text not null check (length(btrim(normalized_pattern)) > 0),
    match_fields       text[] not null default array['original', 'display']::text[]
                       check (cardinality(match_fields) > 0
                         and match_fields <@ array['original', 'display']::text[]),
    match_method       text not null default 'contains'
                       check (match_method in ('contains', 'exact')),
    reason             text not null check (length(btrim(reason)) > 0),
    active             boolean not null default true,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create unique index exclusion_rules_system_key
    on public.exclusion_rules (normalized_pattern, match_fields, match_method)
    where user_id is null;
create unique index exclusion_rules_user_key
    on public.exclusion_rules (user_id, normalized_pattern, match_fields, match_method)
    where user_id is not null;

alter table public.transactions
    alter column booked_date drop not null,
    add column amount_exact numeric,
    add column source text,
    add column source_transaction_id text,
    add column original_description text,
    add column display_description text,
    add column transaction_type text,
    add column provider_mutability text,
    add column import_batch_id uuid references public.import_batches (id) on delete set null,
    add column raw_payload jsonb not null default '{}'::jsonb,
    add column is_excluded boolean not null default false,
    add column exclusion_rule_id uuid references public.exclusion_rules (id) on delete set null,
    add column created_at timestamptz not null default now(),
    add column updated_at timestamptz not null default now();

update public.transactions
   set amount_exact = amount::numeric / 100,
       original_description = description,
       display_description = description;

alter table public.transactions
    alter column amount_exact set not null,
    add constraint transactions_amount_exact_finite
        check (amount_exact::text not in ('NaN', 'Infinity', '-Infinity')),
    add constraint transactions_exclusion_consistency
        check ((is_excluded and exclusion_rule_id is not null)
            or (not is_excluded and exclusion_rule_id is null)),
    add constraint transactions_id_user_key unique (id, user_id),
    add constraint transactions_source_identity_key
        unique (user_id, source, source_transaction_id);

create index transactions_user_account_date_idx
    on public.transactions (user_id, account_id, booked_date desc);
create index transactions_user_status_date_idx
    on public.transactions (user_id, status, booked_date desc);
create index transactions_user_transfer_date_idx
    on public.transactions (user_id, is_transfer, booked_date desc);
create index transactions_user_category_idx
    on public.transactions (user_id, category)
    where category is not null;
create index transactions_source_identifiers_idx
    on public.transactions (user_id, source, provider_transaction_id);
create index transactions_import_batch_idx
    on public.transactions (import_batch_id)
    where import_batch_id is not null;
create index transactions_excluded_idx
    on public.transactions (user_id, is_excluded)
    where is_excluded;

create table public.category_assignments (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users (id) on delete cascade,
    transaction_id    uuid not null,
    category_id       uuid not null references public.categories (id) on delete restrict,
    category_rule_id  uuid references public.category_rules (id) on delete set null,
    import_batch_id   uuid references public.import_batches (id) on delete set null,
    assignment_source text not null check (assignment_source in ('automatic', 'manual', 'system')),
    is_primary        boolean not null default true,
    is_active         boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    foreign key (transaction_id, user_id)
        references public.transactions (id, user_id) on delete cascade
);

create unique index category_assignments_one_active_primary_idx
    on public.category_assignments (transaction_id)
    where is_active and is_primary;
create index category_assignments_user_category_idx
    on public.category_assignments (user_id, category_id)
    where is_active;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();
create trigger connections_set_updated_at before update on public.connections
    for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts
    for each row execute function public.set_updated_at();
create trigger import_batches_set_updated_at before update on public.import_batches
    for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
    for each row execute function public.set_updated_at();
create trigger category_rules_set_updated_at before update on public.category_rules
    for each row execute function public.set_updated_at();
create trigger exclusion_rules_set_updated_at before update on public.exclusion_rules
    for each row execute function public.set_updated_at();
create trigger category_assignments_set_updated_at before update on public.category_assignments
    for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
    for each row execute function public.set_updated_at();

create function public.set_transaction_category(p_transaction_id uuid, p_category_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_category_name text;
    v_assignment_id uuid;
begin
    if v_user_id is null then
        raise exception 'authentication required' using errcode = '42501';
    end if;

    perform 1 from public.transactions t
     where t.id = p_transaction_id and t.user_id = v_user_id;
    if not found then
        raise exception 'transaction is not available to this user' using errcode = '42501';
    end if;

    if p_category_id is not null then
        select c.name into v_category_name
          from public.categories c
         where c.id = p_category_id
           and (c.user_id is null or c.user_id = v_user_id);
        if v_category_name is null then
            raise exception 'category is not available to this user' using errcode = '42501';
        end if;
    end if;

    update public.category_assignments
       set is_active = false
     where transaction_id = p_transaction_id
       and user_id = v_user_id
       and is_active
       and is_primary;

    if p_category_id is not null then
        insert into public.category_assignments (
            user_id, transaction_id, category_id, assignment_source
        ) values (v_user_id, p_transaction_id, p_category_id, 'manual')
        returning id into v_assignment_id;
    end if;

    update public.transactions
       set category = v_category_name
     where id = p_transaction_id and user_id = v_user_id;

    return v_assignment_id;
end;
$$;

revoke all on function public.set_transaction_category(uuid, uuid) from public, anon;
grant execute on function public.set_transaction_category(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.import_batches enable row level security;
alter table public.categories enable row level security;
alter table public.category_rules enable row level security;
alter table public.exclusion_rules enable row level security;
alter table public.category_assignments enable row level security;

create policy "Users read their own profile"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()));

create policy "Users read their own import batches"
    on public.import_batches for select to authenticated
    using (user_id = (select auth.uid()));

create policy "Users read system and own categories"
    on public.categories for select to authenticated
    using (user_id is null or user_id = (select auth.uid()));
create policy "Users manage their own categories"
    on public.categories for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Users read system and own category rules"
    on public.category_rules for select to authenticated
    using (user_id is null or user_id = (select auth.uid()));
create policy "Users manage their own category rules"
    on public.category_rules for all to authenticated
    using (user_id = (select auth.uid()) and exists (
        select 1 from public.categories c
         where c.id = category_id and c.user_id = (select auth.uid())
    ))
    with check (user_id = (select auth.uid()) and exists (
        select 1 from public.categories c
         where c.id = category_id and c.user_id = (select auth.uid())
    ));

create policy "Users read system and own exclusion rules"
    on public.exclusion_rules for select to authenticated
    using (user_id is null or user_id = (select auth.uid()));
create policy "Users manage their own exclusion rules"
    on public.exclusion_rules for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Users read their own category assignments"
    on public.category_assignments for select to authenticated
    using (user_id = (select auth.uid()));

revoke all on public.profiles, public.import_batches, public.categories,
    public.category_rules, public.exclusion_rules, public.category_assignments
    from anon, authenticated;
grant select on public.profiles, public.import_batches,
    public.categories, public.category_rules, public.exclusion_rules,
    public.category_assignments to authenticated;
grant insert, update, delete on public.categories,
    public.category_rules, public.exclusion_rules to authenticated;

-- Keep raw_payload available to trusted importers only; the browser's
-- transactions SELECT grant intentionally excludes that column.
revoke select on public.transactions from authenticated;
revoke update (category) on public.transactions from authenticated;
grant select (
    id, account_id, user_id, provider_transaction_id, amount, amount_exact,
    currency, description, booked_date, status, category, is_transfer,
    occurrence, source, source_transaction_id, original_description,
    display_description, transaction_type, provider_mutability,
    import_batch_id, is_excluded, created_at, updated_at
) on public.transactions to authenticated;