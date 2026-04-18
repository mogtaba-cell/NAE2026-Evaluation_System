create extension if not exists "pgcrypto";

create table if not exists evaluators (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  pathways text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  school_esis text unique not null,
  school_name text not null,
  school_type text default 'Unspecified',
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  student_esis text unique not null,
  student_name text not null,
  grade text,
  gender text,
  nationality text,
  school_id uuid references schools(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists submission_students (
  submission_id uuid not null references submissions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  display_order integer not null default 1,
  primary key (submission_id, student_id)
);

alter table submissions add column if not exists school_id uuid references schools(id) on delete set null;
alter table submissions add column if not exists management_round1_comments text;
alter table submissions add column if not exists management_round2_national_identity boolean;
alter table submissions add column if not exists management_round2_comments text;
create index if not exists idx_schools_esis on schools(school_esis);
create index if not exists idx_students_esis on students(student_esis);
