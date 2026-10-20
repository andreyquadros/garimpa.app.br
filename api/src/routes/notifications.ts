import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, requireUser } from '../auth.js';

export const notificationRoutes = new Hono<AppEnv>();

const PAGE_SIZE = 30;

const listQuery = z.object({ before: z.coerce.date().optional() });
const readBody = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });

// Rotas pessoais: nunca passam por `cached` (ADR-0006), cada pessoa vê só as suas.
notificationRoutes.get('/notifications', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const { before } = listQuery.parse({ before: c.req.query('before') });
  const rows = await sql<
    { id: string; kind: string; title: string; body: string; url: string; createdAt: Date; readAt: Date | null }[]
  >`
    select id, kind, title, body, url, created_at, read_at from notifications
    where user_id = ${u.id}::uuid and (${before ?? null}::timestamptz is null or created_at < ${before ?? null}::timestamptz)
    order by created_at desc, id desc limit ${PAGE_SIZE}`;
  const unread = (
    await sql<
      { n: number }[]
    >`select count(*)::int as n from notifications where user_id = ${u.id}::uuid and read_at is null`
  )[0]!.n;
  // Cursor só por created_at (milissegundos no JSON): avisos com o mesmo instante na fronteira da página podem ser
  // pulados. Aceito: cada aviso nasce numa transação própria e o empate exato é raro.
  const last = rows[PAGE_SIZE - 1];
  return c.json({
    items: rows,
    unread,
    nextBefore: rows.length === PAGE_SIZE && last ? last.createdAt.toISOString() : null,
  });
});

notificationRoutes.post('/notifications/read', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const { ids } = readBody.parse(await c.req.json().catch(() => ({})));
  // Sempre filtra por user_id: ids de outra pessoa no corpo são ignorados.
  await sql`update notifications set read_at = now()
    where user_id = ${u.id}::uuid and read_at is null and (${ids ?? null}::uuid[] is null or id = any(${ids ?? null}::uuid[]))`;
  const unread = (
    await sql<
      { n: number }[]
    >`select count(*)::int as n from notifications where user_id = ${u.id}::uuid and read_at is null`
  )[0]!.n;
  return c.json({ unread });
});
