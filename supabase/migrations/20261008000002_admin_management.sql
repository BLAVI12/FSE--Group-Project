-- Application suspension is checked on every request, including existing JWTs.
alter table public.user_roles
    add column status text not null default 'active' check (status in ('active', 'suspended'));

create table public.admin_audit_log (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid not null,
    target_id uuid not null,
    action text not null check (action in ('role_changed', 'suspended', 'reactivated')),
    old_value text not null,
    new_value text not null,
    reason text not null check (length(btrim(reason)) between 1 and 500),
    created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log(created_at desc, id);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

create function public.is_account_active() returns boolean
language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.user_roles where user_id = auth.uid() and status = 'active');
$$;
revoke all on function public.is_account_active() from public, anon;
grant execute on function public.is_account_active() to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.user_roles
                  where user_id = auth.uid() and role = 'admin' and status = 'active');
$$;

-- A restrictive policy ANDs with all existing own-row policies.
do $$ declare t text; begin
    foreach t in array array['profiles','user_roles','connections','accounts','transactions',
        'oauth_states','categories','category_rules','exclusion_rules','import_batches','category_assignments'] loop
        execute format('create policy "Active accounts only" on public.%I as restrictive for all to authenticated using ((select public.is_account_active())) with check ((select public.is_account_active()))', t);
    end loop;
end $$;

-- The category RPC bypasses RLS: wrap it with the same live status check.
alter function public.set_transaction_category(uuid, uuid) rename to set_transaction_category_internal;
revoke all on function public.set_transaction_category_internal(uuid, uuid) from public, anon, authenticated;
create function public.set_transaction_category(p_transaction_id uuid, p_category_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_account_active() then
        raise exception 'active account required' using errcode = '42501';
    end if;
    return public.set_transaction_category_internal(p_transaction_id, p_category_id);
end;
$$;
revoke all on function public.set_transaction_category(uuid, uuid) from public, anon;
grant execute on function public.set_transaction_category(uuid, uuid) to authenticated;

-- Direct browser writes would bypass the audit and concurrency safeguards.
revoke update(role) on public.user_roles from authenticated;
drop policy "Admins update other users roles" on public.user_roles;

create function public.admin_manage_user(p_target uuid, p_field text, p_value text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare previous_value text; event_name text;
begin
    -- Serialize every admin mutation, including the authorization re-check.
    lock table public.user_roles in exclusive mode;
    if not public.is_admin() then raise exception 'admin required' using errcode = '42501'; end if;
    if p_target = auth.uid() then raise exception 'self changes forbidden' using errcode = '42501'; end if;
    if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
        raise exception 'reason required' using errcode = '22023';
    end if;
    if p_field = 'role' and p_value in ('user','admin') then
        select role into previous_value from public.user_roles where user_id = p_target;
        event_name := 'role_changed';
    elsif p_field = 'status' and p_value in ('active','suspended') then
        select status into previous_value from public.user_roles where user_id = p_target;
        event_name := case when p_value = 'active' then 'reactivated' else 'suspended' end;
    else raise exception 'invalid change' using errcode = '22023'; end if;
    if previous_value is null then raise exception 'user missing' using errcode = '22023'; end if;
    if previous_value = p_value then return; end if;
    if p_field = 'role' then
        update public.user_roles set role = p_value where user_id = p_target;
    else
        update public.user_roles set status = p_value where user_id = p_target;
    end if;
    if not exists(select 1 from public.user_roles where role = 'admin' and status = 'active') then
        raise exception 'last active admin must remain' using errcode = '42501';
    end if;
    insert into public.admin_audit_log(actor_id,target_id,action,old_value,new_value,reason)
        values(auth.uid(),p_target,event_name,previous_value,p_value,btrim(p_reason));
end;
$$;
revoke all on function public.admin_manage_user(uuid,text,text,text) from public, anon;
grant execute on function public.admin_manage_user(uuid,text,text,text) to authenticated;

create policy "Active admins read audit" on public.admin_audit_log for select to authenticated
    using ((select public.is_admin()));
grant select on public.admin_audit_log to authenticated;

-- Narrow projection, bounded pages, no personal address or financial information.
create function public.admin_list_users(p_search text default '', p_role text default '',
    p_status text default '', p_page integer default 1)
returns table(user_id uuid, username text, role text, status text,
    registered_at timestamptz, last_sign_in_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.is_admin() then raise exception 'admin required' using errcode = '42501'; end if;
    return query select r.user_id, p.username, r.role, r.status, u.created_at, u.last_sign_in_at, count(*) over()
    from public.user_roles r join public.profiles p on p.id = r.user_id join auth.users u on u.id = r.user_id
    where (p_search = '' or strpos(lower(coalesce(p.username,'')), lower(left(p_search,100))) > 0)
      and (p_role = '' or r.role = p_role) and (p_status = '' or r.status = p_status)
    order by u.created_at desc nulls last, r.user_id
    limit 20 offset ((least(greatest(p_page,1),100000)-1)::bigint * 20);
end;
$$;
revoke all on function public.admin_list_users(text,text,text,integer) from public, anon;
grant execute on function public.admin_list_users(text,text,text,integer) to authenticated;
