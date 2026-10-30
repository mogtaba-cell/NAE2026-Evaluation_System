-- v9: storage locations become room -> shelf -> row. Each row is a slot in nae_locations (so every place that
-- stores location_id keeps working); rooms and shelves are kept in their own tables. Rooms can be tagged with the
-- pathways stored there, so check-in opens on that room.
create table if not exists nae_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pathways text[] not null default '{}',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists nae_shelves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references nae_rooms(id) on delete cascade,
  name text not null,
  rows int not null default 3 check (rows between 1 and 50),
  active boolean not null default true,
  sort int not null default 0,
  unique (room_id, name)
);
alter table nae_rooms enable row level security;
alter table nae_shelves enable row level security;
alter table nae_locations add column if not exists shelf_id uuid references nae_shelves(id) on delete set null;
alter table nae_locations add column if not exists row_no int;
alter table nae_locations drop constraint if exists nae_locations_room_shelf_key;
alter table nae_locations add column if not exists label text generated always as (room || ' · ' || shelf || coalesce(' · Row ' || row_no::text, '')) stored;

-- existing room + shelf pairs become rooms and shelves (3 rows each); what is stored on a shelf today goes to its row 1
insert into nae_rooms (name, sort, active)
select room, (row_number() over (order by room))::int, bool_or(active) from nae_locations group by room
on conflict (name) do nothing;
insert into nae_shelves (room_id, name, sort, active, rows)
select r.id, l.shelf, (row_number() over (partition by r.id order by l.sort, l.shelf))::int, l.active, 3
from nae_locations l join nae_rooms r on r.name = l.room
on conflict (room_id, name) do nothing;
update nae_locations l set shelf_id = s.id, row_no = 1 from nae_shelves s join nae_rooms r on r.id = s.room_id where l.shelf_id is null and r.name = l.room and s.name = l.shelf;
insert into nae_locations (room, shelf, shelf_id, row_no, active)
select r.name, s.name, s.id, g.n, s.active from nae_shelves s join nae_rooms r on r.id = s.room_id cross join generate_series(2, 3) g(n)
where not exists (select 1 from nae_locations x where x.shelf_id = s.id and x.row_no = g.n);
create unique index if not exists nae_locations_slot_key on nae_locations (shelf_id, row_no);
update nae_locations l set sort = r.sort * 10000 + s.sort * 100 + l.row_no from nae_shelves s join nae_rooms r on r.id = s.room_id where s.id = l.shelf_id;
update nae_logistics g set location = l.label from nae_locations l where l.id = g.location_id;
