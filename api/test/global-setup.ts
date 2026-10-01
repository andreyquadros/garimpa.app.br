import { createDb, migrate, ensureCity } from '../src/db.js';

export default async function setup() {
  const url = process.env.DATABASE_URL_TEST ?? 'postgres://postgres@127.0.0.1:54329/garimpa_test';
  const sql = createDb(url);
  await sql.unsafe('drop schema public cascade; create schema public;');
  await migrate(sql);
  await ensureCity(sql);
  await sql.end();
}
