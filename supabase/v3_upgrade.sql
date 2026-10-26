-- NAE v3 upgrade (run after v2_schema.sql and v2_seed.sql). Safe to re-run.
-- Adds: an evaluator panel and flag switches per round, storage locations, framing and damage on artworks,
-- absent evaluators, score history, "viewed by management", one open review per entry, and safer publishing.

-- ---------- rounds: who evaluates, which flags ----------
alter table nae_rounds add column if not exists evaluator_ids uuid[];
alter table nae_rounds add column if not exists flag_near boolean not null default true;
alter table nae_rounds add column if not exists flag_spread boolean not null default true;
alter table nae_rounds add column if not exists flag_identity boolean not null default true;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nae_rounds' and column_name = 'flag_line') then
    alter table nae_rounds add column flag_line text not null default 'pass';
    update nae_rounds set flag_line = 'A' where round_no = 2;  -- Round 2 flags around the grade A line
  end if;
end $$;
do $$ begin alter table nae_rounds add constraint nae_rounds_flag_line_chk check (flag_line in ('pass', 'A')); exception when duplicate_object then null; end $$;
-- Round 1 is always online; in Round 2 each subpathway's Physical switch decides.
update nae_rounds set mode = 'online' where round_no = 1 and mode <> 'online';
update nae_rounds set mode = 'mixed' where round_no = 2 and mode <> 'mixed';

-- ---------- subpathways ----------
alter table nae_subpathways add column if not exists rubric_inherited boolean not null default false;

-- ---------- entries ----------
alter table nae_entries add column if not exists physical_override text;          -- 'online' = a missing artwork scored from its files
alter table nae_entries add column if not exists mgmt_viewed_at timestamptz;      -- viewed by management
alter table nae_entries add column if not exists mgmt_viewed_by uuid references nae_accounts(id) on delete set null;
alter table nae_entries add column if not exists mgmt_viewed_how text;            -- 'opened' (a manager opened it) or 'marked' (ticked by someone)
create index if not exists nae_entries_mgmt_idx on nae_entries(mgmt_viewed_at);

-- ---------- scores: absent evaluators, history ----------
alter table nae_scores drop constraint if exists nae_scores_status_check;
alter table nae_scores add constraint nae_scores_status_check check (status in ('draft', 'submitted', 'absent'));
create table if not exists nae_score_history (
  id bigserial primary key,
  score_id uuid,
  entry_id uuid references nae_entries(id) on delete cascade,
  round_id uuid references nae_rounds(id) on delete cascade,
  evaluator_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  changed_by uuid references nae_accounts(id) on delete set null,
  at timestamptz not null default now()
);
create index if not exists nae_score_history_entry_idx on nae_score_history(entry_id);

-- ---------- results and reviews ----------
alter table nae_results add column if not exists rubric_version_id uuid references nae_rubric_versions(id) on delete set null;
alter table nae_results add column if not exists outcome_note text;
alter table nae_results add column if not exists scores_sig text;
alter table nae_reviews add column if not exists new_passed boolean;
alter table nae_reviews add column if not exists scores_sig text;
update nae_reviews r set status = 'confirmed', decided_at = now(), decision_note = 'Duplicate review closed by the upgrade'
  where r.status = 'open' and exists (select 1 from nae_reviews o where o.entry_id = r.entry_id and o.round_no = r.round_no and o.status = 'open' and (o.flagged_at, o.id) < (r.flagged_at, r.id));
create unique index if not exists nae_reviews_one_open on nae_reviews(entry_id, round_no) where status = 'open';

-- ---------- storage locations (dummy rooms until GVC confirms the real ones) ----------
create table if not exists nae_locations (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  shelf text not null,
  sort int not null default 0,
  active boolean not null default true,
  unique (room, shelf)
);
insert into nae_locations (room, shelf, sort)
select r.room, 'Shelf ' || s.n, r.o * 100 + s.n
from (values ('Room A', 1), ('Room B', 2), ('Room C', 3)) r(room, o), generate_series(1, 6) s(n)
where not exists (select 1 from nae_locations)
on conflict do nothing;

-- ---------- collections and artworks ----------
alter table nae_collections add column if not exists sub_code text;
alter table nae_collections add column if not exists location_id uuid references nae_locations(id) on delete set null;
alter table nae_logistics add column if not exists location_id uuid references nae_locations(id) on delete set null;
alter table nae_logistics add column if not exists damaged boolean not null default false;
alter table nae_logistics add column if not exists needs_framing boolean not null default false;
alter table nae_logistics add column if not exists glass_framing boolean not null default false;
alter table nae_logistics add column if not exists missing_outcome text;          -- collect_later | score_online | withdrawn
alter table nae_logistics drop constraint if exists nae_logistics_state_check;
alter table nae_logistics add constraint nae_logistics_state_check check (state in ('to_collect', 'storage', 'coordinator', 'missing', 'returned', 'framer'));
update nae_logistics set damaged = true where not damaged and condition ilike '%damag%' and condition not ilike '%not damag%';

-- ---------- sessions ----------
alter table nae_sessions drop constraint if exists nae_sessions_status_check;
alter table nae_sessions add constraint nae_sessions_status_check check (status in ('planned', 'live', 'done', 'cancelled'));
alter table nae_session_entries add column if not exists pulled boolean not null default false;

-- ---------- rubric versions: at most one draft and one published per rubric; publish in one step ----------
create unique index if not exists nae_rv_one_draft on nae_rubric_versions(rubric_id) where status = 'draft';
create unique index if not exists nae_rv_one_pub on nae_rubric_versions(rubric_id) where status = 'published';
create or replace function nae_publish_rubric(p_draft uuid, p_by uuid) returns void language plpgsql as $$
declare rid uuid;
begin
  select rubric_id into rid from nae_rubric_versions where id = p_draft and status = 'draft' for update;
  if rid is null then raise exception 'There is no draft to publish.'; end if;
  update nae_rubric_versions set status = 'retired' where rubric_id = rid and status = 'published';
  update nae_rubric_versions set status = 'published', published_at = now(), published_by = p_by where id = p_draft;
end $$;

-- ---------- import: replace an entry's students in one step ----------
create or replace function nae_replace_students(p_entry_ids uuid[], p_rows jsonb) returns void language plpgsql as $$
begin
  delete from nae_entry_students where entry_id = any(p_entry_ids);
  insert into nae_entry_students (entry_id, position, name_en, name_ar, grade, esis, nationality, gender, consent)
  select (r->>'entry_id')::uuid, coalesce((r->>'position')::int, 1), r->>'name_en', r->>'name_ar', r->>'grade', r->>'esis', r->>'nationality', r->>'gender', (r->>'consent')::boolean
  from jsonb_array_elements(p_rows) r;
end $$;

-- ---------- one result calculation at a time per entry ----------
create table if not exists nae_locks (key text primary key, at timestamptz not null default now());
create or replace function nae_try_lock(p_key text) returns boolean language plpgsql as $$
begin
  delete from nae_locks where key = p_key and at < now() - interval '30 seconds';
  insert into nae_locks(key) values (p_key) on conflict do nothing;
  return found;
end $$;

-- ---------- entry counts for the list's status chips (now with more filters) ----------
-- (the older version with p_pathways is kept so the site keeps working until the new code is deployed)
create or replace function nae_status_counts(p_q text default null, p_pathway text default null, p_sub text default null, p_region text default null, p_type text default null, p_coord uuid default null, p_scope_coord uuid default null, p_reg text default null, p_mgmt text default null, p_nofiles boolean default null, p_school uuid default null, p_unalloc boolean default null)
returns table(current_round smallint, status text, n int) language sql stable as $$
  select e.current_round, e.status, count(*)::int from nae_entries e left join nae_schools s on s.id = e.school_id
  where (p_q is null or e.search_text like '%' || lower(p_q) || '%')
    and (p_pathway is null or e.pathway_code = p_pathway) and (p_sub is null or e.sub_code = p_sub)
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
