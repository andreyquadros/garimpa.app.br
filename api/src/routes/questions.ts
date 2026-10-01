import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type AppEnv, requireUser, recordSignal, collusionBetween } from '../auth.js';
import type { Sql } from '../db.js';
import { award, takeCap, takeMintCap, loadEconomy, grantBadge } from '../economy.js';
import { allEvidencesReused } from './answers.js';

export const questionRoutes = new Hono<AppEnv>();

export type Similar = {
  id: string; title: string; status: string; category: string; answersCount: number; followersCount: number;
  createdAt: string; sim: number; wsim: number; rank: number; score: number;
  places: Array<{ id: string; name: string; lat: number; lng: number; kind: string; status: string; priceCents: number | null }>;
};

/** Perguntas parecidas: trigramas no título + busca textual em português. Base da deduplicação. */
export async function similarQuestions(sql: Sql, cityId: string, q: string, limit = 8): Promise<Similar[]> {
  if (q.trim().length < 3) return [];
  const rows = await sql<Array<Omit<Similar, 'places' | 'score'>>>`
    with p as (select norm_text(${q}) as n, websearch_to_tsquery('portuguese', f_unaccent(${q})) as tsq)
    select qu.id, qu.title, qu.status, qu.category, qu.answers_count, qu.followers_count, qu.created_at,
           similarity(qu.title_norm, p.n)::float as sim, word_similarity(p.n, qu.title_norm)::float as wsim,
           ts_rank(qu.tsv, p.tsq)::float as rank
    from questions qu, p
    where qu.city_id = ${cityId} and qu.status <> 'fechada'
      and (qu.title_norm % p.n or p.n <% qu.title_norm or (p.tsq::text <> '' and qu.tsv @@ p.tsq))
    order by greatest(similarity(qu.title_norm, p.n), word_similarity(p.n, qu.title_norm) * 0.8, ts_rank(qu.tsv, p.tsq)) desc
    limit ${limit}`;
  const ids = rows.map((r) => r.id);
  const places = ids.length
    ? await sql<Array<{ questionId: string; id: string; name: string; lat: number; lng: number; kind: string; status: string; priceCents: number | null }>>`
        select a.question_id, p.id, p.name, p.lat, p.lng, p.kind, a.status, a.price_cents
        from answers a join places p on p.id = a.place_id
        where a.question_id = any(${ids}::uuid[]) and a.status in ('aceita','confirmada','pendente')
        order by (a.status = 'aceita') desc, (a.status = 'confirmada') desc, a.confirms desc`
    : [];
  const byQ = new Map<string, Similar['places']>();
  for (const p of places) {
    const list = byQ.get(p.questionId) ?? [];
    if (!list.some((x) => x.id === p.id)) list.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, kind: p.kind, status: p.status, priceCents: p.priceCents });
    byQ.set(p.questionId, list);
  }
  return rows.map((r) => ({ ...r, score: Math.max(r.sim, r.wsim * 0.8, r.rank), places: byQ.get(r.id) ?? [] }));
}

questionRoutes.get('/search', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('config');
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ q, similar: [], finds: [] });
  const similar = await similarQuestions(sql, cfg.CITY_DEFAULT, q, 8);
  const finds = await sql`
    with p as (select norm_text(${q}) as n, websearch_to_tsquery('portuguese', f_unaccent(${q})) as tsq)
    select pl.id as place_id, pl.name, pl.kind, pl.lat, pl.lng, pl.address, pl.partner_tier,
           count(a.id)::int as finds, (array_agg(q.title order by a.created_at desc))[1:5] as titles,
           max(a.created_at) as last_find_at
    from answers a join questions q on q.id = a.question_id join places pl on pl.id = a.place_id, p
    where a.status in ('aceita','confirmada') and q.city_id = ${cfg.CITY_DEFAULT}
      and (q.title_norm % p.n or p.n <% q.title_norm or (p.tsq::text <> '' and q.tsv @@ p.tsq))
    group by pl.id order by finds desc limit 30`;
  return c.json({ q, similar, finds });
});

const listSchema = z.object({
  status: z.enum(['aberta', 'respondida', 'resolvida', 'fechada', 'abertas', 'todas']).default('todas'),
  category: z.string().optional(),
  mine: z.string().optional(),
  sort: z.enum(['recentes', 'populares', 'perto']).default('recentes'),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  offset: z.coerce.number().int().min(0).default(0),
});

questionRoutes.get('/questions', async (c) => {
  const sql = c.get('sql');
  const cfg = c.get('config');
  const me = c.get('user');
  const p = listSchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const hasPos = p.lat != null && p.lng != null;
  const rows = await sql`
    select qu.id, qu.title, qu.category, qu.status, qu.bounty, qu.answers_count, qu.followers_count, qu.created_at, qu.solved_at,
           qu.lat, qu.lng, qu.photo_path,
           u.id as author_id, u.name as author_name, u.avatar_url as author_avatar, u.xp as author_xp,
           (select p2.name from answers a join places p2 on p2.id = a.place_id
             where a.question_id = qu.id and a.status in ('aceita','confirmada')
             order by (a.status = 'aceita') desc, a.confirms desc limit 1) as top_place,
           ${hasPos ? sql`case when qu.lat is null then null else earth_distance(ll_to_earth(qu.lat, qu.lng), ll_to_earth(${p.lat!}, ${p.lng!}))::int end` : sql`null::int`} as distance_m
    from questions qu join users u on u.id = qu.author_id
    where qu.city_id = ${cfg.CITY_DEFAULT}
      ${p.status === 'todas' ? sql`and qu.status <> 'fechada'` : p.status === 'abertas' ? sql`and qu.status in ('aberta','respondida')` : sql`and qu.status = ${p.status}`}
      ${p.category ? sql`and qu.category = ${p.category}` : sql``}
      ${p.mine ? (me ? sql`and (qu.author_id = ${me.id}::uuid or exists (select 1 from question_followers f where f.question_id = qu.id and f.user_id = ${me.id}::uuid))` : sql`and false`) : sql``}
    order by ${p.sort === 'populares' ? sql`qu.bounty desc, qu.followers_count desc, qu.created_at desc`
              : p.sort === 'perto' && hasPos ? sql`distance_m asc nulls last, qu.created_at desc`
              : sql`qu.created_at desc`}
    limit 20 offset ${p.offset}`;
  return c.json({ items: rows, nextOffset: rows.length === 20 ? p.offset + 20 : null });
});

const createSchema = z.object({
  title: z.string().trim().min(3).max(140),
  details: z.string().trim().max(1000).optional(),
  category: z.enum(['casa', 'eletronicos', 'ferramentas', 'saude', 'alimentos', 'pets', 'roupas', 'papelaria', 'auto', 'bebe', 'esporte', 'outros']).default('outros'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  photoEvidenceId: z.string().uuid().optional(),
  force: z.boolean().default(false),
});

/** Coordenada aproximada: deslocamento aleatório de até ±0,002° (≈ 200 m) e arredondamento a 3 casas (≈ 110 m). */
export function approxCoord(v: number): number {
  return Math.round((v + (Math.random() - 0.5) * 0.004) * 1000) / 1000;
}

questionRoutes.post('/questions', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const cfg = c.get('config');
  const eco = await loadEconomy(sql);
  const body = createSchema.parse(await c.req.json());
  if (!body.force) {
    const similar = await similarQuestions(sql, cfg.CITY_DEFAULT, body.title, 5);
    const strong = similar.filter((s) => s.sim >= 0.5 || s.wsim >= 0.75);
    if (strong.length > 0) return c.json({ error: 'parecida', message: 'Já garimparam isso. Veja se serve antes de perguntar de novo.', similar }, 409);
  }
  if (!(await takeCap(sql, u.id, 'perguntas', eco.limites_dia.perguntas))) throw new HTTPException(429, { message: 'Você já perguntou bastante hoje. Volte amanhã.' });
  let photoPath: string | null = null;
  if (body.photoEvidenceId) {
    const ev = (await sql<{ filePath: string }[]>`select file_path from evidences where id = ${body.photoEvidenceId}::uuid and uploader_id = ${u.id}::uuid and answer_id is null`)[0];
    photoPath = ev?.filePath ?? null;
  }
  // A posição é pública e vem do GPS de quem pergunta: guardamos só a região aproximada (deslocamento até ~200 m, 3 casas).
  const hasPos = body.lat != null && body.lng != null;
  const lat = hasPos ? approxCoord(body.lat!) : null;
  const lng = hasPos ? approxCoord(body.lng!) : null;
  const q = await sql.begin(async (tx) => {
    const row = (await tx<{ id: string }[]>`
      insert into questions(city_id, author_id, title, details, category, lat, lng, photo_path, followers_count, tip_budget_left)
      values (${cfg.CITY_DEFAULT}, ${u.id}::uuid, ${body.title}, ${body.details ?? null}, ${body.category}, ${lat}, ${lng}, ${photoPath}, 1, ${eco.pepitas.gorjeta_por_pergunta})
      returning id`)[0]!;
    await tx`insert into question_followers(question_id, user_id) values (${row.id}::uuid, ${u.id}::uuid)`;
    await award(tx, u.id, 'pergunta', eco.xp.pergunta, 0, { type: 'pergunta', id: row.id }, {}, 0);
    return row.id;
  });
  await recordSignal(c, u.id);
  return c.json({ id: q }, 201);
});

questionRoutes.get('/questions/:id', async (c) => {
  const sql = c.get('sql');
  const me = c.get('user');
  const id = c.req.param('id');
  const question = (await sql`
    select qu.*, u.name as author_name, u.avatar_url as author_avatar, u.xp as author_xp, u.handle as author_handle,
           ${me ? sql`exists (select 1 from question_followers f where f.question_id = qu.id and f.user_id = ${me.id}::uuid)` : sql`false`} as i_follow
    from questions qu join users u on u.id = qu.author_id where qu.id = ${id}::uuid`)[0];
  if (!question) throw new HTTPException(404, { message: 'Pergunta não encontrada.' });
  const answers = await sql`
    select a.id, a.note, a.price_cents, to_char(a.seen_on, 'YYYY-MM-DD') as seen_on, a.status, a.evidence_score, a.is_first_for_place, a.confirms, a.denies, a.created_at,
           p.id as place_id, p.name as place_name, p.address as place_address, p.lat as place_lat, p.lng as place_lng, p.kind as place_kind, p.partner_tier,
           u.id as author_id, u.name as author_name, u.avatar_url as author_avatar, u.xp as author_xp,
           coalesce((select json_agg(json_build_object(
               'id', e.id, 'url', '/u/' || e.file_path, 'kind', e.kind, 'score', e.score, 'flags', e.flags,
               'width', e.width, 'height', e.height, 'hasGps', e.exif_lat is not null, 'takenAt', e.exif_taken_at,
               'distanceExifM', e.distance_exif_m, 'distanceDeviceM', e.distance_device_m) order by e.created_at)
             from evidences e where e.answer_id = a.id), '[]'::json) as evidences,
           coalesce((select json_agg(json_build_object('id', t.id, 'amount', t.amount, 'from', fu.name) order by t.created_at)
             from tips t join users fu on fu.id = t.from_user where t.answer_id = a.id), '[]'::json) as tips,
           ${me ? sql`(select vote from confirmations where answer_id = a.id and user_id = ${me.id}::uuid)` : sql`null::smallint`} as my_vote
    from answers a join places p on p.id = a.place_id join users u on u.id = a.author_id
    where a.question_id = ${id}::uuid and a.status not in ('oculta','rejeitada')
    order by (a.status = 'aceita') desc, (a.status = 'confirmada') desc, a.evidence_score desc, a.created_at asc`;
  const { tsv: _tsv, titleNorm: _tn, ...pub } = question as Record<string, unknown>;
  return c.json({ question: pub, answers, canAccept: !!me && me.id === question.authorId && question.status !== 'resolvida' && question.status !== 'fechada' });
});

const followSchema = z.object({ on: z.boolean().optional() });

/** Sem corpo, alterna (segue/deixa de seguir). Com `{ on: true }` só liga: quem já segue recebe `already: true` e nada muda. */
questionRoutes.post('/questions/:id/follow', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const eco = await loadEconomy(sql);
  const id = c.req.param('id');
  const body = followSchema.parse(await c.req.json().catch(() => ({})));
  const result = await sql.begin(async (tx) => {
    const q = (await tx<{ authorId: string; bounty: number; status: string }[]>`select author_id, bounty, status from questions where id = ${id}::uuid for update`)[0];
    if (!q) throw new HTTPException(404, { message: 'Pergunta não encontrada.' });
    const existing = await tx`select 1 from question_followers where question_id = ${id}::uuid and user_id = ${u.id}::uuid`;
    // O bônus é função de quem acompanha agora: +5 por pessoa além do autor, teto 100. Sair devolve os 5; entrar e sair
    // em loop não cunha nada. Depois de resolvida/fechada o bônus congela (já foi pago ou não será).
    const recompute = async () => (await tx<{ bounty: number }[]>`
      with n as (select count(*)::int as c from question_followers where question_id = ${id}::uuid)
      update questions set followers_count = n.c,
        bounty = case when status in ('resolvida', 'fechada') then bounty
                      else least(${eco.pepitas.bounty_maximo}, greatest(0, n.c - 1) * ${eco.pepitas.bounty_tambem_quero}) end
      from n where id = ${id}::uuid returning bounty`)[0]!.bounty;
    if (existing.length) {
      if (body.on === true) return { following: true, bounty: q.bounty, already: true };
      if (q.authorId === u.id) throw new HTTPException(400, { message: 'Quem perguntou acompanha sempre.' });
      await tx`delete from question_followers where question_id = ${id}::uuid and user_id = ${u.id}::uuid`;
      return { following: false, bounty: await recompute() };
    }
    await tx`insert into question_followers(question_id, user_id) values (${id}::uuid, ${u.id}::uuid)`;
    const bounty = await recompute();
    // XP de "também quero" uma vez por pergunta (re-seguir não paga de novo), dentro do limite diário.
    const paid = await tx`select 1 from ledger where user_id = ${u.id}::uuid and kind = 'tambem_quero' and ref_type = 'pergunta' and ref_id = ${id}::uuid and state <> 'estornado'`;
    if (!paid.length && (await takeCap(tx, u.id, 'tambem_quero', eco.limites_dia.tambem_quero))) {
      await award(tx, u.id, 'tambem_quero', eco.xp.tambem_quero, 0, { type: 'pergunta', id }, {}, 0);
    }
    return { following: true, bounty };
  });
  return c.json(result);
});

questionRoutes.post('/questions/:id/close', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const id = c.req.param('id');
  const r = await sql`update questions set status = 'fechada' where id = ${id}::uuid and author_id = ${u.id}::uuid and status in ('aberta','respondida') returning id`;
  if (!r.length) throw new HTTPException(400, { message: 'Só quem perguntou fecha, e só se ainda estiver aberta.' });
  return c.json({ ok: true });
});

/** Quem perguntou escolhe a resposta que resolveu. É o evento que mais cunha pepitas; por isso passa pelo antifraude. */
questionRoutes.post('/questions/:id/accept', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const eco = await loadEconomy(sql);
  const id = c.req.param('id');
  const body = z.object({ answerId: z.string().uuid() }).parse(await c.req.json());
  const out = await sql.begin(async (tx) => {
    const q = (await tx<{ authorId: string; status: string; bounty: number }[]>`select author_id, status, bounty from questions where id = ${id}::uuid for update`)[0];
    if (!q) throw new HTTPException(404, { message: 'Pergunta não encontrada.' });
    if (q.authorId !== u.id) throw new HTTPException(403, { message: 'Só quem perguntou pode aceitar.' });
    if (q.status === 'resolvida' || q.status === 'fechada') throw new HTTPException(400, { message: 'Essa pergunta já foi resolvida.' });
    const a = (await tx<{ id: string; authorId: string; status: string; isFirstForPlace: boolean; evidenceScore: number }[]>`
      select id, author_id, status, is_first_for_place, evidence_score from answers where id = ${body.answerId}::uuid and question_id = ${id}::uuid for update`)[0];
    if (!a) throw new HTTPException(404, { message: 'Resposta não encontrada nessa pergunta.' });
    if (a.status === 'oculta' || a.status === 'rejeitada') throw new HTTPException(400, { message: 'Essa resposta foi removida.' });
    const col = await collusionBetween(tx, u.id, a.authorId);
    const reused = await allEvidencesReused(tx, a.id);
    const fraction = a.isFirstForPlace ? 1 : eco.pepitas.fracao_segundo_achado;
    let credits = Math.round(eco.pepitas.resposta_aceita * fraction) + (a.isFirstForPlace ? q.bounty : 0);
    let primeiro = a.isFirstForPlace ? eco.pepitas.primeiro_achado : 0;
    const meta: Record<string, unknown> = { primeiro: a.isFirstForPlace, bounty: q.bounty, evidencia: a.evidenceScore };
    let vestDays: number | undefined;
    let motivo: string | null = null;
    // Sem pepitas (XP continua): mesmo aparelho, só fotos que o autor já tinha usado, ou teto diário de cunhagem.
    if (col.strong) { credits = 0; primeiro = 0; meta['conluio'] = 'mesmo_dispositivo'; motivo = 'mesmo_dispositivo'; }
    else if (col.weak) { vestDays = eco.carencia_dias_baixa_confianca; meta['conluio'] = 'mesma_rede'; }
    if (reused) { credits = 0; primeiro = 0; meta['motivo'] = 'foto_reutilizada'; motivo ??= 'foto_reutilizada'; }
    if (!(await takeMintCap(tx, a.authorId, eco, credits + primeiro))) { credits = 0; primeiro = 0; meta['teto_diario'] = true; motivo ??= 'teto_diario'; }
    await tx`update questions set status = 'resolvida', accepted_answer_id = ${a.id}::uuid, solved_at = now() where id = ${id}::uuid`;
    await tx`update answers set status = 'aceita' where id = ${a.id}::uuid`;
    await award(tx, a.authorId, 'resposta_aceita', eco.xp.resposta_aceita, credits, { type: 'resposta', id: a.id }, meta, vestDays);
    if (a.isFirstForPlace) {
      const why: Record<string, unknown> = {};
      for (const k of ['conluio', 'motivo', 'teto_diario']) if (meta[k] !== undefined) why[k] = meta[k];
      await award(tx, a.authorId, 'primeiro_achado', eco.xp.primeiro_achado, primeiro, { type: 'resposta', id: a.id }, why, vestDays);
    }
    // XP por fechar o garimpo: uma vez por pergunta (um re-aceite depois de a resposta aceita cair não paga de novo).
    const closedBefore = await tx`select 1 from ledger where user_id = ${u.id}::uuid and kind = 'aceitar_resposta' and ref_type = 'pergunta' and ref_id = ${id}::uuid and state <> 'estornado'`;
    if (!closedBefore.length) await award(tx, u.id, 'aceitar_resposta', eco.xp.aceitar_resposta, 0, { type: 'pergunta', id }, {}, 0);
    const firsts = (await tx<{ n: number }[]>`
      select count(distinct place_id)::int as n from answers where author_id = ${a.authorId}::uuid and status = 'aceita' and is_first_for_place`)[0]!.n;
    await grantBadge(tx, a.authorId, 'primeiro_achado');
    if (firsts >= 5) await grantBadge(tx, a.authorId, 'olho_de_lince');
    await tx`select fn_recompute_trust(${a.authorId}::uuid)`;
    return { answerId: a.id, credits, primeiroAchado: primeiro, xp: eco.xp.resposta_aceita, collusion: col.strong ? 'forte' : col.weak ? 'fraco' : null, motivo, tetoDiario: meta['teto_diario'] === true };
  });
  await recordSignal(c, u.id);
  return c.json(out);
});
