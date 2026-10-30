-- v10: artwork details corrected by hand (pathway, subpathway, size ...) are remembered so a re-import keeps them
alter table nae_entries add column if not exists manual_fields text[] not null default '{}';
