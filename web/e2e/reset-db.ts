import { createDb, ensureCity, migrate } from '../../api/src/db.ts';
import { E2E_DATABASE_URL } from './db-url.ts';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// DESTRUTIVO: apaga todo o schema do banco de ponta a ponta. Chamado só por `prepare-db.ts`.
// Banco próprio dos testes de ponta a ponta: recriado do zero a cada execução, sem tocar no banco de desenvolvimento.
export default async function resetDb(): Promise<void> {
  const url = new URL(E2E_DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));

  // O preparo apaga o schema inteiro: recusa qualquer banco que não seja claramente de teste e local, antes de conectar.
  if (!name.endsWith('_e2e') || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `DATABASE_URL_E2E recusada (${url.hostname}/${name}): o banco precisa terminar em "_e2e" e estar em ` +
        'localhost, 127.0.0.1 ou ::1, porque o teste de ponta a ponta apaga todo o schema.',
    );
  }

  // `create database` não roda no banco que está sendo criado: usa o banco de manutenção do mesmo servidor.
  const admin = new URL(E2E_DATABASE_URL);
  admin.pathname = '/postgres';
  const adminSql = createDb(admin.toString());
  try {
    const found = await adminSql`select 1 from pg_database where datname = ${name}`;
    if (found.length === 0) await adminSql.unsafe(`create database "${name.replaceAll('"', '""')}"`);
  } finally {
    await adminSql.end();
  }

  const sql = createDb(E2E_DATABASE_URL);
  try {
    await sql.unsafe('drop schema public cascade; create schema public;');
    await migrate(sql);
    await ensureCity(sql);
  } finally {
    await sql.end();
  }
}
