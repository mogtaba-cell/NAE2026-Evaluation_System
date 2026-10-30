-- Only chosen management accounts mark an artwork "Viewed by management" just by opening it (Linda for now).
alter table nae_accounts add column if not exists auto_mark_viewed boolean not null default false;
update nae_accounts set auto_mark_viewed = true where username = 'linda';
