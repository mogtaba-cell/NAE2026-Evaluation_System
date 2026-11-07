-- v15: display options and artworks handling (framing, printing, production, other) with approval; size class;
-- framing and photography plans; photography spaces and professional photos from the Shared Drive; exhibition
-- dispatch; proofreading and reviewing of selected artworks; returns to schools.

-- 1. Display options (chosen during physical evaluation) and the size class (S, M, L, XL)
alter table nae_logistics add column if not exists display_option text;
alter table nae_logistics add column if not exists display_note text;
alter table nae_logistics add column if not exists size_class text;
update nae_logistics set display_option = case when glass_framing then 'frame_glass' else 'frame_plain' end
  where needs_framing and display_option is null;

-- 2. Artworks handling: one row per artwork with a display option. track: framing | printing | production | other
--    status: draft (details being filled in) | approved (Logistics can act) | sent | back
create table if not exists nae_handling (
  entry_id uuid primary key references nae_entries(id) on delete cascade,
  track text not null,
  details jsonb not null default '{}',
  status text not null default 'draft',
  updated_by text,
  updated_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  batch int,
  vendor text,
  sent_at timestamptz,
  sent_by text,
  due date,
  back_at timestamptz,
  back_by text,
  note text
);
insert into nae_handling (entry_id, track, status, details)
  select entry_id, 'framing', case when framed then 'back' when state = 'framer' then 'sent' else 'draft' end, '{}'::jsonb
  from nae_logistics where display_option in ('frame_glass', 'frame_plain')
  on conflict (entry_id) do nothing;
alter table nae_handling enable row level security;

-- the dropdown lists the team fills in (frame material and colour, print size and material)
create table if not exists nae_handling_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  label text not null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table nae_handling_options enable row level security;

-- 3. Plans for framing and photography: date range, working days, spaces (photography)
create table if not exists nae_plans (
  kind text primary key,
  data jsonb not null default '{}',
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table nae_plans enable row level security;

-- 4. Photography: the space (room or venue in the office) a batch is photographed in, and the professional photos
--    found in 06 Uploads / Photography / <eSIS - School>, named by artwork code (DA-AN-0002, DA-AN-0002-A, ...)
alter table nae_logistics add column if not exists photo_space text;
create table if not exists nae_photo_files (
  drive_id text primary key,
  entry_id uuid references nae_entries(id) on delete cascade,
  code text,
  name text not null,
  mime text,
  size_bytes bigint,
  folder text,
  modified_at timestamptz,
  seen_at timestamptz not null default now()
);
create index if not exists nae_photo_files_entry on nae_photo_files(entry_id);
alter table nae_photo_files enable row level security;

-- 5. Exhibition: sent out of the office to the exhibition site (then placed on a wall)
alter table nae_logistics add column if not exists exhibit_batch int;
alter table nae_logistics add column if not exists exhibit_sent_at timestamptz;
alter table nae_logistics add column if not exists exhibit_sent_by text;

-- 6. Proofreading and reviewing the selected artworks' text (new roles)
alter table nae_accounts drop constraint if exists nae_accounts_role_check;
alter table nae_accounts add constraint nae_accounts_role_check check (role = any (array['admin','coordinator','evaluator','management','storage','leadership','proofreader','reviewer']));
create table if not exists nae_proof (
  entry_id uuid primary key references nae_entries(id) on delete cascade,
  status text not null default 'to_proofread',
  proofread_by_id uuid,
  proofread_by text,
  proofread_at timestamptz,
  proof_note text,
  reviewed_by_id uuid,
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  updated_at timestamptz not null default now()
);
alter table nae_proof enable row level security;

-- 7. Artworks returned to schools (not selected, wrong artwork, after the exhibition) with a return note
create table if not exists nae_returns (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references nae_schools(id),
  at timestamptz not null default now(),
  by_id uuid,
  by_name text,
  contact_name text,
  contact_phone text,
  boxes int,
  reason text,
  note text,
  entries text[] not null default '{}',
  note_path text
);
alter table nae_returns enable row level security;
