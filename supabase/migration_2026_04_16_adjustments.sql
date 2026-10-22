create extension if not exists "pgcrypto";

create table if not exists evaluators (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  pathways text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table submissions add column if not exists school_type text default 'Unspecified';
alter table submissions add column if not exists seen_reviewed boolean not null default false;
alter table submissions add column if not exists need_fixing_school boolean not null default false;
alter table submissions add column if not exists need_fixing_internal boolean not null default false;
alter table submissions add column if not exists management_comments text;
alter table submissions add column if not exists management_round1_total_score numeric;
alter table submissions add column if not exists management_round1_grade text;
alter table submissions add column if not exists management_round1_national_identity integer;
alter table submissions add column if not exists management_round1_comments text;
alter table submissions add column if not exists management_round2_total_score numeric;
alter table submissions add column if not exists management_round2_grade text;
alter table submissions add column if not exists management_round2_national_identity integer;
alter table submissions add column if not exists management_round2_comments text;
alter table submissions add column if not exists updated_at timestamptz not null default now();

alter table evaluation_records add column if not exists evaluator_id uuid references evaluators(id) on delete set null;
alter table evaluation_records add column if not exists updated_at timestamptz not null default now();

alter table evaluation_records drop constraint if exists evaluation_records_submission_id_round_number_evaluator_user_id_key;
alter table evaluation_records drop constraint if exists evaluation_records_submission_id_round_number_evaluator_id_key;

update evaluation_records set evaluator_id = null where evaluator_id is null;

alter table evaluation_records add constraint evaluation_records_submission_round_evaluator_unique unique (submission_id, round_number, evaluator_id);

create index if not exists idx_evaluators_name on evaluators(name);
create index if not exists idx_submissions_school_type on submissions(school_type);
