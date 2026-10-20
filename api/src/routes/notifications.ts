import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, requireUser } from '../auth.js';

export const notificationRoutes = new Hono<AppEnv>();

const PAGE_SIZE = 30;

// Cursor opaco `<microssegundos desde a época>_<uuid>`: created_at do Postgres tem precisão de microssegundo, e o ISO do
// JSON só de milissegundo, então o cursor carrega o valor exato mais o id para desempatar avisos do mesmo instante
// (o now() é fixo dentro de uma transação, então empates exatos acontecem de verdade).
const CURSOR = /^(\d{1,18})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const listQuery = z.object({
  before: z
    .string()
    .regex(CURSOR)
    .transform((v) => {
      const [, us, id] = CURSOR.exec(v)!;
      return { us: us!, id: id! };
    })
    .optional(),
});
const readBody = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });

// Rotas pessoais: nunca passam por `cached` (ADR-0006), cada pessoa vê só as suas.
notificationRoutes.get('/notifications', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const { before } = listQuery.parse({ before: c.req.query('before') });
  const rows = await sql<
    {
      id: string;
      kind: string;
      title: string;
      body: string;
      url: string;
      createdAt: Date;
      readAt: Date | null;
      cursorUs: string;
    }[]
  >`
    select id, kind, title, body, url, created_at, read_at, (extract(epoch from created_at) * 1000000)::bigint::text as cursor_us
    from notifications
    where user_id = ${u.id}::uuid
      and (${before?.us ?? null}::bigint is null
        or (created_at, id) < ('epoch'::timestamptz + ${before?.us ?? null}::bigint * interval '1 microsecond', ${before?.id ?? null}::uuid))
    order by created_at desc, id desc limit ${PAGE_SIZE}`;
  const unread = (
    await sql<
      { n: number }[]
    >`select count(*)::int as n from notifications where user_id = ${u.id}::uuid and read_at is null`
  )[0]!.n;
  const last = rows[PAGE_SIZE - 1];
  return c.json({
    items: rows.map(({ cursorUs: _cursorUs, ...item }) => item),
    unread,
    nextBefore: rows.length === PAGE_SIZE && last ? `${last.cursorUs}_${last.id}` : null,
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
