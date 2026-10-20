import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, requireUser } from '../auth.js';
import { isAllowedPushEndpoint } from '../push/endpoint.js';

export const pushRoutes = new Hono<AppEnv>();

const subscribeBody = z.object({
  endpoint: z.string().max(2048).refine(isAllowedPushEndpoint, 'endpoint de push não permitido'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const unsubscribeBody = z.object({ endpoint: z.string().max(2048) });

// Rotas pessoais ou de configuração: nunca passam por `cached` (ADR-0006).
pushRoutes.get('/push/key', (c) => {
  const config = c.get('config');
  return c.json({ publicKey: config.pushEnabled ? (config.VAPID_PUBLIC_KEY ?? null) : null });
});

pushRoutes.post('/push/subscriptions', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const b = subscribeBody.parse(await c.req.json().catch(() => ({})));
  const ua = (c.req.header('user-agent') ?? '').slice(0, 200) || null;
  // O mesmo aparelho pode trocar de conta: o endpoint passa a pertencer só a quem inscreveu por último, senão a conta
  // anterior continuaria recebendo os avisos da nova.
  await sql`
    insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (${u.id}::uuid, ${b.endpoint}, ${b.keys.p256dh}, ${b.keys.auth}, ${ua})
    on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
          user_agent = excluded.user_agent, failures = 0`;
  return c.json({ ok: true }, 201);
});

pushRoutes.delete('/push/subscriptions', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const b = unsubscribeBody.parse(await c.req.json().catch(() => ({})));
  await sql`delete from push_subscriptions where endpoint = ${b.endpoint} and user_id = ${u.id}::uuid`;
  return c.json({ ok: true });
});
