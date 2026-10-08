-- Lists what is deployed in a database, to compare the hosted project with a
-- local rebuild from the migrations (supabase/README.md). Read-only.
--
-- Run it in the SQL Editor and locally; apart from the data line, the two
-- results must match. Line breaks inside an item become <br>, as in the SQL
-- Editor's export, so both results compare line by line.
with items(section, item) as (
  select 'migration history',
         case when to_regclass('supabase_migrations.schema_migrations') is null
              then 'no history table (migrations applied by hand)'
              else (xpath('/row/v/text()', query_to_xml(
                     'select string_agg(version, '', '' order by version) as v from supabase_migrations.schema_migrations',
                     false, true, '')))[1]::text
         end
  union all
  select 'table', c.relname::text
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  union all
  select 'rls', c.relname || case when c.relrowsecurity then ' on' else ' OFF' end
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  union all
  select 'column', table_name || '.' || column_name || ' ' || data_type
         || case when is_nullable = 'NO' then ' not null' else '' end
         || coalesce(' default ' || column_default, '')
    from information_schema.columns where table_schema = 'public'
  union all
  select 'constraint', conrelid::regclass::text || ' ' || conname || ': ' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'index', indexdef from pg_indexes where schemaname = 'public'
  union all
  select 'policy', tablename || ' "' || policyname || '" ' || cmd || ' to ' || array_to_string(roles, ',')
         || coalesce(' using ' || qual, '') || coalesce(' check ' || with_check, '')
    from pg_policies where schemaname = 'public'
  union all
  select 'function', p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  select 'trigger', n.nspname || '.' || c.relname || ' ' || t.tgname
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
  union all
  select 'grant', grantee || ' ' || privilege_type || ' on ' || table_name
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select 'column grant', grantee || ' ' || privilege_type || ' on ' || table_name || '.' || column_name
    from information_schema.column_privileges
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'
  union all
  select 'data', 'users ' || (select count(*) from auth.users)
         || ', accounts ' || (select count(*) from public.accounts)
         || ', transactions ' || (select count(*) from public.transactions)
)
select section, replace(item, E'\n', '<br>') as item from items order by section, item;
