-- Phase 5C: link private student accounts to Supabase Auth identities.
-- Existing credential columns are retained for migration compatibility but
-- become nullable and are never used by the Phase 5C authentication flow.

alter table public.student_accounts
  add column auth_user_id uuid not null references auth.users(id) on delete restrict,
  add column auth_email text not null,
  add column session_version uuid not null default gen_random_uuid(),
  add column credentials_updated_at timestamptz not null default now();

create unique index student_accounts_auth_user_id_uq
  on public.student_accounts(auth_user_id);
create unique index student_accounts_auth_email_uq
  on public.student_accounts(auth_email);

alter table public.student_accounts
  alter column password_hash drop not null,
  alter column password_salt drop not null,
  alter column password_iterations drop not null;

alter table public.student_accounts
  add constraint student_accounts_username_format_check
  check (username ~ '^[a-z0-9._-]{3,30}$');

alter table public.student_auth_events
  drop constraint if exists student_auth_events_event_check;

alter table public.student_auth_events
  add constraint student_auth_events_event_check
  check (event in (
    'login_failed', 'login_rate_limited', 'login_success', 'password_changed',
    'account_created', 'account_password_reset', 'account_disabled', 'account_enabled'
  ));

-- Keep Auth identity links and authentication telemetry inaccessible to
-- browser roles. Edge Functions use service_role after their own validation.
revoke all on public.student_accounts, public.student_auth_events from public, anon, authenticated;
grant select, insert, update, delete on public.student_accounts, public.student_auth_events to service_role;
