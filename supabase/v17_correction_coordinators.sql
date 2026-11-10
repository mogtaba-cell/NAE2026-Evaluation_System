-- v17: only selected coordinators handle corrections, shared out by school.
-- nae_accounts.handles_corrections marks the coordinators who receive corrections.
-- nae_correction_schools keeps each school with one of them, so all of a school's corrections go to the same person.
alter table nae_accounts add column if not exists handles_corrections boolean not null default false;

create table if not exists nae_correction_schools (
  school_id uuid primary key references nae_schools(id) on delete cascade,
  coordinator_id uuid references nae_accounts(id) on delete set null,
  assigned_at timestamptz not null default now(),
  assigned_by text
);
create index if not exists nae_correction_schools_coord on nae_correction_schools(coordinator_id);
alter table nae_correction_schools enable row level security;

-- Files hidden from evaluators: the wrong artwork's files once the school's correct image is in (artwork mismatch),
-- or hidden by hand on the correction. Kept by Drive file id, so a re-sync of the folder doesn't bring them back.
create table if not exists nae_hidden_files (
  drive_id text primary key,
  entry_id uuid not null references nae_entries(id) on delete cascade,
  correction_id uuid references nae_corrections(id) on delete set null,
  name text,
  hidden_at timestamptz not null default now(),
  hidden_by text
);
create index if not exists nae_hidden_files_entry on nae_hidden_files(entry_id);
alter table nae_hidden_files enable row level security;
-- the artwork's files when the correction was opened: these are the ones a correct image replaces
alter table nae_corrections add column if not exists files_at_open text[];
