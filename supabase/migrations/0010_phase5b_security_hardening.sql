-- Phase 5B security hardening based on live advisor findings and RLS tests.
-- Keep the internal ensure_rls event trigger installed and enabled.

-- These helpers only read the caller's own profile/school. Invoker execution
-- avoids exposing SECURITY DEFINER RPC endpoints while preserving policy use.
alter function public.current_school_id() security invoker;
alter function public.is_active_teacher() security invoker;
alter function public.is_school_admin() security invoker;
alter function public.is_platform_admin() security invoker;

-- Event trigger functions are invoked by PostgreSQL's DDL event trigger,
-- not by clients. Remove their default PUBLIC RPC execute privilege.
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;

-- These two tables are server-only until validated student endpoints are added.
-- Restrictive false policies preserve the denial if a permissive policy is
-- accidentally added later; direct client table privileges remain revoked.
create policy student_accounts_deny_client
  on public.student_accounts as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy student_auth_events_deny_client
  on public.student_auth_events as restrictive for all to anon, authenticated
  using (false) with check (false);
revoke all on public.student_accounts, public.student_auth_events from public, anon, authenticated;
grant select, insert, update, delete on public.student_accounts, public.student_auth_events to service_role;
