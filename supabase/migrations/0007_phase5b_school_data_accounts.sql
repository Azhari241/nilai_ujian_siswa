-- Phase 5B / 2: school-owned academic data and student account storage.
-- Tenant ownership is enforced by RLS plus composite foreign keys.

alter table public.profiles add constraint profiles_id_school_uq unique (id, school_id);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  name text not null check (length(btrim(name)) between 1 and 40),
  grade text not null check (grade ~ '^(1[0-2]|[1-9])$'),
  academic_year text not null check (academic_year ~ '^\d{4}/\d{4}$'),
  homeroom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id, school_id),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade
);
create unique index classes_owner_name_year_uq on public.classes(teacher_id, school_id, lower(name), academic_year);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  name text not null check (length(btrim(name)) between 1 and 80),
  code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id, school_id),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade
);
create unique index subjects_owner_name_uq on public.subjects(teacher_id, school_id, lower(name));

create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  nisn text check (nisn is null or nisn ~ '^\d{10}$'),
  nis text check (nis is null or length(nis) <= 20),
  full_name text not null check (length(btrim(full_name)) >= 2),
  class_id uuid not null,
  student_code text not null check (student_code ~ '^[A-Z0-9_-]{3,20}$'),
  birth_date date,
  status text not null default 'aktif' check (status in ('aktif','nonaktif','lulus','pindah')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id, school_id),
  unique (teacher_id, school_id, student_code),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade,
  foreign key (class_id, teacher_id, school_id) references public.classes(id, teacher_id, school_id) on delete restrict
);
create unique index students_owner_nisn_uq on public.students(teacher_id, school_id, nisn) where nisn is not null;
create unique index students_owner_nis_uq on public.students(teacher_id, school_id, nis) where nis is not null;
create index students_class_idx on public.students(class_id);
create index students_name_idx on public.students(lower(full_name));

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  name text not null check (length(btrim(name)) >= 2),
  subject_id uuid not null,
  class_id uuid not null,
  semester text not null check (semester in ('Ganjil','Genap')),
  academic_year text not null check (academic_year ~ '^\d{4}/\d{4}$'),
  exam_type text not null default '',
  kind text not null default 'ujian' check (kind in ('ujian','tugas','manual')),
  delivery text not null default 'google_form' check (delivery in ('google_form','manual')),
  task_type text,
  category text,
  description text,
  instructions text,
  date date not null default current_date,
  start_date date,
  due_date date,
  kktp numeric(5,2) not null default 75 check (kktp between 0 and 100),
  max_score numeric(6,2) not null default 100 check (max_score > 0 and max_score <= 1000),
  status text not null default 'draft' check (status in ('draft','aktif','ditutup','selesai','arsip')),
  question_count integer not null default 0 check (question_count >= 0),
  google_form_id text,
  google_form_url text check (google_form_url is null or google_form_url ~ '^https://docs\.google\.com/forms/'),
  google_form_edit_url text,
  google_form_created_at timestamptz,
  google_form_security jsonb,
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id, school_id),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade,
  foreign key (class_id, teacher_id, school_id) references public.classes(id, teacher_id, school_id) on delete restrict,
  foreign key (subject_id, teacher_id, school_id) references public.subjects(id, teacher_id, school_id) on delete restrict
);
create index exams_owner_filter_idx on public.exams(teacher_id, school_id, academic_year, semester, class_id, subject_id);
create index exams_owner_kind_idx on public.exams(teacher_id, school_id, kind);

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  exam_id uuid not null,
  number integer not null check (number > 0),
  question text not null,
  qtype text not null default 'mc' check (qtype in ('mc','essay')),
  options jsonb,
  answer_key text,
  points integer not null check (points between 1 and 100),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exam_id, number),
  foreign key (exam_id, teacher_id, school_id) references public.exams(id, teacher_id, school_id) on delete cascade,
  check (
    (qtype = 'mc' and jsonb_typeof(options) = 'object' and options ? 'A' and options ? 'B'
      and answer_key in ('A','B','C','D','E') and options ? answer_key)
    or (qtype = 'essay' and options is null and answer_key is null)
  )
);
create index exam_questions_owner_exam_idx on public.exam_questions(teacher_id, school_id, exam_id);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  exam_id uuid not null,
  student_id uuid not null,
  score numeric(5,2) not null check (score between 0 and 100),
  raw_score numeric(7,2),
  mc_score numeric(7,2),
  essay_score numeric(7,2),
  note text check (note is null or length(note) <= 500),
  source text not null default 'manual' check (source in ('manual','google_forms')),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, student_id),
  foreign key (exam_id, teacher_id, school_id) references public.exams(id, teacher_id, school_id) on delete cascade,
  foreign key (student_id, teacher_id, school_id) references public.students(id, teacher_id, school_id) on delete restrict
);
create index grades_owner_student_idx on public.grades(teacher_id, school_id, student_id);

create table public.exam_responses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  exam_id uuid not null,
  response_id text not null,
  student_id uuid,
  identifier text,
  respondent_name text,
  respondent_email text check (respondent_email is null or length(respondent_email) <= 320),
  raw_score numeric,
  max_score numeric,
  mc_score numeric,
  mc_max numeric,
  essay_max numeric,
  answers jsonb,
  submitted_at timestamptz,
  review_status text check (review_status is null or review_status in ('ok','nama_ganda','akun_multi_nama','konflik_nilai_lama','dipilih','ditolak')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exam_id, response_id),
  foreign key (exam_id, teacher_id, school_id) references public.exams(id, teacher_id, school_id) on delete cascade,
  foreign key (student_id, teacher_id, school_id) references public.students(id, teacher_id, school_id) on delete restrict
);
create index exam_responses_owner_exam_idx on public.exam_responses(teacher_id, school_id, exam_id);
create index exam_responses_owner_email_idx on public.exam_responses(teacher_id, school_id, lower(respondent_email)) where respondent_email is not null;
create index exam_responses_owner_review_idx on public.exam_responses(teacher_id, school_id, exam_id, review_status);

create table public.publication_settings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  exam_id uuid not null unique,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (exam_id, teacher_id, school_id) references public.exams(id, teacher_id, school_id) on delete cascade
);

create table public.portal_settings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  enabled boolean not null default false,
  message text not null default '' check (length(message) <= 300),
  school_name text not null default '',
  academic_year text not null default '2026/2027' check (academic_year ~ '^\d{4}/\d{4}$'),
  semester text not null default 'Ganjil' check (semester in ('Ganjil','Genap')),
  default_kktp numeric(5,2) not null default 75 check (default_kktp between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade
);

create table public.student_accounts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  school_id uuid not null,
  student_id uuid not null unique,
  username text not null unique check (username = lower(username) and length(username) between 3 and 80),
  password_hash text not null,
  password_salt text not null,
  password_iterations integer not null check (password_iterations between 100000 and 2000000),
  account_status text not null default 'PENDING_APPROVAL' check (account_status in ('PENDING_APPROVAL','ACTIVE','REJECTED','DISABLED')),
  must_change_password boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, teacher_id, school_id) references public.students(id, teacher_id, school_id) on delete restrict
);

create table public.student_auth_events (
  id bigint generated always as identity primary key,
  event text not null check (event in ('login_failed','login_rate_limited','login_success','password_changed')),
  username text not null,
  account_id uuid,
  student_id uuid,
  teacher_id uuid,
  school_id uuid,
  created_at timestamptz not null default now()
);
create index student_auth_events_username_time_idx on public.student_auth_events(lower(username), created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid references public.profiles(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_school_time_idx on public.audit_logs(school_id, created_at desc);

-- Updated-at triggers on mutable tenant tables.
do $$ declare t text; begin
  foreach t in array array['classes','subjects','students','exams','grades','publication_settings','portal_settings','student_accounts'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- Explicitly enable RLS even though ensure_rls currently does this automatically.
do $$ declare t text; begin
  foreach t in array array['classes','subjects','students','exams','exam_questions','grades','exam_responses','publication_settings','portal_settings','student_accounts','student_auth_events','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['classes','subjects','students','exams','exam_questions','grades','exam_responses','publication_settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher())) with check (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_delete', t);
  end loop;
end $$;
create policy portal_settings_owner_select on public.portal_settings
  for select to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()));
create policy portal_settings_owner_update on public.portal_settings
  for update to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))
  with check (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()));
create policy audit_logs_owner_select on public.audit_logs
  for select to authenticated using (actor = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()));
create policy audit_logs_owner_insert on public.audit_logs
  for insert to authenticated with check (actor = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()));

-- Student credentials and authentication telemetry are server-only until Phase 5C RPCs exist.
revoke all on public.student_accounts, public.student_auth_events from public, anon, authenticated;
grant all on public.student_accounts, public.student_auth_events to service_role;
revoke all on public.classes, public.subjects, public.students, public.exams, public.exam_questions,
  public.grades, public.exam_responses, public.publication_settings, public.portal_settings, public.audit_logs
  from anon;
grant select, insert, update, delete on public.classes, public.subjects, public.students, public.exams,
  public.exam_questions, public.grades, public.exam_responses, public.publication_settings, public.portal_settings
  to authenticated;
grant select, insert on public.audit_logs to authenticated;
