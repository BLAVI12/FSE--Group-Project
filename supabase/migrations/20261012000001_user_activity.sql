-- Supabase's auth timestamp records authentication events, not continued use
-- of an existing browser session. Keep a throttled application activity time
-- so the admin list reflects when a user actually last used the application.
alter table public.profiles
    add column last_seen_at timestamptz;

create function public.record_user_activity()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare recorded_at timestamptz;
begin
    if auth.uid() is null or not public.is_account_active() then
        raise exception 'active account required' using errcode = '42501';
    end if;

    update public.profiles
       set last_seen_at = now()
     where id = auth.uid()
       and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')
    returning last_seen_at into recorded_at;

    if recorded_at is null then
        select last_seen_at into recorded_at
          from public.profiles
         where id = auth.uid();
    end if;

    return recorded_at;
end;
$$;

revoke all on function public.record_user_activity() from public, anon;
grant execute on function public.record_user_activity() to authenticated;

-- Preserve the RPC's public shape while returning the freshest trustworthy
-- authentication or application-activity timestamp.
create or replace function public.admin_list_users(p_search text default '', p_role text default '',
    p_status text default '', p_page integer default 1)
returns table(user_id uuid, username text, role text, status text,
    registered_at timestamptz, last_sign_in_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.is_admin() then raise exception 'admin required' using errcode = '42501'; end if;
    return query select r.user_id, p.username, r.role, r.status, u.created_at,
        greatest(u.last_sign_in_at, p.last_seen_at), count(*) over()
    from public.user_roles r join public.profiles p on p.id = r.user_id join auth.users u on u.id = r.user_id
    where (p_search = '' or strpos(lower(coalesce(p.username,'')), lower(left(p_search,100))) > 0)
      and (p_role = '' or r.role = p_role) and (p_status = '' or r.status = p_status)
    order by u.created_at desc nulls last, r.user_id
    limit 20 offset ((least(greatest(p_page,1),100000)-1)::bigint * 20);
end;
$$;
