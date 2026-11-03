-- v13: a session has a start and an end time; the end (date + end time, UAE) is its deadline for "overdue".
alter table nae_sessions add column if not exists start_time time;
alter table nae_sessions add column if not exists end_time time;
update nae_sessions set start_time = (substring(time_text from '(\d{1,2}:\d{2})'))::time,
  end_time = (substring(time_text from '\d{1,2}:\d{2}\D+(\d{1,2}:\d{2})'))::time
where start_time is null and time_text ~ '\d{1,2}:\d{2}\D+\d{1,2}:\d{2}';
