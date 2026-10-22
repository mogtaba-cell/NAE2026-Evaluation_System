create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text,
  role text not null check (role in ('admin', 'coordinator')),
  active boolean not null default true,
  pathways text[] not null default '{}',
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists evaluators (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  pathways text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  submission_code text unique not null,
  pathway text not null,
  sub_pathway text,
  school_name text not null,
  school_type text default 'Unspecified',
  region text,
  assigned_coordinator_id uuid references users(id) on delete set null,
  artwork_name text not null,
  registration_type text,
  number_of_students integer not null default 1,
  student_name text,
  student_grade text,
  nationality text,
  gender text,
  preview_url text,
  source_file_url text,
  source_file_type text,
  medium text,
  dimensions text,
  description text,
  seen_reviewed boolean not null default false,
  need_fixing_school boolean not null default false,
  need_fixing_internal boolean not null default false,
  management_comments text,
  management_round1_total_score numeric,
  management_round1_grade text,
  management_round1_national_identity integer,
  management_round1_comments text,
  management_round2_total_score numeric,
  management_round2_grade text,
  management_round2_national_identity integer,
  management_round2_comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evaluation_records (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  round_number integer not null check (round_number in (1,2)),
  evaluator_id uuid references evaluators(id) on delete set null,
  evaluation_date date,
  scores_json jsonb not null default '{}'::jsonb,
  comments text,
  total_score numeric not null default 0,
  grade text,
  national_identity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_id, round_number, evaluator_id)
);

create index if not exists idx_submissions_pathway on submissions(pathway);
create index if not exists idx_submissions_school_name on submissions(school_name);
create index if not exists idx_submissions_school_type on submissions(school_type);
create index if not exists idx_submissions_region on submissions(region);
create index if not exists idx_submissions_assigned_coordinator on submissions(assigned_coordinator_id);
create index if not exists idx_evaluation_records_submission_round on evaluation_records(submission_id, round_number);
create index if not exists idx_evaluators_name on evaluators(name);

insert into users (username, display_name, role, active, pathways, password_hash)
values ('Admin', 'Administrator', 'admin', true, '{"Literary Arts","Performing Arts","Visual Arts","Applied Arts","Digital Arts"}', '71a0323cb7b0f032a1dba9734d4c4022:d32ea5e7a26af815f7c7cfca1c0ff7d0537b62510fc9131d7e4f0e9738378476848d03227062109cf401511f86bdf8ef6db0a7efbcde8caf8859ad447290b833')
on conflict (username) do nothing;
