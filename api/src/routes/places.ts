import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { type AppEnv, recordSignal, requireUser } from '../auth.js';
import { cached, markDirty } from '../cache-http.js';
import type { Sql, Tx } from '../db.js';
import { award, type Economy, grantBadge, loadEconomy, takeCap } from '../economy.js';
import { bboxSql, parseBbox, pointSql } from '../geo.js';
import { capQuery } from '../text.js';

export const placeRoutes = new Hono<AppEnv>();

export const newPlaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: z.enum(['loja', 'mercado', 'farmacia', 'feira', 'servico', 'outro']).default('loja'),
  whatsapp: z.string().trim().max(20).optional(),
});
export type NewPlace = z.infer<typeof newPlaceSchema>;

/**
 * Reaproveita um lugar com o mesmo nome a menos de 150 m; senão cria. Recusa pontos fora do raio da cidade.
 * O limite diário de lugares novos é cobrado aqui, só quando um lugar é de fato criado, para valer
 * tanto em POST /places quanto em respostas com `newPlace`.
 */
export async function getOrCreatePlace(
  db: Sql | Tx,
  cityId: string,
  input: NewPlace,
  userId: string,
  eco: Economy,
): Promise<{ id: string; created: boolean }> {
  const point = pointSql(db, input.lat, input.lng);
  const inside = await db<{ ok: boolean }[]>`
    select ST_DWithin(ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, ${point}, radius_m) as ok
    from cities where id = ${cityId}`;
  if (!inside[0]?.ok) throw new HTTPException(400, { message: 'Esse ponto fica fora da área do piloto (Ariquemes).' });
  const same = await db<{ id: string }[]>`
    select id from places
    where city_id = ${cityId} and name_norm = norm_text(${input.name})
      and ST_DWithin(geog, ${point}, 150)
    limit 1`;
  if (same[0]) return { id: same[0].id, created: false };
  if (!(await takeCap(db, userId, 'lugares', eco.limites_dia.lugares)))
    throw new HTTPException(429, { message: 'Muitos lugares novos hoje. Volte amanhã.' });
  const row = await db<{ id: string }[]>`
    insert into places(city_id, name, address, lat, lng, kind, whatsapp, created_by)
    values (${cityId}, ${input.name}, ${input.address ?? null}, ${input.lat}, ${input.lng}, ${input.kind}, ${input.whatsapp ?? null}, ${userId}::uuid)
    returning id`;
  const n = (await db<{ n: number }[]>`select count(*)::int as n from places where created_by = ${userId}::uuid`)[0]!.n;
  await award(db, userId, 'lugar_novo', 4, 0, { type: 'lugar', id: row[0]!.id }, {}, 0);
  if (n >= 5) await grantBadge(db, userId, 'cartografo');
  return { id: row[0]!.id, created: true };
}

placeRoutes.get('/places', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('config');
  const q = capQuery(c.req.query('q'));
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng);
  const load = async () => {
    return await sql`
    select p.id, p.name, p.address, p.lat, p.lng, p.kind, p.partner_tier,
           (select count(*)::int from answers a where a.place_id = p.id and a.status in ('aceita','confirmada')) as finds,
           ${hasPos ? sql`ST_Distance(p.geog, ${pointSql(sql, lat, lng)})::int` : sql`null::int`} as distance_m,
           ${q ? sql`similarity(p.name_norm, norm_text(${q}))` : sql`0::real`} as sim
    from places p
    where p.city_id = ${cfg.CITY_DEFAULT}
      ${q ? sql`and (p.name_norm % norm_text(${q}) or norm_text(${q}) <% p.name_norm or p.name_norm like '%' || norm_text(${q}) || '%')` : sql``}
    order by ${q ? sql`sim desc,` : sql``} ${hasPos ? sql`distance_m asc,` : sql``} finds desc, p.name asc
    limit 20`;
  };
  // A posição de quem pede é quase única e a distância precisa ser exata: com ela a lista não passa pelo cache.
  if (hasPos) {
    c.header('X-Cache', 'BYPASS');
    return c.json({ items: await load() });
  }
  const items = await cached(c, 'places', ['lugares', 'achados'], { city: cfg.CITY_DEFAULT, q }, 600, load);
  return c.json({ items });
});

placeRoutes.get('/places/:id', async (c) => {
  const sql = c.get('sql');
  const id = c.req.param('id');
  const body = await cached(c, 'place', [`lugar:${id}`], { id }, 600, async () => {
    const place = (
      await sql`select id, name, address, lat, lng, kind, whatsapp, partner_tier, created_at from places where id = ${id}::uuid`
    )[0];
    if (!place) return null;
    const finds = await sql`
    select a.id as answer_id, a.status, a.price_cents, a.created_at, a.confirms, q.id as question_id, q.title,
           u.name as author_name, u.avatar_url as author_avatar,
           (select '/u/' || e.file_path from evidences e where e.answer_id = a.id order by e.score desc limit 1) as photo
    from answers a join questions q on q.id = a.question_id join users u on u.id = a.author_id
    where a.place_id = ${id}::uuid and a.status in ('aceita','confirmada','pendente')
    order by (a.status = 'aceita') desc, (a.status = 'confirmada') desc, a.created_at desc limit 50`;
    return { place, finds };
  });
  if (!body) throw new HTTPException(404, { message: 'Lugar não encontrado.' });
  return c.json(body);
});

placeRoutes.post('/places', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const eco = await loadEconomy(sql, c.get('cache'));
  const input = newPlaceSchema.parse(await c.req.json());
  const r = await sql.begin((tx) => getOrCreatePlace(tx, c.get('config').CITY_DEFAULT, input, u.id, eco));
  // Lugar reaproveitado não muda nada; lugar novo entra na lista e rende XP.
  if (r.created) markDirty(c, 'lugares', 'ranking');
  await recordSignal(c, u.id);
  const place = (
    await sql`select id, name, address, lat, lng, kind, partner_tier from places where id = ${r.id}::uuid`
  )[0];
  return c.json({ place, created: r.created }, r.created ? 201 : 200);
});

/** Pinos do mapa: lugares com achados dentro da área visível; `q` filtra pelo produto. */
placeRoutes.get('/map/finds', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('config');
  const box = parseBbox(c.req.query('bbox'));
  const q = capQuery(c.req.query('q'));
  const items = await cached(c, 'map-finds', ['achados'], { city: cfg.CITY_DEFAULT, box, q }, 600, async () =>
    q
      ? await sql`
        with p as (select norm_text(${q}) as n, websearch_to_tsquery('portuguese', f_unaccent(${q})) as tsq)
        select pl.id as place_id, pl.name, pl.kind, pl.lat, pl.lng, pl.address, pl.partner_tier,
               count(a.id)::int as finds, max(a.created_at) as last_find_at,
               (array_agg(q.title order by a.created_at desc))[1:5] as titles
        from answers a join questions q on q.id = a.question_id join places pl on pl.id = a.place_id, p
        where a.status in ('aceita','confirmada') and q.city_id = ${cfg.CITY_DEFAULT}
          ${bboxSql(sql, 'pl.geog', box)}
          and (q.title_norm % p.n or p.n <% q.title_norm or (p.tsq::text <> '' and q.tsv @@ p.tsq))
        group by pl.id order by finds desc limit 300`
      : await sql`
        select place_id, city_id, name, kind, lat, lng, address, partner_tier, finds, last_find_at, titles
        from v_place_finds where city_id = ${cfg.CITY_DEFAULT}
          ${bboxSql(sql, 'geog', box)}
        order by finds desc limit 300`,
  );
  return c.json({ items });
});

/** Perguntas abertas com posição, para a camada "quem precisa de ajuda perto de você". */
placeRoutes.get('/map/open', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('config');
  const box = parseBbox(c.req.query('bbox'));
  const items = await cached(
    c,
    'map-open',
    ['missoes'],
    { city: cfg.CITY_DEFAULT, box },
    600,
    async () =>
      await sql`
    select id, title, category, bounty, followers_count, lat, lng, created_at from questions
    where city_id = ${cfg.CITY_DEFAULT} and status in ('aberta','respondida') and lat is not null
      ${bboxSql(sql, 'geog', box)}
    order by bounty desc, created_at desc limit 200`,
  );
  return c.json({ items });
});
