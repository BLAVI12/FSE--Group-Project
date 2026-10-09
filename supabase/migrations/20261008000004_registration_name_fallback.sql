-- Keep migration 0003 unchanged; fix JSON null fallback for future signups.
-- No existing profiles, roles or financial rows are updated.
create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    first_value jsonb;
    last_value jsonb;
    first_text text;
    last_text text;
begin
    first_value := coalesce(nullif(new.raw_user_meta_data -> 'first_name', 'null'::jsonb),
                            new.raw_user_meta_data -> 'given_name');
    last_value := coalesce(nullif(new.raw_user_meta_data -> 'last_name', 'null'::jsonb),
                           new.raw_user_meta_data -> 'family_name');
    if jsonb_typeof(first_value) = 'string' then
        first_text := nullif(btrim(first_value #>> '{}'), '');
        if length(first_text) > 100 then first_text := null; end if;
    end if;
    if jsonb_typeof(last_value) = 'string' then
        last_text := nullif(btrim(last_value #>> '{}'), '');
        if length(last_text) > 100 then last_text := null; end if;
    end if;

    insert into public.profiles (id, first_name, last_name)
    values (new.id, first_text, last_text)
    on conflict (id) do nothing;

    insert into public.user_roles (user_id) values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
