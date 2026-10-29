-- NAE v6 (run after v5_batches.sql). Safe to re-run.
-- Collection visits: each time storage collects artworks from a school, who handed them over (name, phone, Emirates ID
-- photo) and photos of the artworks. Photos live in the private storage bucket "nae-private" (server access only).
create table if not exists nae_collection_visits (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references nae_collections(id) on delete cascade,
  at timestamptz not null default now(),
  by_id uuid references nae_accounts(id) on delete set null,
  by_name text,
  contact_name text,
  contact_phone text,
  received text[] not null default '{}',
  missing text[] not null default '{}',
  later text[] not null default '{}',
  location text,
  note text
);
create index if not exists nae_collection_visits_col_idx on nae_collection_visits(collection_id, at desc);
create table if not exists nae_collection_photos (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references nae_collections(id) on delete cascade,
  visit_id uuid references nae_collection_visits(id) on delete set null,
  entry_id uuid references nae_entries(id) on delete set null,
  kind text not null default 'item' check (kind in ('item', 'eid', 'other')),
  path text not null,
  mime text,
  size int,
  taken_by uuid references nae_accounts(id) on delete set null,
  taken_by_name text,
  at timestamptz not null default now()
);
create index if not exists nae_collection_photos_col_idx on nae_collection_photos(collection_id);
alter table nae_collection_visits enable row level security;
alter table nae_collection_photos enable row level security;
-- private bucket for collection and Emirates ID photos: no public access, the server reads it with the service role
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nae-private', 'nae-private', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
