-- v8: a group with students in two cycles can be placed in either (admin, coordinator, management choose);
-- a tie for a place is decided by admin or management (lower tiebreak = higher place among equal results)
alter table nae_entries add column if not exists cycle_choice smallint check (cycle_choice between 1 and 3);
alter table nae_entries add column if not exists tiebreak smallint;
