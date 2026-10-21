-- Chaves em UUID v7 (ADR-0008): ordenadas pelo tempo, as inserções vão para o fim do índice da chave primária
-- em vez de espalhar páginas pela árvore como o v4 aleatório. uuidv7() é nativo do PostgreSQL 18.
-- Só o padrão muda: sem dados em produção, não há ids v4 para converter. ledger e fund_ledger seguem bigserial.

alter table users              alter column id set default uuidv7();
alter table places             alter column id set default uuidv7();
alter table questions          alter column id set default uuidv7();
alter table answers            alter column id set default uuidv7();
alter table evidences          alter column id set default uuidv7();
alter table tips               alter column id set default uuidv7();
alter table flags              alter column id set default uuidv7();
alter table partners           alter column id set default uuidv7();
alter table campaigns          alter column id set default uuidv7();
alter table payouts            alter column id set default uuidv7();
alter table notifications      alter column id set default uuidv7();
alter table push_subscriptions alter column id set default uuidv7();
