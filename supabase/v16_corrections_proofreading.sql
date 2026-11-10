-- v16: corrections sent to coordinators (from evaluation, proofreading and review) with a communications log;
-- default text per pathway; proofreading and review by assignment, with reviewers linked to proofreaders.

-- 1. Corrections: one open correction per artwork at a time
create table if not exists nae_corrections (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references nae_entries(id) on delete cascade,
  source text not null,                 -- evaluation | proofreading | review
  reason text not null,                 -- file_quality | artwork_mismatch | incomplete_narrative | inappropriate
  note text,
  round_no int,
  session_id uuid,
  requested_by_id uuid,
  requested_by text,
  requested_role text,
  return_to_id uuid,                    -- the proofreader or reviewer it goes back to
  coordinator_id uuid,
  status text not null default 'open',  -- open | corrected | defaulted | not_scored | cancelled
  waiting_since timestamptz,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text,
  outcome_note text
);
create index if not exists nae_corrections_entry on nae_corrections(entry_id);
create index if not exists nae_corrections_open on nae_corrections(status, coordinator_id);
create unique index if not exists nae_corrections_one_open on nae_corrections(entry_id) where status = 'open';
alter table nae_corrections enable row level security;

create table if not exists nae_correction_log (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references nae_corrections(id) on delete cascade,
  at timestamptz not null default now(),
  by_id uuid,
  by_name text,
  kind text not null,                   -- opened | contacted | replied | note | waiting | file | details | closed
  channel text,                         -- call | email | whatsapp | visit | other
  text text,
  file_path text,
  file_name text
);
create index if not exists nae_correction_log_c on nae_correction_log(correction_id, at);
alter table nae_correction_log enable row level security;

-- existing "not visible" artworks become open corrections (artwork file quality)
insert into nae_corrections (entry_id, source, reason, note, round_no, requested_by_id, coordinator_id, opened_at)
  select e.id, 'evaluation', 'file_quality', e.not_visible_note, e.not_visible_round, e.not_visible_by, e.coordinator_id, e.not_visible_at
  from nae_entries e
  where e.not_visible_at is not null and not exists (select 1 from nae_corrections c where c.entry_id = e.id and c.status = 'open');

-- 2. The text used when a school doesn't respond about missing or wrong text, per pathway (set by admins)
alter table nae_pathways add column if not exists default_title_en text;
alter table nae_pathways add column if not exists default_title_ar text;
alter table nae_pathways add column if not exists default_description_en text;
alter table nae_pathways add column if not exists default_description_ar text;

-- 3. Proofreading and review by assignment
alter table nae_proof add column if not exists proofreader_id uuid;
alter table nae_proof add column if not exists reviewer_id uuid;
alter table nae_proof add column if not exists correction_id uuid;
alter table nae_proof add column if not exists returned_note text;
alter table nae_proof add column if not exists original jsonb;
create table if not exists nae_reviewer_links (
  reviewer_id uuid not null references nae_accounts(id) on delete cascade,
  proofreader_id uuid not null references nae_accounts(id) on delete cascade,
  primary key (reviewer_id, proofreader_id)
);
alter table nae_reviewer_links enable row level security;

-- 4. Daily reminder to coordinators about their open corrections: when it last went out
alter table nae_accounts add column if not exists corrections_reminded_at timestamptz;
