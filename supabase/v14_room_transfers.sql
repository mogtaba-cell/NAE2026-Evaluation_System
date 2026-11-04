-- v14: an artwork in a finished session's room that moved to another session waits there (not on a shelf) until
-- Logistics brings it from that venue to the new session's venue.
alter table nae_logistics add column if not exists from_session_id uuid;
