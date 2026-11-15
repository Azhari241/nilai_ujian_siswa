-- Phase 5B / 3: persistent game definitions, assignments, attempts, and live rooms.
-- Student-facing mutations remain service-only until Phase 5C adds validated RPCs.

alter table public.student_accounts
  add constraint student_accounts_owner_identity_uq unique (id, teacher_id, school_id, student_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '',
  template text not null check (template in ('who_am_i','letters','memory','sentence','true_false','competition')),
  subject_id uuid,
  chapter text not null default '',
  material text not null default '',
  difficulty text not null default 'Sedang',
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  settings jsonb not null default '{"modes":["individual","live"],"duration_seconds":600,"question_count":1,"points_per_question":10,"wrong_points":0,"shuffle_questions":true,"shuffle_options":true,"max_attempts":1,"show_explanation":true,"show_leaderboard":true,"speed_bonus":false}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id, school_id),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade,
  foreign key (subject_id, teacher_id, school_id) references public.subjects(id, teacher_id, school_id) on delete restrict
);
create index games_owner_status_idx on public.games(teacher_id, school_id, status);

create table public.game_questions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  game_id uuid not null,
  position integer not null check (position > 0),
  question_type text not null,
  prompt text not null check (length(btrim(prompt)) > 0),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  correct_answer jsonb not null,
  pair_left_id text,
  pair_right_id text,
  pair_map jsonb,
  explanation text,
  points numeric(8,2) not null default 10 check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, position),
  unique (id, teacher_id, school_id),
  foreign key (game_id, teacher_id, school_id) references public.games(id, teacher_id, school_id) on delete cascade
);

create table public.game_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  game_id uuid not null,
  class_id uuid not null,
  published boolean not null default true,
  enabled boolean not null default true,
  status text not null default 'PUBLISHED' check (status in ('DRAFT','PUBLISHED','DISABLED','ARCHIVED')),
  start_at timestamptz,
  end_at timestamptz,
  max_attempts integer not null default 0 check (max_attempts between 0 and 1000),
  modes text[] not null default array['individual']::text[] check (cardinality(modes) > 0 and modes <@ array['individual','live']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, game_id, class_id, teacher_id, school_id),
  foreign key (game_id, teacher_id, school_id) references public.games(id, teacher_id, school_id) on delete restrict,
  foreign key (class_id, teacher_id, school_id) references public.classes(id, teacher_id, school_id) on delete restrict,
  check (end_at is null or start_at is null or end_at >= start_at)
);
create unique index game_assignments_enabled_class_uq on public.game_assignments(game_id, class_id, teacher_id, school_id) where enabled;

create table public.live_game_rooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  school_id uuid not null default public.current_school_id(),
  class_id uuid not null,
  game_id uuid not null,
  assignment_id uuid not null,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status text not null default 'WAITING' check (status in ('WAITING','LOCKED','COUNTDOWN','IN_PROGRESS','PAUSED','COMPLETED','CANCELLED','EXPIRED')),
  min_participants integer not null default 2 check (min_participants between 1 and 100),
  max_participants integer not null default 30 check (max_participants between min_participants and 100),
  allow_late_join boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  countdown_ends_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  unique (id, teacher_id, school_id, class_id),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade,
  foreign key (class_id, teacher_id, school_id) references public.classes(id, teacher_id, school_id) on delete restrict,
  foreign key (game_id, teacher_id, school_id) references public.games(id, teacher_id, school_id) on delete restrict,
  foreign key (assignment_id, game_id, class_id, teacher_id, school_id)
    references public.game_assignments(id, game_id, class_id, teacher_id, school_id) on delete restrict
);
create index live_game_rooms_owner_status_idx on public.live_game_rooms(teacher_id, school_id, status, created_at desc);

create table public.game_attempts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  account_id uuid not null,
  game_id uuid not null,
  assignment_id uuid not null,
  session_id uuid,
  attempt_number integer not null check (attempt_number > 0),
  mode text not null check (mode in ('individual','live')),
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS','COMPLETED','ABANDONED','EXPIRED')),
  memory_moves integer not null default 0 check (memory_moves >= 0),
  speed_bonus boolean not null default false,
  allotted_seconds numeric(10,2) not null default 0 check (allotted_seconds >= 0),
  question_snapshot jsonb not null check (jsonb_typeof(question_snapshot) = 'array'),
  answer_snapshot jsonb not null check (jsonb_typeof(answer_snapshot) = 'array'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  response_times jsonb not null default '{}'::jsonb check (jsonb_typeof(response_times) = 'object'),
  current_index integer not null default 0 check (current_index >= 0),
  matched_card_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(matched_card_ids) = 'array'),
  last_feedback jsonb,
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  completed_at timestamptz,
  result_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id, school_id),
  unique (id, teacher_id, school_id, student_id, account_id),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade,
  foreign key (class_id, teacher_id, school_id) references public.classes(id, teacher_id, school_id) on delete restrict,
  foreign key (student_id, teacher_id, school_id) references public.students(id, teacher_id, school_id) on delete restrict,
  foreign key (account_id, teacher_id, school_id, student_id) references public.student_accounts(id, teacher_id, school_id, student_id) on delete restrict,
  foreign key (game_id, teacher_id, school_id) references public.games(id, teacher_id, school_id) on delete restrict,
  foreign key (assignment_id, game_id, class_id, teacher_id, school_id)
    references public.game_assignments(id, game_id, class_id, teacher_id, school_id) on delete restrict,
  foreign key (session_id, teacher_id, school_id, class_id)
    references public.live_game_rooms(id, teacher_id, school_id, class_id) on delete restrict
);
create index game_attempts_student_assignment_idx on public.game_attempts(student_id, account_id, assignment_id, status);
create index game_attempts_owner_idx on public.game_attempts(teacher_id, school_id, created_at desc);

create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  account_id uuid not null,
  game_id uuid not null,
  assignment_id uuid not null,
  attempt_id uuid not null unique,
  session_id uuid,
  attempt_number integer not null check (attempt_number > 0),
  mode text not null check (mode in ('individual','live')),
  score numeric(5,2) not null check (score between 0 and 100),
  bonus_points integer not null default 0 check (bonus_points between 0 and 100),
  memory_moves integer not null default 0 check (memory_moves >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  total_questions integer not null check (total_questions > 0),
  details jsonb not null default '[]'::jsonb check (jsonb_typeof(details) = 'array'),
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  status text not null default 'COMPLETED' check (status = 'COMPLETED'),
  created_at timestamptz not null default now(),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id) on delete cascade,
  foreign key (class_id, teacher_id, school_id) references public.classes(id, teacher_id, school_id) on delete restrict,
  foreign key (student_id, teacher_id, school_id) references public.students(id, teacher_id, school_id) on delete restrict,
  foreign key (account_id, teacher_id, school_id, student_id) references public.student_accounts(id, teacher_id, school_id, student_id) on delete restrict,
  foreign key (game_id, teacher_id, school_id) references public.games(id, teacher_id, school_id) on delete restrict,
  foreign key (assignment_id, game_id, class_id, teacher_id, school_id)
    references public.game_assignments(id, game_id, class_id, teacher_id, school_id) on delete restrict,
  foreign key (attempt_id, teacher_id, school_id, student_id, account_id)
    references public.game_attempts(id, teacher_id, school_id, student_id, account_id) on delete restrict,
  foreign key (session_id, teacher_id, school_id, class_id)
    references public.live_game_rooms(id, teacher_id, school_id, class_id) on delete restrict
);
create index game_results_student_time_idx on public.game_results(student_id, account_id, completed_at desc);
create index game_results_owner_room_score_idx on public.game_results(teacher_id, school_id, session_id, score desc);

create table public.live_game_participants (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  room_id uuid not null,
  student_id uuid not null,
  account_id uuid not null,
  student_name text not null,
  status text not null default 'JOINED' check (status in ('JOINED','REMOVED','LEFT')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (room_id, student_id),
  unique (id, teacher_id, school_id),
  foreign key (room_id, teacher_id, school_id, class_id) references public.live_game_rooms(id, teacher_id, school_id, class_id) on delete cascade,
  foreign key (student_id, teacher_id, school_id) references public.students(id, teacher_id, school_id) on delete restrict,
  foreign key (account_id, teacher_id, school_id, student_id) references public.student_accounts(id, teacher_id, school_id, student_id) on delete restrict
);
create index live_game_participants_room_status_idx on public.live_game_participants(room_id, status);

-- Updated-at triggers.
do $$ declare t text; begin
  foreach t in array array['games','game_questions','game_assignments','live_game_rooms','game_attempts'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['games','game_questions','game_assignments','live_game_rooms','game_attempts','game_results','live_game_participants'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['games','game_questions','game_assignments','live_game_rooms'] loop
    execute format('create policy %I on public.%I for select to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher())) with check (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_delete', t);
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['game_attempts','game_results','live_game_participants'] loop
    execute format('create policy %I on public.%I for select to authenticated using (teacher_id = auth.uid() and school_id = (select public.current_school_id()) and (select public.is_active_teacher()))', t || '_owner_select', t);
  end loop;
end $$;

revoke all on public.games, public.game_questions, public.game_assignments, public.live_game_rooms,
  public.game_attempts, public.game_results, public.live_game_participants from anon;
grant select, insert, update, delete on public.games, public.game_questions, public.game_assignments,
  public.live_game_rooms to authenticated;
grant select on public.game_attempts, public.game_results, public.live_game_participants to authenticated;
grant all on public.games, public.game_questions, public.game_assignments, public.live_game_rooms,
  public.game_attempts, public.game_results, public.live_game_participants to service_role;
