-- NAE v2 seed: tracks, pathways, known subpathways, rounds and rubrics.
-- Rubrics are carried over from the previous system (lib/rubric.js) and can be edited in the Rubric builder.
insert into nae_pathways (track, code, name, sort) values
 ('Expressions','VE','Visual Expressions',1), ('Expressions','DE','Digital Expressions',2),
 ('Expressions','LE','Literary Expressions',3), ('Expressions','PE','Performing Expressions',4),
 ('Expressions','OS','Others Or STEAM Project',5),
 ('Arts','VA','Visual Arts',11), ('Arts','DA','Digital Arts',12), ('Arts','LA','Literary Arts',13), ('Arts','PA','Performing Arts',14)
on conflict (code) do nothing;

with r(code, name, pathway) as (values
 ('VE_R1','Visual Expressions · Round 1','VE'), ('VE_R2','Visual Expressions · Round 2','VE'),
 ('DE_R1','Digital Expressions · Round 1','DE'), ('DE_R2','Digital Expressions · Round 2','DE'),
 ('LE_R1','Literary Expressions · Round 1','LE'), ('LE_POETRY_R1','Poetry · Round 1','LE'), ('LE_STORY_R1','Short Stories · Round 1','LE'), ('LE_PLAY_R1','Playwriting · Round 1','LE'), ('LE_R2','Literary Expressions · Round 2','LE'),
 ('PE_R1','Performing Expressions · Round 1','PE'), ('PE_R2','Performing Expressions · Round 2','PE'),
 ('OS_R1','Others Or STEAM Project · Round 1','OS'), ('OS_R2','Others Or STEAM Project · Round 2','OS'))
insert into nae_rubrics (code, name, pathway_code) select code, name, pathway from r on conflict (code) do nothing;

with v(code, idreq, criteria) as (values
 ('VE_R1', false, '[{"key":"quality","label":"Overall Quality","weight":45},{"key":"creativity","label":"Creativity & Imagination","weight":40},{"key":"personality","label":"Personality & Age Level","weight":10},{"key":"presentation","label":"Presentation & Effort","weight":5}]'),
 ('VE_R2', true,  '[{"key":"quality","label":"Overall Quality","weight":45},{"key":"creativity","label":"Creativity & Imagination","weight":35},{"key":"personality","label":"Personality & Age Level","weight":15},{"key":"presentation","label":"Presentation & Effort","weight":5}]'),
 ('DE_R1', false, '[{"key":"technical","label":"Technical Execution","weight":35},{"key":"innovation","label":"Innovation","weight":45},{"key":"personality","label":"Age-Level Fit","weight":10},{"key":"originality","label":"Original Work Review","weight":10}]'),
 ('DE_R2', true,  '[{"key":"technical","label":"Technical Execution","weight":35},{"key":"innovation","label":"Innovation","weight":35},{"key":"originality","label":"Original Work Review","weight":20},{"key":"personality","label":"Age-Level Fit","weight":10}]'),
 ('LE_R1', false, '[{"key":"language","label":"Language & Style","weight":20},{"key":"creativity","label":"Creativity & Originality","weight":20},{"key":"structure","label":"Structure","weight":20},{"key":"impact","label":"Impact","weight":20},{"key":"clarity","label":"Clarity","weight":20}]'),
 ('LE_POETRY_R1', false, '[{"key":"delivery","label":"Delivery & Pronunciation","weight":20},{"key":"expression","label":"Expression & Emotion","weight":20},{"key":"presence","label":"Presence & Confidence","weight":20},{"key":"rhythm","label":"Rhythm & Flow","weight":20},{"key":"impact","label":"Overall Impact","weight":20}]'),
 ('LE_STORY_R1', false, '[{"key":"language","label":"Language & Style","weight":20},{"key":"characters","label":"Character Development","weight":20},{"key":"plot","label":"Plot & Coherence","weight":25},{"key":"creativity","label":"Creativity & Originality","weight":20},{"key":"impact","label":"Reader Impact","weight":15}]'),
 ('LE_PLAY_R1', false, '[{"key":"dialogue","label":"Dialogue & Language","weight":20},{"key":"characters","label":"Character Development","weight":20},{"key":"plot","label":"Plot & Dramatic Structure","weight":25},{"key":"creativity","label":"Creativity","weight":20},{"key":"impact","label":"Audience Impact","weight":15}]'),
 ('LE_R2', false, '[{"key":"language_quality","label":"Language Quality","weight":25},{"key":"creativity","label":"Creativity","weight":25},{"key":"imagery","label":"Imagery & Expression","weight":20},{"key":"structure","label":"Structure & Coherence","weight":15},{"key":"impact","label":"Audience Impact","weight":15}]'),
 ('PE_R1', false, '[{"key":"performance","label":"Performance Quality","weight":30},{"key":"identity","label":"National Identity Expression","weight":25},{"key":"creativity","label":"Creativity","weight":20},{"key":"presence","label":"Stage Presence","weight":15},{"key":"harmony","label":"Harmony / Coordination","weight":10}]'),
 ('PE_R2', false, '[{"key":"performance","label":"Performance Quality","weight":30},{"key":"identity","label":"National Identity Expression","weight":25},{"key":"creativity","label":"Creativity","weight":20},{"key":"presence","label":"Stage Presence","weight":15},{"key":"harmony","label":"Harmony / Coordination","weight":10}]'),
 ('OS_R1', false, '[{"key":"quality","label":"Overall Quality","weight":40},{"key":"creativity","label":"Creativity & Innovation","weight":30},{"key":"technical","label":"Technical Skill & Age Level","weight":20},{"key":"presentation","label":"Presentation & Effort","weight":10}]'),
 ('OS_R2', true,  '[{"key":"quality","label":"Overall Quality","weight":40},{"key":"creativity","label":"Creativity & Innovation","weight":30},{"key":"technical","label":"Technical Skill & Age Level","weight":20},{"key":"presentation","label":"Presentation & Effort","weight":10}]'))
insert into nae_rubric_versions (rubric_id, version, status, criteria, identity_required, published_at)
select r.id, 1, 'published', v.criteria::jsonb, v.idreq, now() from v join nae_rubrics r on r.code = v.code
on conflict (rubric_id, version) do nothing;

with s(pw, code, name, phys, r1, r2, sort) as (values
 ('VE','PD','Painting & Drawing',true,'VE_R1','VE_R2',1), ('VE','PH','Photography',false,'VE_R1','VE_R2',2), ('VE','TC','Traditional Crafts & Folk',true,'VE_R1','VE_R2',3), ('VE','CA','Calligraphy',true,'VE_R1','VE_R2',4),
 ('DE','GD','Game Design',false,'DE_R1','DE_R2',1), ('DE','AN','Animation',false,'DE_R1','DE_R2',2), ('DE','GR','Graphic Design',false,'DE_R1','DE_R2',3),
 ('LE','CP','Classic Poetry',false,'LE_POETRY_R1','LE_R2',1), ('LE','PW','Playwriting',false,'LE_PLAY_R1','LE_R2',2), ('LE','NP','Nabati Poetry',false,'LE_POETRY_R1','LE_R2',3), ('LE','SS','Short Stories',false,'LE_STORY_R1','LE_R2',4),
 ('PE','NA','National Anthem Competition',false,'PE_R1','PE_R2',1), ('PE','ET','Emirati Traditional Performing Arts',false,'PE_R1','PE_R2',2), ('PE','DR','Drama',false,'PE_R1','PE_R2',3), ('PE','TS','Traditional Emirati Song',false,'PE_R1','PE_R2',4))
insert into nae_subpathways (pathway_code, code, name, is_physical, rubric_r1, rubric_r2, sort)
select s.pw, s.code, s.name, s.phys, a.id, b.id, s.sort from s join nae_rubrics a on a.code = s.r1 join nae_rubrics b on b.code = s.r2
on conflict (pathway_code, code) do nothing;

with r(pw, no, name, mode, rule) as (values
 ('VE',1,'Round 1','online','{"grades":["A","B"]}'), ('VE',2,'Round 2','mixed','{"grades":["A","B"],"identity":true}'),
 ('DE',1,'Round 1','online','{"grades":["A","B"]}'), ('DE',2,'Round 2','online','{"grades":["A","B"],"identity":true}'),
 ('OS',1,'Round 1','online','{"grades":["A","B"]}'), ('OS',2,'Round 2','online','{"grades":["A","B"],"identity":true}'),
 ('LE',1,'Round 1','online','{"min_score":75}'), ('LE',2,'Round 2','online','{"min_score":75}'),
 ('PE',1,'Round 1','online','{"min_score":75}'), ('PE',2,'Round 2','online','{"min_score":75}'))
insert into nae_rounds (pathway_code, round_no, name, mode, pass_rule)
select pw, no, name, mode, rule::jsonb from r on conflict (pathway_code, round_no) do nothing;

insert into nae_settings (key, value) values
 ('program', '{"name":"NAE 2026","year":2026}'),
 ('drive', '{"shared_drive_id":"0AKw1oqpRt-UIUk9PVA","submissions_folder_id":"15qAykTCWVQ0y_SJR6ulpszy4HTlMd5tc","previews_folder_id":"14rGuwcWVqjas_SMf9LMCGfCCTqOq2L8u","archive_folder_id":"1bVZAczjup_h_OXlWqYt464dsMxXrf1kt","exports_folder_id":"17M1SBvhyKygXJ3BKKrAptwBYIpuU94v6"}')
on conflict (key) do nothing;
