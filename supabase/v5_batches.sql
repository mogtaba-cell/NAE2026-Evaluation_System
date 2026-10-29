-- NAE v5 (run after v4_programs.sql). Safe to re-run.
-- Session batches: storage brings a session's artworks into the room in batches and takes each batch back.
alter table nae_logistics add column if not exists batch_no int;
alter table nae_logistics add column if not exists returned_at timestamptz;
create index if not exists nae_session_entries_session_idx on nae_session_entries(session_id);
create index if not exists nae_session_entries_entry_idx on nae_session_entries(entry_id);
create index if not exists nae_scores_entry_round_idx on nae_scores(entry_id, round_id);
create index if not exists nae_results_entry_idx on nae_results(entry_id, round_no);
create index if not exists nae_entry_students_entry_idx on nae_entry_students(entry_id);
alter table nae_sessions add column if not exists batches int not null default 0;
