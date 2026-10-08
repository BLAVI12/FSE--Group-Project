-- Extend the existing one-to-one auth profile and add application roles.
-- Roles live separately so profile updates can never grant privileges.

alter table public.profiles
    add column username text,
    add column first_name text,
    add column last_name text,
    add column street text,
    add column postal_code text,
    add column city text,
    add column country_code text,
    add constraint profiles_username_format_check check (
        username is null or username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
    ),
    add constraint profiles_first_name_length_check check (
        first_name is null or length(first_name) between 1 and 100
    ),
    add constraint profiles_last_name_length_check check (
        last_name is null or length(last_name) between 1 and 100
    ),
    add constraint profiles_street_length_check check (
        street is null or length(street) between 1 and 200
    ),
    add constraint profiles_postal_code_length_check check (
        postal_code is null or length(postal_code) between 1 and 20
    ),
    add constraint profiles_city_length_check check (
        city is null or length(city) between 1 and 100
    ),
    add constraint profiles_country_code_format_check check (
        country_code is null or country_code ~ '^[A-Z]{2}$'
    );

create unique index profiles_username_key
    on public.profiles (lower(username))
    where username is not null;

create table public.user_roles (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    role       text not null default 'user' check (role in ('user', 'admin')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.user_roles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create trigger user_roles_set_updated_at before update on public.user_roles
    for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;

    insert into public.user_roles (user_id) values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
          from public.user_roles
         where user_id = auth.uid()
           and role = 'admin'
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.user_roles enable row level security;

create policy "Users update their own profile"
    on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

create policy "Admins read profiles"
    on public.profiles for select to authenticated
    using ((select public.is_admin()));

create policy "Users read their own role"
    on public.user_roles for select to authenticated
    using (user_id = (select auth.uid()));

create policy "Admins read roles"
    on public.user_roles for select to authenticated
    using ((select public.is_admin()));

-- Keeping self-updates out of the policy ensures at least the acting admin
-- remains an admin. Initial promotion is a trusted one-time SQL operation.
create policy "Admins update other users roles"
    on public.user_roles for update to authenticated
    using ((select public.is_admin()) and user_id <> (select auth.uid()))
    with check ((select public.is_admin()) and user_id <> (select auth.uid()));

revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
grant update (role) on public.user_roles to authenticated;
grant update (
    username, first_name, last_name, street, postal_code, city, country_code
) on public.profiles to authenticated;

