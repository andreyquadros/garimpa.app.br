import postgres, { type TransactionSql } from 'postgres';
import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './config.js';

export type Sql = ReturnType<typeof createDb>;
export type Tx = TransactionSql<{}>;

export function createDb(url: string) {
  return postgres(url, {
    transform: postgres.camel,
    max: 10,
    idle_timeout: 30,
    connection: { application_name: 'garimpa-api' },
    onnotice: () => {},
  });
}

export const MIGRATIONS_DIR = path.join(REPO_ROOT, 'db', 'migrations');

/** Aplica db/migrations/*.sql em ordem, uma vez cada (tabela schema_migrations). */
export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const body = await fs.readFile(path.join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations(name) values (${f})`;
    });
    applied.push(f);
  }
  return applied;
}

/** Garante a cidade piloto. */
export async function ensureCity(sql: Sql) {
  await sql`
    insert into cities(id, name, state, lat, lng, radius_m)
    values ('ariquemes', 'Ariquemes', 'RO', -9.9075, -63.0415, 15000)
    on conflict (id) do nothing`;
}
