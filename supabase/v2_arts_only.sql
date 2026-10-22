-- NAE v2: remove the Expressions track (not used for the new evaluations) and set up rounds for the Arts track.
-- Stops if any Expressions entries exist, so it can't remove real data by accident.
do $$ begin
  if exists (select 1 from nae_entries where pathway_code in ('VE','DE','LE','PE','OS')) then
    raise exception 'Expressions entries exist. Remove them first if you really want to delete the Expressions track.';
  end if;
end $$;
delete from nae_rounds where pathway_code in ('VE','DE','LE','PE','OS');
delete from nae_subpathways where pathway_code in ('VE','DE','LE','PE','OS');
delete from nae_rubrics where pathway_code in ('VE','DE','LE','PE','OS');
delete from nae_pathways where code in ('VE','DE','LE','PE','OS');

with r(pw, no, name, mode, rule) as (values
 ('VA',1,'Round 1','online','{"grades":["A","B"]}'), ('VA',2,'Round 2','mixed','{"grades":["A","B"],"identity":true}'),
 ('DA',1,'Round 1','online','{"grades":["A","B"]}'), ('DA',2,'Round 2','online','{"grades":["A","B"],"identity":true}'),
 ('LA',1,'Round 1','online','{"min_score":75}'), ('LA',2,'Round 2','online','{"min_score":75}'),
 ('PA',1,'Round 1','online','{"min_score":75}'), ('PA',2,'Round 2','online','{"min_score":75}'))
insert into nae_rounds (pathway_code, round_no, name, mode, pass_rule)
select pw, no, name, mode, rule::jsonb from r on conflict (pathway_code, round_no) do nothing;
update nae_pathways set sort = case code when 'VA' then 1 when 'DA' then 2 when 'LA' then 3 when 'PA' then 4 else sort end;
