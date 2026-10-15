import { createDb, ensureCity, migrate } from '../../api/src/db.ts';
import { E2E_DATABASE_URL } from './db-url.ts';

// Banco próprio dos testes de ponta a ponta: recriado do zero a cada execução, sem tocar no banco de desenvolvimento.
export default async function setup(): Promise<void> {
  const url = new URL(E2E_DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));

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
