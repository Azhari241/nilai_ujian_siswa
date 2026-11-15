-- Phase 5B audit follow-up: preserve policy semantics, avoid per-row auth calls,
-- remove the overlapping schools SELECT policy, and index uncovered foreign keys.

-- Replace auth.uid() row expressions with initplan form without changing policy roles.
do $$
declare p record; using_expr text; check_expr text; stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
  loop
    using_expr := case when p.qual is null then null else replace(p.qual, 'auth.uid()', '(select auth.uid())') end;
    check_expr := case when p.with_check is null then null else replace(p.with_check, 'auth.uid()', '(select auth.uid())') end;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if using_expr is not null then stmt := stmt || format(' using (%s)', using_expr); end if;
    if check_expr is not null then stmt := stmt || format(' with check (%s)', check_expr); end if;
    execute stmt;
  end loop;
end;
$$;

-- Keep the same effective rule but express the school read and admin writes as
-- separate commands, avoiding two permissive SELECT policies being OR-combined.
drop policy schools_read_tenant on public.schools;
drop policy schools_platform_admin_manage on public.schools;
create policy schools_read_tenant on public.schools
  for select to authenticated
  using (id = (select public.current_school_id()) or (select public.is_platform_admin()));
create policy schools_platform_admin_insert on public.schools
  for insert to authenticated with check ((select public.is_platform_admin()));
create policy schools_platform_admin_update on public.schools
  for update to authenticated using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy schools_platform_admin_delete on public.schools
  for delete to authenticated using ((select public.is_platform_admin()));

-- Add a leading-column index for each FK not already covered by a valid,
-- non-partial index. On the currently empty schema these are metadata-only rows.
do $$
declare fk record; cols text; idx_name text;
begin
  for fk in
    select c.oid, c.conrelid, c.conname, c.conkey
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid and i.indisvalid and i.indisready
          and i.indpred is null and i.indnkeyatts >= cardinality(c.conkey)
          and (select array_agg(i.indkey[s.s - 1]::smallint order by s.s)
               from generate_subscripts(c.conkey, 1) as s(s)) = c.conkey
      )
  loop
    select string_agg(format('%I', a.attname), ', ' order by k.ord)
      into cols
      from unnest(fk.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum;
    idx_name := format('idx_fk_%s_%s', (fk.conrelid::regclass)::text, substr(md5(fk.conname), 1, 10));
    execute format('create index %I on %s (%s)', idx_name, fk.conrelid::regclass, cols);
  end loop;
end;
$$;
