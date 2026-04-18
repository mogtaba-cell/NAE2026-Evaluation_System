insert into users (username, display_name, role, active, pathways, password_hash)
values ('Admin', 'Administrator', 'admin', true, '{"Literary Arts","Performing Arts","Visual Arts","Applied Arts","Digital Arts"}', '71a0323cb7b0f032a1dba9734d4c4022:d32ea5e7a26af815f7c7cfca1c0ff7d0537b62510fc9131d7e4f0e9738378476848d03227062109cf401511f86bdf8ef6db0a7efbcde8caf8859ad447290b833')
on conflict (username) do nothing;
