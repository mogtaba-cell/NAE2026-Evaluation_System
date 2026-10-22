-- NAE Evaluation System v2 schema (additive: every table is prefixed nae_, the old tables are untouched)
-- Apply once. Safe to re-run: every statement is "if not exists" or "on conflict do nothing".
create extension if not exists "pgcrypto";

-- ---------- people ----------
create table if not exists nae_accounts (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text not null,
  email text,
  role text not null check (role in ('admin','coordinator','evaluator','management','storage','leadership')),
  pathways text[] not null default '{}',
  active boolean not null default true,
  password_hash text not null,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- evaluators can exist without a login (they score on paper; a coordinator enters their scores)
create table if not exists nae_evaluators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_id uuid unique references nae_accounts(id) on delete set null,
  pathways text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- program structure ----------
create table if not exists nae_pathways (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('Expressions','Arts')),
  code text unique not null,
  name text unique not null,
  sort int not null default 0,
  status text not null default 'setup' check (status in ('setup','open','closed')),
  created_at timestamptz not null default now()
);

create table if not exists nae_rubrics (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  pathway_code text references nae_pathways(code) on update cascade,
  created_at timestamptz not null default now()
);

-- criteria: [{key,label,weight (0-100),description}]  grade_bands: [{grade,min}]
create table if not exists nae_rubric_versions (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references nae_rubrics(id) on delete cascade,
  version int not null,
  status text not null default 'draft' check (status in ('draft','published','retired')),
  criteria jsonb not null default '[]'::jsonb,
  identity_required boolean not null default false,
  grade_bands jsonb not null default '[{"grade":"A","min":80},{"grade":"B","min":50},{"grade":"C","min":0}]'::jsonb,
  published_at timestamptz,
  published_by uuid references nae_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (rubric_id, version)
);

create table if not exists nae_subpathways (
  id uuid primary key default gen_random_uuid(),
  pathway_code text not null references nae_pathways(code) on update cascade,
  code text not null,
  name text not null,
  is_physical boolean not null default false,
  rubric_r1 uuid references nae_rubrics(id) on delete set null,
  rubric_r2 uuid references nae_rubrics(id) on delete set null,
  sort int not null default 0,
  unique (pathway_code, code),
  unique (pathway_code, name)
);

-- pass_rule: {"min_score":75} or {"grades":["A","B"]} optionally {"identity":true}
create table if not exists nae_rounds (
  id uuid primary key default gen_random_uuid(),
  pathway_code text not null references nae_pathways(code) on update cascade,
  round_no smallint not null check (round_no in (1,2)),
  name text not null,
  mode text not null default 'online' check (mode in ('online','physical','mixed')),
  status text not null default 'setup' check (status in ('setup','open','closed')),
  opens_on date,
  closes_on date,
  pass_rule jsonb not null default '{"min_score":75}'::jsonb,
  evaluators_per_entry smallint not null default 2,
  flag_margin smallint not null default 3,
  spread_limit smallint not null default 15,
  review_hours smallint not null default 48,
  locked boolean not null default false,
  opened_at timestamptz,
  closed_at timestamptz,
  unique (pathway_code, round_no)
);

-- ---------- schools, entries, students ----------
create table if not exists nae_schools (
  id uuid primary key default gen_random_uuid(),
  esis text unique not null,
  name text not null,
  school_type text,
  region text,
  updated_at timestamptz not null default now()
);

create table if not exists nae_entries (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  reference_id text unique not null,
  registration_id text,
  submitted_at timestamptz,
  pathway_code text not null references nae_pathways(code) on update cascade,
  sub_code text not null,
  school_id uuid references nae_schools(id) on delete set null,
  title_en text,
  title_ar text,
  description_en text,
  description_ar text,
  reflections jsonb not null default '{}'::jsonb,
  group_name text,
  registration_type text,
  students_count int not null default 1,
  grades_text text,
  medium text,
  size_text text,
  art_link text,
  source_path text,
  source_key text,
  drive_folder_id text,
  coordinator_id uuid references nae_accounts(id) on delete set null,
  current_round smallint not null default 1,
  status text not null default 'not_open',
  files_count int not null default 0,
  files_checked_at timestamptz,
  search_text text not null default '',
  raw jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nae_entries_pathway_idx on nae_entries(pathway_code, sub_code);
create index if not exists nae_entries_school_idx on nae_entries(school_id);
create index if not exists nae_entries_status_idx on nae_entries(status, current_round);
create index if not exists nae_entries_coord_idx on nae_entries(coordinator_id);
create index if not exists nae_entries_source_key_idx on nae_entries(source_key);

create table if not exists nae_entry_students (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references nae_entries(id) on delete cascade,
  position int not null default 1,
  name_en text,
  name_ar text,
  grade text,
  esis text,
  nationality text,
  gender text,
  consent boolean,
  unique (entry_id, position)
);
create index if not exists nae_entry_students_esis_idx on nae_entry_students(esis);

-- ---------- files (index of the Google Drive copy of the SharePoint folders) ----------
create table if not exists nae_entry_files (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references nae_entries(id) on delete cascade,
  drive_id text unique not null,
  name text not null,
  mime text,
  size_bytes bigint,
  kind text not null default 'other',
  path text,
  modified_at timestamptz,
  preview_drive_id text,
  preview_mime text,
  match_method text,
  synced_at timestamptz not null default now()
);
create index if not exists nae_entry_files_entry_idx on nae_entry_files(entry_id);

create table if not exists nae_folder_links (
  path_key text primary key,
  path text not null,
  entry_id uuid references nae_entries(id) on delete cascade,
  ignored boolean not null default false,
  linked_by uuid references nae_accounts(id) on delete set null,
  linked_at timestamptz not null default now()
);

create table if not exists nae_unmatched_folders (
  path_key text primary key,
  path text not null,
  drive_id text,
  files_count int not null default 0,
  reason text,
  suggested_entry_id uuid references nae_entries(id) on delete set null,
  seen_at timestamptz not null default now()
);

create table if not exists nae_sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'index',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  state jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_by uuid references nae_accounts(id) on delete set null
);

-- ---------- scoring ----------
create table if not exists nae_assignments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references nae_rounds(id) on delete cascade,
  entry_id uuid not null references nae_entries(id) on delete cascade,
  evaluator_id uuid not null references nae_evaluators(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, entry_id, evaluator_id)
);
create index if not exists nae_assignments_eval_idx on nae_assignments(evaluator_id, round_id);

create table if not exists nae_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references nae_rounds(id) on delete cascade,
  entry_id uuid not null references nae_entries(id) on delete cascade,
  evaluator_id uuid not null references nae_evaluators(id) on delete cascade,
  rubric_version_id uuid references nae_rubric_versions(id) on delete set null,
  scores jsonb not null default '{}'::jsonb,
  national_identity boolean,
  total int,
  comment text,
  status text not null default 'draft' check (status in ('draft','submitted')),
  entered_by uuid references nae_accounts(id) on delete set null,
  session_id uuid,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (round_id, entry_id, evaluator_id)
);
create index if not exists nae_scores_entry_idx on nae_scores(entry_id);

create table if not exists nae_results (
  entry_id uuid not null references nae_entries(id) on delete cascade,
  round_no smallint not null,
  round_id uuid references nae_rounds(id) on delete cascade,
  team int,
  final int,
  grade text,
  identity_yes boolean,
  scored int not null default 0,
  needed int not null default 0,
  complete boolean not null default false,
  passed boolean,
  locked boolean not null default false,
  flag text,
  updated_at timestamptz not null default now(),
  primary key (entry_id, round_no)
);

create table if not exists nae_reviews (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references nae_entries(id) on delete cascade,
  round_no smallint not null,
  reason text not null,
  note text,
  flagged_by uuid references nae_accounts(id) on delete set null,
  flagged_at timestamptz not null default now(),
  due_at timestamptz not null,
  manager_id uuid references nae_accounts(id) on delete set null,
  status text not null default 'open' check (status in ('open','confirmed','overridden')),
  decided_at timestamptz,
  decided_by uuid references nae_accounts(id) on delete set null,
  team_at_flag int,
  new_result int,
  decision_note text
);
create index if not exists nae_reviews_status_idx on nae_reviews(status, manager_id);

-- ---------- physical rounds ----------
create table if not exists nae_sessions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references nae_rounds(id) on delete cascade,
  title text not null,
  session_date date,
  time_text text,
  venue text,
  coordinator_id uuid references nae_accounts(id) on delete set null,
  evaluator_ids uuid[] not null default '{}',
  status text not null default 'planned' check (status in ('planned','live','done')),
  created_at timestamptz not null default now()
);
create table if not exists nae_session_entries (
  session_id uuid not null references nae_sessions(id) on delete cascade,
  entry_id uuid not null references nae_entries(id) on delete cascade,
  position int not null default 0,
  primary key (session_id, entry_id)
);

create table if not exists nae_collections (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  school_id uuid references nae_schools(id) on delete set null,
  pathway_code text references nae_pathways(code) on update cascade,
  scheduled_on date,
  status text not null default 'scheduled' check (status in ('scheduled','checked_in')),
  handed_by text,
  checked_in_by uuid references nae_accounts(id) on delete set null,
  checked_in_at timestamptz
);
create table if not exists nae_logistics (
  entry_id uuid primary key references nae_entries(id) on delete cascade,
  collection_id uuid references nae_collections(id) on delete set null,
  state text not null default 'to_collect' check (state in ('to_collect','storage','coordinator','missing','returned')),
  location text,
  condition text,
  updated_at timestamptz not null default now()
);

-- ---------- import history, audit ----------
create table if not exists nae_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  rows int, created int, updated int, errors jsonb,
  by_id uuid references nae_accounts(id) on delete set null,
  at timestamptz not null default now()
);
create table if not exists nae_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  object_type text,
  object_id text,
  detail text
);
create index if not exists nae_audit_at_idx on nae_audit(at desc);
create index if not exists nae_audit_obj_idx on nae_audit(object_id);

create table if not exists nae_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- numbering: next code number per subpathway ----------
create or replace function nae_next_codes(p_pathway text, p_sub text, p_count int)
returns int language plpgsql as $$
declare n int;
begin
  select coalesce(max(nullif(regexp_replace(code, '^.*-(\d+)$', '\1'), code)::int), 0)
    into n from nae_entries where pathway_code = p_pathway and sub_code = p_sub;
  return n + 1;
end $$;

-- summary views used by dashboards
create or replace view nae_v_entry_counts as
  select e.pathway_code, e.sub_code, e.current_round, e.status, count(*)::int as n, sum(e.students_count)::int as students
  from nae_entries e group by 1,2,3,4;

-- lock down: only the server (service role) reads and writes these tables
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'nae\_%' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
alter view nae_v_entry_counts set (security_invoker = true);

-- raw listing of the GVC Shared Drive (folders and files), refreshed by the index job
create table if not exists nae_drive_items (
  id text primary key,
  name text not null,
  parent text,
  is_folder boolean not null default false,
  mime text,
  size_bytes bigint,
  modified_at timestamptz,
  md5 text,
  run_id uuid,
  seen_at timestamptz not null default now()
);
create index if not exists nae_drive_items_parent_idx on nae_drive_items(parent);
alter table nae_drive_items enable row level security;

create or replace function nae_recount_files() returns void language sql as $$
  update nae_entries e set files_count = coalesce(c.n, 0), files_checked_at = now()
  from (select x.id, (select count(*) from nae_entry_files f where f.entry_id = x.id) as n from nae_entries x) c
  where c.id = e.id and e.files_count is distinct from coalesce(c.n, 0) or (c.id = e.id and e.files_checked_at is null);
$$;

drop function if exists nae_status_counts(text, text, text, text, text, uuid, text[]);
create or replace function nae_status_counts(p_q text default null, p_pathway text default null, p_sub text default null, p_region text default null, p_type text default null, p_coord uuid default null, p_pathways text[] default null, p_scope_coord uuid default null)
returns table(current_round smallint, status text, n int) language sql stable as $$
  select e.current_round, e.status, count(*)::int from nae_entries e left join nae_schools s on s.id = e.school_id
  where (p_q is null or e.search_text like '%' || lower(p_q) || '%')
    and (p_pathway is null or e.pathway_code = p_pathway) and (p_sub is null or e.sub_code = p_sub)
    and (p_region is null or s.region = p_region) and (p_type is null or s.school_type = p_type)
    and (p_coord is null or e.coordinator_id = p_coord)
    and (p_pathways is null or e.pathway_code = any(p_pathways) or e.coordinator_id = p_scope_coord)
  group by 1, 2;
$$;

create or replace view nae_v_student_stats as
  select 'nationality'::text as dim, coalesce(nationality, 'Not given') as label, count(*)::int as n from nae_entry_students group by 2
  union all select 'gender', coalesce(gender, 'Not given'), count(*)::int from nae_entry_students group by 2
  union all select 'consent', case when consent then 'Yes' when consent = false then 'No' else 'Not given' end, count(*)::int from nae_entry_students group by 2;
create or replace view nae_v_school_stats as
  select 'region'::text as dim, coalesce(s.region, 'Not given') as label, count(*)::int as n from nae_entries e left join nae_schools s on s.id = e.school_id group by 2
  union all select 'type', coalesce(s.school_type, 'Not given'), count(*)::int from nae_entries e left join nae_schools s on s.id = e.school_id group by 2;
alter view nae_v_student_stats set (security_invoker = true);
alter view nae_v_school_stats set (security_invoker = true);
create or replace function nae_scoring_progress() returns table(round_id uuid, assigned int, submitted int) language sql stable as $$
  select a.round_id, count(*)::int, count(s.id) filter (where s.status = 'submitted')::int
  from nae_assignments a left join nae_scores s on s.round_id = a.round_id and s.entry_id = a.entry_id and s.evaluator_id = a.evaluator_id
  group by a.round_id;
$$;

-- functions: fixed search_path; only the server (service role) may call them
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'nae\_%' loop
    execute format('alter function %s set search_path = public', f);
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke execute on function %s from authenticated', f); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
end $$;
