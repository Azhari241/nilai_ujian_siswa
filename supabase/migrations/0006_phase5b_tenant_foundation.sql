-- Phase 5B / 1: tenant identity, school settings, and baseline access control.
-- The legacy 0001-0005 files are historical migrations and are not replayed here.
-- This migration is for the verified empty public schema on the configured project.

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  school_name text not null check (length(btrim(school_name)) between 2 and 160),
  school_code text not null unique check (school_code ~ '^[A-Z0-9_-]{3,20}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete restrict,
  email text,
  full_name text not null default '',
  school_name text not null default '',
  subject text not null default '',
  role text not null default 'pending' check (role in ('pending','teacher','admin')),
  active boolean not null default true,
  platform_admin boolean not null default false,
  sign_enabled boolean not null default false,
  sign_title text not null default 'Guru Mata Pelajaran',
  sign_place text not null default '',
  sign_nip text not null default '',
  google_script_url text check (google_script_url is null or google_script_url ~ '^https://script\.google\.com/macros/s/.+/exec$'),
  google_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_school_id_idx on public.profiles(school_id);

create table public.app_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  portal_master boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.current_school_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p where p.id = auth.uid() and p.active;
$$;

create or replace function public.is_active_teacher()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.schools s on s.id = p.school_id
    where p.id = auth.uid() and p.active and p.role in ('teacher','admin') and s.status = 'ACTIVE'
  );
$$;

create or replace function public.is_school_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.schools s on s.id = p.school_id
    where p.id = auth.uid() and p.active and p.role = 'admin' and s.status = 'ACTIVE'
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.platform_admin);
$$;

create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    new.id := old.id;
    new.school_id := old.school_id;
    new.email := old.email;
    new.role := old.role;
    new.active := old.active;
    new.platform_admin := old.platform_admin;
    new.google_token := old.google_token;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger schools_set_updated_at before update on public.schools
for each row execute function public.set_updated_at();
create trigger profiles_protect_columns before update on public.profiles
for each row execute function public.protect_profile_columns();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;

create policy schools_read_tenant on public.schools
  for select to authenticated
  using (id = (select public.current_school_id()) or (select public.is_platform_admin()));
create policy schools_platform_admin_manage on public.schools
  for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

create policy profiles_read_self on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy app_settings_read_school on public.app_settings
  for select to authenticated
  using (school_id = (select public.current_school_id()) and (select public.is_active_teacher()));
create policy app_settings_update_school_admin on public.app_settings
  for update to authenticated
  using (school_id = (select public.current_school_id()) and (select public.is_school_admin()))
  with check (school_id = (select public.current_school_id()) and (select public.is_school_admin()));

revoke all on public.schools, public.profiles, public.app_settings from anon;
revoke all on public.schools, public.profiles, public.app_settings from authenticated;
grant select, insert, update, delete on public.schools to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.app_settings to authenticated;

revoke all on function public.current_school_id() from public, anon;
revoke all on function public.is_active_teacher() from public, anon;
revoke all on function public.is_school_admin() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_columns() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.current_school_id() to authenticated;
grant execute on function public.is_active_teacher() to authenticated;
grant execute on function public.is_school_admin() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
