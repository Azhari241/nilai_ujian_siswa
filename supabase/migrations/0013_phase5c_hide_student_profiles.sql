-- Student Auth identities have a private internal email alias in profiles.email.
-- Keep teacher profile behavior while denying student JWTs direct profile reads
-- and updates. Student identity is returned only by the validated Edge Function.

drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_read_self
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    and coalesce((select auth.jwt() -> 'app_metadata' ->> 'account_type'), '') <> 'student'
  );

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (
    id = (select auth.uid())
    and coalesce((select auth.jwt() -> 'app_metadata' ->> 'account_type'), '') <> 'student'
  )
  with check (
    id = (select auth.uid())
    and coalesce((select auth.jwt() -> 'app_metadata' ->> 'account_type'), '') <> 'student'
  );
