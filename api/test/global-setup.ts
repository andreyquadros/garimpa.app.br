import { Redis } from 'ioredis';
import { createDb, ensureCity, migrate } from '../src/db.js';

export default async function setup() {
  const url = process.env.DATABASE_URL_TEST ?? 'postgres://postgres@127.0.0.1:54329/garimpa_test';
  const sql = createDb(url);
  await sql.unsafe('drop schema public cascade; create schema public;');
  await migrate(sql);
  await ensureCity(sql);
  await sql.end();
  // Banco novo, cache novo: sobras de execuções anteriores não podem responder HIT para dados que já não existem.
  const redis = new Redis(process.env.REDIS_URL_TEST ?? 'redis://127.0.0.1:63799/2');
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}
