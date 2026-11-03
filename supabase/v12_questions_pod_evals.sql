-- v12: rubric yes/no questions, POD per artwork, evaluation ticks, coordinator comments, self-entry in sessions.
-- 1. Yes/no questions in a rubric version (national identity becomes one of them)
alter table nae_rubric_versions add column if not exists questions jsonb not null default '[]';
update nae_rubric_versions set questions = jsonb_build_array(jsonb_build_object(
  'key', 'identity', 'label', 'National identity', 'label_ar', 'الهوية الوطنية',
  'ask', 'Does the work clearly express UAE national identity?', 'ask_ar', 'هل يعبّر العمل بوضوح عن الهوية الوطنية الإماراتية؟',
  'pass_yes', coalesce(identity_pass, false)))
where identity_required and questions = '[]'::jsonb;
alter table nae_scores add column if not exists answers jsonb not null default '{}';
update nae_scores set answers = jsonb_build_object('identity', national_identity) where national_identity is not null and answers = '{}'::jsonb;

-- 2. People of Determination, per artwork (import column, or ticked during evaluation)
alter table nae_entries add column if not exists pod boolean not null default false;

-- 3. "Artwork not visible, will not be evaluated": scoring stops and the coordinator fixes it (reopen) or withdraws it
alter table nae_entries add column if not exists not_visible_at timestamptz;
alter table nae_entries add column if not exists not_visible_by uuid;
alter table nae_entries add column if not exists not_visible_round int;
alter table nae_entries add column if not exists not_visible_note text;

-- 4. An evaluator (or the coordinator for the session) asks for management review while scoring
alter table nae_scores add column if not exists to_review boolean not null default false;

-- 5. The coordinator's own comment on an artwork, one per round
create table if not exists nae_entry_comments (
  entry_id uuid not null references nae_entries(id) on delete cascade,
  round_no int not null,
  comment text not null,
  author_id uuid,
  session_id uuid,
  updated_at timestamptz not null default now(),
  primary key (entry_id, round_no)
);
alter table nae_entry_comments enable row level security;

-- 6. Sessions: the evaluators who type their own scores on their own login
alter table nae_sessions add column if not exists self_ids uuid[] not null default '{}';

-- 7. Collections in two steps (received at the office, then stored), boxes and the delivery confirmation note
alter table nae_collection_visits add column if not exists boxes int;
alter table nae_collection_visits add column if not exists note_path text;
alter table nae_logistics drop constraint if exists nae_logistics_state_check;
alter table nae_logistics add constraint nae_logistics_state_check check (state = any (array['to_collect','received','storage','requested','picked','handed_over','coordinator','returning','framer','photography','showcase','exhibition','returned','missing']));

-- 8. Selected artworks: professional photography (in batches, with times) and the exhibition (section and wall)
alter table nae_logistics add column if not exists photo_batch int;
alter table nae_logistics add column if not exists photo_sent_at timestamptz;
alter table nae_logistics add column if not exists photo_sent_by text;
alter table nae_logistics add column if not exists photo_done_at timestamptz;
alter table nae_logistics add column if not exists photo_done_by text;
alter table nae_logistics add column if not exists exhibit_wall_id uuid;
alter table nae_logistics add column if not exists exhibit_at timestamptz;
alter table nae_logistics add column if not exists exhibit_by text;
create table if not exists nae_exhibit_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists nae_exhibit_walls (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references nae_exhibit_sections(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table nae_exhibit_sections enable row level security;
alter table nae_exhibit_walls enable row level security;

-- 9. Overdue session emails: when the last reminder went out
alter table nae_sessions add column if not exists overdue_notified_at timestamptz;
