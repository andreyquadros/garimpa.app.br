import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import {
  type AppEnv, type GoogleProfile, clearSessionCookie, loadUser, recordSignal, requireUser,
  setSessionCookie, signSession, uniqueHandle, verifyGoogleIdToken,
} from '../auth.js';
import { grantBadge } from '../economy.js';
import type { Sql } from '../db.js';
import { slugify } from '../text.js';

export const authRoutes = new Hono<AppEnv>();

/**
 * Encontra ou cria a conta de um perfil Google. A linha achada pelo `sub` vem antes da achada só pelo e-mail
 * (verificado), e um e-mail já vinculado a outro `sub` nunca é reatribuído: isso seria tomada de conta.
 */
export async function upsertGoogleUser(sql: Sql, p: GoogleProfile, cityId: string) {
  return sql.begin(async (tx) => {
    const found = await tx<{ id: string; googleSub: string | null }[]>`
      select id, google_sub from users
      where google_sub = ${p.sub} or (${p.email}::citext is not null and email = ${p.email}::citext)
      order by (google_sub = ${p.sub}) desc nulls last limit 1`;
    if (found[0]) {
      if (found[0].googleSub && found[0].googleSub !== p.sub) {
        throw new HTTPException(409, { message: 'Este e-mail já está vinculado a outra conta Google. Entre com a conta original.' });
      }
      await tx`update users set google_sub = coalesce(google_sub, ${p.sub}), name = ${p.name}, avatar_url = coalesce(${p.picture}, avatar_url),
               email = coalesce(email, ${p.email}::citext) where id = ${found[0].id}::uuid`;
      return found[0].id;
    }
    const handle = await uniqueHandle(tx, p.name);
    const created = await tx<{ id: string }[]>`
      insert into users(google_sub, email, name, handle, avatar_url, city_id)
      values (${p.sub}, ${p.email}::citext, ${p.name}, ${handle}, ${p.picture}, ${cityId}) returning id`;
    await grantBadge(tx, created[0]!.id, 'fundador');
    return created[0]!.id;
  });
}

authRoutes.post('/google', async (c) => {
  const body = z.object({ credential: z.string().min(20) }).parse(await c.req.json());
  const profile = await verifyGoogleIdToken(c.get('config'), body.credential);
  const id = await upsertGoogleUser(c.get('sql'), profile, c.get('config').CITY_DEFAULT);
  setSessionCookie(c, await signSession(c.get('config'), id));
  await recordSignal(c, id);
  return c.json({ user: await loadUser(c.get('sql'), id) });
});

/** Login de desenvolvimento: cria/usa uma conta pelo nome. Desligado em produção (ALLOW_DEV_LOGIN). */
authRoutes.post('/dev', async (c) => {
  const cfg = c.get('config');
  if (!cfg.allowDevLogin) throw new HTTPException(404, { message: 'Não encontrado.' });
  const body = z.object({ name: z.string().min(2).max(60) }).parse(await c.req.json());
  const sql = c.get('sql');
  // "marina" entra na conta de demonstração demo-marina (dados do seed); outros nomes criam contas dev.
  const demo = (await sql<{ id: string }[]>`select id from users where handle = ${'demo-' + slugify(body.name)} and google_sub like 'seed:%' and banned_at is null`)[0];
  const sub = `dev:${body.name.toLowerCase()}`;
  const id = demo?.id ?? (await upsertGoogleUser(sql, { sub, email: null, name: body.name, picture: null }, cfg.CITY_DEFAULT));
  setSessionCookie(c, await signSession(cfg, id));
  await recordSignal(c, id);
  return c.json({ user: await loadUser(sql, id) });
});

authRoutes.post('/logout', async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.delete('/account', async (c) => {
  const u = requireUser(c);
  await c.get('sql')`update users set banned_at = now(), name = 'Conta removida', email = null, google_sub = null, avatar_url = null where id = ${u.id}::uuid`;
  clearSessionCookie(c);
  return c.json({ ok: true });
});
