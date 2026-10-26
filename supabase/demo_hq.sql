-- Optional: a demo HQ (higher management) account, username "hq", password NAE@2026, same as the other demo accounts.
-- Real HQ accounts are made in People and logins (role "HQ (higher management)"). demo_reset.sql removes this one too.
insert into nae_accounts (username, display_name, email, role, pathways, password_hash, must_change_password)
values ('hq', 'HQ', 'hq@demo.gvc.ae', 'leadership', '{VA,DA,LA,PA}', 'c8744880c9f96127c47ead0fb255ad18:31296029620d45c5a805862f170c1347e25720aa21209dc79bae55c2325d2b85bc481a7024b7cbc4aef84f5b724c16c791b39763f64a47f1d45a2b3753b2d77f', false)
on conflict (username) do nothing;
