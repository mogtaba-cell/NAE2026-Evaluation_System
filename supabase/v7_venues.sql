-- v7: session venues are chosen from a list the admin keeps (Artwork logistics → Session venues)
create table if not exists nae_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  capacity int,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table nae_venues enable row level security;
alter table nae_sessions add column if not exists venue_id uuid references nae_venues(id) on delete set null;
create index if not exists nae_sessions_venue_idx on nae_sessions(venue_id);

-- venues already typed on sessions become the starting list
insert into nae_venues (name, sort)
select v, row_number() over (order by v) from (select distinct trim(venue) v from nae_sessions where coalesce(trim(venue), '') <> '') x
on conflict (name) do nothing;
update nae_sessions s set venue_id = v.id, venue = v.name from nae_venues v where s.venue_id is null and trim(s.venue) = v.name;

-- collection photos are taken of the boxes a school hands over (outside and inside), not of each artwork
alter table nae_collection_photos drop constraint if exists nae_collection_photos_kind_check;
alter table nae_collection_photos add constraint nae_collection_photos_kind_check check (kind in ('item', 'eid', 'other', 'box'));
