-- Remove the demo data before going live (run once, in the Supabase SQL editor).
-- Keeps: the program setup (pathways, subpathways, rounds), imported entries, schools, students, files and the admin account.
-- Removes: every score, result, review, session, collection and artwork record, the demo accounts and evaluators,
-- the demo rubrics (codes ending in _2026), and the audit log. Entries go back to Round 1, not open, unallocated.
begin;
delete from nae_score_history;
delete from nae_scores;
delete from nae_results;
delete from nae_reviews;
delete from nae_assignments;
delete from nae_session_entries;
delete from nae_sessions;
delete from nae_logistics;
delete from nae_collections;
delete from nae_locks;
update nae_entries set current_round = 1, status = 'not_open', coordinator_id = null, physical_override = null,
  mgmt_viewed_at = null, mgmt_viewed_by = null, mgmt_viewed_how = null, updated_at = now();
delete from nae_evaluators;
delete from nae_accounts where role <> 'admin';
update nae_subpathways set rubric_r1 = null where rubric_r1 in (select id from nae_rubrics where code like '%\_2026');
update nae_subpathways set rubric_r2 = null where rubric_r2 in (select id from nae_rubrics where code like '%\_2026');
update nae_subpathways set is_physical = false;
delete from nae_rubric_versions where rubric_id in (select id from nae_rubrics where code like '%\_2026');
delete from nae_rubrics where code like '%\_2026';
update nae_rounds set status = 'setup', opened_at = null, closed_at = null, locked = false, evaluator_ids = null;
update nae_pathways set status = 'setup';
delete from nae_audit;
commit;
