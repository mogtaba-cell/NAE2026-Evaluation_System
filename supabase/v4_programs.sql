-- NAE v4 upgrade (run after v3_upgrade.sql). Safe to re-run.
-- 1. Programs: NAE 2026, Oral History, Nabati Poetry ... each with its own pathways, subpathways, rubrics and rounds.
-- 2. National identity is set only in the rubric (ask the question; optionally require "yes" to go through).
-- 3. Artwork logistics follow the plan's chain: requested → picked → handed over → received by the coordinator →
--    returned → stored, plus framing and showcase, with a timestamped history of every movement.

-- ---------- programs ----------
create table if not exists nae_programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  cycle text,
  starts_on date,
  ends_on date,
  status text not null default 'setup' check (status in ('setup', 'active', 'closed', 'archived')),
  owner_ids uuid[] not null default '{}',
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
insert into nae_programs (code, name, cycle, status, sort)
select 'NAE26', 'NAE 2026', '2026', 'active', 1 where not exists (select 1 from nae_programs);

alter table nae_pathways add column if not exists program_id uuid references nae_programs(id) on delete restrict;
alter table nae_pathways add column if not exists eval_type text not null default 'Participation';
do $$ begin alter table nae_pathways add constraint nae_pathways_eval_type_chk check (eval_type in ('Participation', 'Competition')); exception when duplicate_object then null; end $$;
update nae_pathways set program_id = (select id from nae_programs order by sort, created_at limit 1) where program_id is null;
update nae_pathways set eval_type = 'Competition' where code in ('LA', 'PA') and eval_type = 'Participation' and not exists (select 1 from nae_pathways where eval_type = 'Competition');
alter table nae_pathways alter column program_id set not null;
-- the old "track" label is replaced by the program
alter table nae_pathways drop constraint if exists nae_pathways_track_check;
alter table nae_pathways alter column track drop not null;
create index if not exists nae_pathways_program_idx on nae_pathways(program_id);
-- the same pathway name (e.g. Literary Arts) can exist once in each program
alter table nae_pathways drop constraint if exists nae_pathways_name_key;
create unique index if not exists nae_pathways_program_name on nae_pathways(program_id, name);

-- staff can be limited to programs (empty = every program)
alter table nae_accounts add column if not exists programs uuid[] not null default '{}';

-- ---------- national identity lives in the rubric ----------
alter table nae_rubric_versions add column if not exists identity_pass boolean not null default false;
-- rounds whose rule needed identity: their rubrics now ask it and require "yes"
do $$ declare r record; begin
  for r in select * from nae_rounds where coalesce((pass_rule->>'identity')::boolean, false) loop
    update nae_rubric_versions v set identity_required = true, identity_pass = true
      where v.status in ('published', 'draft') and v.rubric_id in (
        select case when r.round_no = 1 then s.rubric_r1 else coalesce(s.rubric_r2, s.rubric_r1) end from nae_subpathways s where s.pathway_code = r.pathway_code);
    update nae_rounds set pass_rule = pass_rule - 'identity' where id = r.id;
  end loop;
end $$;

-- ---------- artwork logistics ----------
alter table nae_logistics drop constraint if exists nae_logistics_state_check;
alter table nae_logistics add constraint nae_logistics_state_check check (state in
  ('to_collect', 'storage', 'requested', 'picked', 'handed_over', 'coordinator', 'returning', 'framer', 'showcase', 'returned', 'missing'));
alter table nae_logistics add column if not exists collected_on date;
alter table nae_logistics add column if not exists collected_by text;
alter table nae_logistics add column if not exists session_id uuid references nae_sessions(id) on delete set null;
alter table nae_logistics add column if not exists handed_by text;
alter table nae_logistics add column if not exists received_by text;
alter table nae_logistics add column if not exists handed_at timestamptz;
alter table nae_logistics add column if not exists framing_vendor text;
alter table nae_logistics add column if not exists framing_sent_on date;
alter table nae_logistics add column if not exists framing_due date;
alter table nae_logistics add column if not exists framing_back_on date;
alter table nae_logistics add column if not exists framed boolean not null default false;
alter table nae_logistics add column if not exists issue text;            -- needs_school_fix | needs_internal_fix
alter table nae_logistics add column if not exists issue_owner text;
alter table nae_logistics add column if not exists issue_status text;     -- open | resolved
create index if not exists nae_logistics_state_idx on nae_logistics(state);
create index if not exists nae_logistics_session_idx on nae_logistics(session_id);

create table if not exists nae_logistics_events (
  id bigserial primary key,
  entry_id uuid not null references nae_entries(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references nae_accounts(id) on delete set null,
  actor_name text,
  action text not null,
  from_state text,
  to_state text,
  location text,
  handed_by text,
  received_by text,
  note text,
  ref_type text,
  ref_id uuid
);
create index if not exists nae_logistics_events_entry_idx on nae_logistics_events(entry_id, at desc);

-- artworks already in planned or live sessions become pull requests; the ones ticked as pulled are picked;
-- artworks marked "with coordinator" were received by the session's coordinator
update nae_logistics l set state = case when se.pulled then 'picked' else 'requested' end, session_id = s.id
  from nae_session_entries se join nae_sessions s on s.id = se.session_id
  where se.entry_id = l.entry_id and s.status in ('planned', 'live') and l.state = 'storage';
update nae_logistics l set session_id = s.id
  from nae_session_entries se join nae_sessions s on s.id = se.session_id
  where se.entry_id = l.entry_id and s.status = 'live' and l.state = 'coordinator';

-- ---------- lock down new tables and functions (server only) ----------
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'nae\_%' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'nae\_%' loop
    execute format('alter function %s set search_path = public', f);
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke execute on function %s from authenticated', f); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
end $$;

-- ---------- entry counts for the list's status chips, scoped to a program's pathways ----------
create or replace function nae_status_counts(p_q text default null, p_pathway text default null, p_sub text default null, p_region text default null, p_type text default null, p_coord uuid default null, p_scope_coord uuid default null, p_reg text default null, p_mgmt text default null, p_nofiles boolean default null, p_school uuid default null, p_unalloc boolean default null, p_pathways text[] default null)
returns table(current_round smallint, status text, n int) language sql stable set search_path = public as $$
  select e.current_round, e.status, count(*)::int from nae_entries e left join nae_schools s on s.id = e.school_id
  where (p_q is null or e.search_text like '%' || lower(p_q) || '%')
    and (p_pathway is null or e.pathway_code = p_pathway) and (p_sub is null or e.sub_code = p_sub)
    and (p_pathways is null or e.pathway_code = any(p_pathways))
    and (p_region is null or s.region = p_region) and (p_type is null or s.school_type = p_type)
    and (p_coord is null or e.coordinator_id = p_coord)
    and (p_scope_coord is null or e.coordinator_id = p_scope_coord or exists (select 1 from nae_session_entries se join nae_sessions ss on ss.id = se.session_id where se.entry_id = e.id and ss.coordinator_id = p_scope_coord))
    and (p_reg is null or (p_reg = 'Group' and (e.registration_type ilike 'group%' or e.group_name is not null)) or (p_reg = 'Individual' and not (coalesce(e.registration_type, '') ilike 'group%' or e.group_name is not null)))
    and (p_mgmt is null or (p_mgmt = 'yes' and e.mgmt_viewed_at is not null) or (p_mgmt = 'no' and e.mgmt_viewed_at is null))
    and (p_nofiles is null or (p_nofiles and e.files_count = 0))
    and (p_school is null or e.school_id = p_school)
    and (p_unalloc is null or (p_unalloc and e.coordinator_id is null))
  group by 1, 2;
$$;
revoke execute on function nae_status_counts(text, text, text, text, text, uuid, uuid, text, text, boolean, uuid, boolean, text[]) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke execute on function nae_status_counts(text, text, text, text, text, uuid, uuid, text, text, boolean, uuid, boolean, text[]) from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke execute on function nae_status_counts(text, text, text, text, text, uuid, uuid, text, text, boolean, uuid, boolean, text[]) from authenticated; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function nae_status_counts(text, text, text, text, text, uuid, uuid, text, text, boolean, uuid, boolean, text[]) to service_role; end if;
end $$;
