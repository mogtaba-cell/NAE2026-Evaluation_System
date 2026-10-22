-- NAE v2 seed: the Arts track (Visual, Digital, Literary and Performing Arts), its rounds and program settings.
-- Subpathways are added automatically by the import. Rubrics are made in the Rubric library.
-- Safe to re-run.
insert into nae_pathways (track, code, name, sort) values
 ('Arts','VA','Visual Arts',1), ('Arts','DA','Digital Arts',2), ('Arts','LA','Literary Arts',3), ('Arts','PA','Performing Arts',4)
on conflict (code) do nothing;

with r(pw, no, name, mode, rule) as (values
 ('VA',1,'Round 1','online','{"grades":["A","B"]}'), ('VA',2,'Round 2','mixed','{"grades":["A","B"],"identity":true}'),
 ('DA',1,'Round 1','online','{"grades":["A","B"]}'), ('DA',2,'Round 2','online','{"grades":["A","B"],"identity":true}'),
 ('LA',1,'Round 1','online','{"min_score":75}'), ('LA',2,'Round 2','online','{"min_score":75}'),
 ('PA',1,'Round 1','online','{"min_score":75}'), ('PA',2,'Round 2','online','{"min_score":75}'))
insert into nae_rounds (pathway_code, round_no, name, mode, pass_rule)
select pw, no, name, mode, rule::jsonb from r on conflict (pathway_code, round_no) do nothing;

insert into nae_settings (key, value) values
 ('program', '{"name":"NAE 2026","year":2026}'),
 ('drive', '{"shared_drive_id":"0AKw1oqpRt-UIUk9PVA","submissions_folder_id":"15qAykTCWVQ0y_SJR6ulpszy4HTlMd5tc","previews_folder_id":"14rGuwcWVqjas_SMf9LMCGfCCTqOq2L8u","archive_folder_id":"1bVZAczjup_h_OXlWqYt464dsMxXrf1kt","exports_folder_id":"17M1SBvhyKygXJ3BKKrAptwBYIpuU94v6"}')
on conflict (key) do nothing;
