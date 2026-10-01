-- Remove os dados de demonstração criados por `pnpm db:seed` (contas demo-*, lugares source = 'seed').
-- O livro-razão não tem cascata de propósito (auditoria), por isso a ordem importa.
begin;
create temp table demo_users as select id from users where handle like 'demo-%';
delete from tips where from_user in (select id from demo_users) or to_user in (select id from demo_users);
delete from flags where reporter_id in (select id from demo_users);
delete from ledger where user_id in (select id from demo_users);
delete from confirmations where user_id in (select id from demo_users);
delete from evidences where uploader_id in (select id from demo_users);
delete from answers where author_id in (select id from demo_users);
delete from questions where author_id in (select id from demo_users);  -- cascata: respostas, provas, seguidores
delete from user_badges where user_id in (select id from demo_users);
delete from user_signals where user_id in (select id from demo_users);
delete from daily_caps where user_id in (select id from demo_users);
update places set created_by = null where created_by in (select id from demo_users);
delete from users where id in (select id from demo_users);
delete from places p where p.source = 'seed' and not exists (select 1 from answers a where a.place_id = p.id);
commit;
