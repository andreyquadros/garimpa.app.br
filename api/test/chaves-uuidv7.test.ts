import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';
import { login, makeApp, uniq } from './helpers.js';

let app: App;
let sql: Sql;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ app, sql, close } = await makeApp());
});
afterAll(async () => {
  await close();
});

describe('chaves em UUID v7 (ADR-0008)', () => {
  it('nenhuma coluna uuid do esquema gera v4 por padrão', async () => {
    // Lê o catálogo em vez de listar tabelas: uma tabela nova com gen_random_uuid() também reprova aqui.
    const v4 = await sql<{ tabela: string }[]>`
      select table_name as tabela from information_schema.columns
      where table_schema = 'public' and data_type = 'uuid' and column_default like '%gen_random_uuid%'
      order by 1`;
    expect(v4.map((r) => r.tabela)).toEqual([]);
  });

  it('linhas novas nascem com chave v7', async () => {
    const a = await login(app, uniq('Vera'));
    const [n] = await sql<{ id: string }[]>`
      insert into notifications (user_id, kind, title, body, url)
      values (${a.user.id}::uuid, 'gorjeta_recebida', 't', 'c', '/') returning id`;
    const versoes = await sql<{ v: number }[]>`
      select uuid_extract_version(id) as v from (values (${a.user.id}::uuid), (${n!.id}::uuid)) as t(id)`;
    expect(versoes.map((r) => r.v)).toEqual([7, 7]);
  });
});
