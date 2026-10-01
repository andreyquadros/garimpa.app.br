import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type AppEnv, requireUser, recordSignal, collusionBetween } from '../auth.js';
import type { Sql, Tx } from '../db.js';
import { award, takeCap, loadEconomy, grantBadge } from '../economy.js';
import { scoreEvidence, SIMILAR_HAMMING } from '../evidence.js';
import { getOrCreatePlace, newPlaceSchema } from './places.js';

export const answerRoutes = new Hono<AppEnv>();

/** Estorna tudo que uma resposta rendeu (autor e confirmadores). Usado por denúncias e moderação. */
export async function reverseAnswerAwards(db: Sql | Tx, answerId: string, reason: string) {
  const rows = await db<{ id: string }[]>`
    select id from ledger where ref_type = 'resposta' and ref_id = ${answerId}::uuid and state <> 'estornado' and kind <> 'estorno' and reversal_of is null`;
  for (const r of rows) await db`select fn_reverse(${r.id}::bigint, ${reason})`;
  const tipRows = await db<{ id: string }[]>`
    select l.id from ledger l join tips t on t.id = l.ref_id where l.ref_type = 'gorjeta' and t.answer_id = ${answerId}::uuid and l.credits > 0 and l.state <> 'estornado'`;
  for (const r of tipRows) await db`select fn_reverse(${r.id}::bigint, ${reason})`;
}

const createSchema = z.object({
  placeId: z.string().uuid().optional(),
  newPlace: newPlaceSchema.optional(),
  note: z.string().trim().max(600).optional(),
  priceCents: z.number().int().min(0).max(100_000_000).optional(),
  seenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  evidenceIds: z.array(z.string().uuid()).min(1, 'Envie pelo menos uma prova.').max(4),
}).refine((b) => b.placeId || b.newPlace, { message: 'Escolha um lugar ou cadastre um novo.' });

answerRoutes.post('/questions/:id/answers', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const cfg = c.get('config');
  const eco = await loadEconomy(sql);
  const qid = c.req.param('id');
  const body = createSchema.parse(await c.req.json());

  const q = (await sql<{ authorId: string; status: string; createdAt: Date }[]>`select author_id, status, created_at from questions where id = ${qid}::uuid`)[0];
  if (!q) throw new HTTPException(404, { message: 'Pergunta não encontrada.' });
  if (q.authorId === u.id) throw new HTTPException(400, { message: 'Você não responde a própria pergunta; peça para alguém confirmar.' });
  if (q.status === 'resolvida' || q.status === 'fechada') throw new HTTPException(400, { message: 'Essa pergunta já foi resolvida. Você ainda pode confirmar as respostas.' });
  if (!(await takeCap(sql, u.id, 'respostas', eco.limites_dia.respostas))) throw new HTTPException(429, { message: 'Limite de respostas de hoje atingido.' });

  const out = await sql.begin(async (tx) => {
    const placeId = body.placeId ?? (await getOrCreatePlace(tx, cfg.CITY_DEFAULT, body.newPlace!, u.id)).id;
    const place = (await tx<{ lat: number; lng: number }[]>`select lat, lng from places where id = ${placeId}::uuid`)[0];
    if (!place) throw new HTTPException(404, { message: 'Lugar não encontrado.' });

    const evs = await tx<Array<{ id: string; kind: string; sha256: string; dhash: string | null; exifTakenAt: Date | null; exifLat: number | null; exifLng: number | null; deviceLat: number | null; deviceLng: number | null; flags: string[] }>>`
      select id, kind, sha256, dhash::text as dhash, exif_taken_at, exif_lat, exif_lng, device_lat, device_lng, flags
      from evidences where id = any(${body.evidenceIds}::uuid[]) and uploader_id = ${u.id}::uuid and answer_id is null for update`;
    if (evs.length === 0) throw new HTTPException(400, { message: 'Envie pelo menos uma prova (foto do produto na loja, nota ou recibo).' });

    // Texto copiado de outra resposta da mesma pergunta: sinal de plágio.
    const noteNorm = body.note ?? '';
    let textCopied = false;
    if (noteNorm.length >= 20) {
      const copy = await tx<{ placeId: string }[]>`
        select place_id from answers where question_id = ${qid}::uuid and author_id <> ${u.id}::uuid
          and length(note_norm) >= 20 and similarity(note_norm, norm_text(${noteNorm})) > 0.85 limit 1`;
      if (copy[0]) {
        textCopied = true;
        if (copy[0].placeId === placeId) throw new HTTPException(409, { message: 'Já existe uma resposta igual para esse lugar. Confirme a dela em vez de repetir.' });
      }
    }

    const already = await tx`select 1 from answers where question_id = ${qid}::uuid and place_id = ${placeId}::uuid`;
    const isFirst = already.length === 0;
    let answerId: string;
    try {
      answerId = (await tx<{ id: string }[]>`
        insert into answers(question_id, author_id, place_id, note, price_cents, seen_on, is_first_for_place)
        values (${qid}::uuid, ${u.id}::uuid, ${placeId}::uuid, ${body.note ?? null}, ${body.priceCents ?? null}, ${body.seenOn ?? null}, ${isFirst})
        returning id`)[0]!.id;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new HTTPException(409, { message: 'Você já respondeu com esse lugar nessa pergunta.' });
      throw e;
    }

    let best = 0;
    const checks: Array<{ id: string; score: number; flags: string[] }> = [];
    for (const ev of evs) {
      const reused = ev.flags.includes('foto_reutilizada') || (ev.dhash
        ? (await tx`select 1 from evidences e where e.uploader_id = ${u.id}::uuid and e.id <> ${ev.id}::uuid and e.answer_id is not null
                     and e.dhash is not null and fn_hamming(e.dhash, ${ev.dhash}::bit(64)) <= ${SIMILAR_HAMMING} limit 1`).length > 0
        : false);
      const r = scoreEvidence({
        kind: ev.kind, exifLat: ev.exifLat, exifLng: ev.exifLng, exifTakenAt: ev.exifTakenAt,
        deviceLat: ev.deviceLat, deviceLng: ev.deviceLng, placeLat: place.lat, placeLng: place.lng,
        questionCreatedAt: q.createdAt, reusedBySameUser: reused, similarToOther: ev.flags.includes('foto_parecida'),
      });
      const flags = Array.from(new Set([...ev.flags.filter((f) => !['sem_gps', 'sem_data'].includes(f)), ...r.flags, ...(textCopied ? ['texto_copiado'] : [])]));
      await tx`update evidences set answer_id = ${answerId}::uuid, score = ${r.score}, flags = ${flags}::text[],
               distance_exif_m = ${r.distanceExifM}, distance_device_m = ${r.distanceDeviceM} where id = ${ev.id}::uuid`;
      best = Math.max(best, r.score);
      checks.push({ id: ev.id, score: r.score, flags });
    }
    await tx`update answers set evidence_score = ${best} where id = ${answerId}::uuid`;
    await tx`update questions set answers_count = answers_count + 1, status = case when status = 'aberta' then 'respondida' else status end where id = ${qid}::uuid`;

    const strong = best >= eco.evidencia_forte;
    const xp = strong ? eco.xp.resposta_com_evidencia : Math.max(3, Math.floor(eco.xp.resposta_com_evidencia / 3));
    await award(tx, u.id, 'resposta_com_evidencia', xp, 0, { type: 'resposta', id: answerId }, { forte: strong, primeiro: isFirst }, 0);
    const strongCount = (await tx<{ n: number }[]>`select count(*)::int as n from evidences where uploader_id = ${u.id}::uuid and score >= 70 and answer_id is not null`)[0]!.n;
    if (strongCount >= 10) await grantBadge(tx, u.id, 'bom_de_prova');
    return { answerId, placeId, isFirst, evidenceScore: best, strong, xp, checks };
  });
  await recordSignal(c, u.id);
  return c.json(out, 201);
});

answerRoutes.post('/answers/:id/confirm', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const eco = await loadEconomy(sql);
  const id = c.req.param('id');
  const body = z.object({
    vote: z.union([z.literal(1), z.literal(-1)]),
    comment: z.string().trim().max(300).optional(),
    lat: z.number().optional(), lng: z.number().optional(),
  }).parse(await c.req.json());

  const out = await sql.begin(async (tx) => {
    const a = (await tx<{ authorId: string; status: string; isFirstForPlace: boolean; questionId: string }[]>`
      select author_id, status, is_first_for_place, question_id from answers where id = ${id}::uuid for update`)[0];
    if (!a) throw new HTTPException(404, { message: 'Resposta não encontrada.' });
    if (a.authorId === u.id) throw new HTTPException(400, { message: 'Você não confirma a própria resposta.' });
    // Peso do voto em degraus: conta suspeita 0,5 · normal 1 · veterana 1,5. Duas contas normais confirmam.
    const trust = Number(u.trust);
    const weight = trust < eco.confianca_baixa ? 0.5 : trust >= 0.8 ? 1.5 : 1.0;
    const inserted = await tx<{ inserted: boolean }[]>`
      insert into confirmations(answer_id, user_id, vote, comment, device_lat, device_lng, weight)
      values (${id}::uuid, ${u.id}::uuid, ${body.vote}, ${body.comment ?? null}, ${body.lat ?? null}, ${body.lng ?? null}, ${weight})
      on conflict (answer_id, user_id) do update set vote = excluded.vote, comment = excluded.comment, weight = excluded.weight, created_at = now()
      returning (xmax = 0) as inserted`;
    const isNew = inserted[0]?.inserted ?? false;
    if (isNew && !(await takeCap(tx, u.id, 'confirmacoes', eco.limites_dia.confirmacoes))) throw new HTTPException(429, { message: 'Limite de confirmações de hoje atingido.' });
    const sums = (await tx<{ confirms: number; denies: number }[]>`
      select coalesce(sum(weight) filter (where vote = 1), 0)::float as confirms, coalesce(sum(weight) filter (where vote = -1), 0)::float as denies
      from confirmations where answer_id = ${id}::uuid`)[0]!;
    await tx`update answers set confirms = ${Math.round(sums.confirms)}, denies = ${Math.round(sums.denies)} where id = ${id}::uuid`;
    if (isNew) await award(tx, u.id, 'confirmar', eco.xp.confirmar, 0, { type: 'resposta', id }, { vote: body.vote }, 0);

    let newStatus = a.status;
    if (a.status === 'pendente' && sums.confirms >= eco.confirmacoes_para_validar && sums.confirms > sums.denies) {
      newStatus = 'confirmada';
      await tx`update answers set status = 'confirmada' where id = ${id}::uuid`;
      const fraction = a.isFirstForPlace ? 1 : eco.pepitas.fracao_segundo_achado;
      await award(tx, a.authorId, 'resposta_confirmada', eco.xp.resposta_confirmada, Math.round(eco.pepitas.resposta_confirmada * fraction), { type: 'resposta', id }, { primeiro: a.isFirstForPlace });
      const voters = await tx<{ userId: string }[]>`select user_id from confirmations where answer_id = ${id}::uuid and vote = 1`;
      for (const v of voters) {
        const col = await collusionBetween(tx, v.userId, a.authorId);
        await award(tx, v.userId, 'confirmacao_validada', eco.xp.confirmacao_validada, col.strong ? 0 : eco.pepitas.confirmacao_validada, { type: 'resposta', id }, col.strong ? { conluio: 'mesmo_dispositivo' } : {});
        const n = (await tx<{ n: number }[]>`select count(*)::int as n from confirmations where user_id = ${v.userId}::uuid and vote = 1`)[0]!.n;
        if (n >= 10) await grantBadge(tx, v.userId, 'bateia');
      }
      await tx`select fn_recompute_trust(${a.authorId}::uuid)`;
    } else if (a.status !== 'aceita' && sums.denies >= 3 && sums.denies > sums.confirms * 2) {
      newStatus = 'oculta';
      await tx`update answers set status = 'oculta' where id = ${id}::uuid`;
      await reverseAnswerAwards(tx, id, 'negada_pela_comunidade');
    }
    return { vote: body.vote, confirms: sums.confirms, denies: sums.denies, status: newStatus, xp: isNew ? eco.xp.confirmar : 0 };
  });
  await recordSignal(c, u.id);
  return c.json(out);
});

/** Gorjeta: do orçamento da pergunta (cunhada, limitada) ou do saldo de quem dá (transferência). */
answerRoutes.post('/answers/:id/tip', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const eco = await loadEconomy(sql);
  const id = c.req.param('id');
  const body = z.object({ amount: z.number().int().min(1).max(500), source: z.enum(['orcamento', 'saldo']).default('orcamento') }).parse(await c.req.json());
  const out = await sql.begin(async (tx) => {
    const a = (await tx<{ authorId: string; questionId: string; qAuthor: string; budget: number }[]>`
      select a.author_id, a.question_id, q.author_id as q_author, q.tip_budget_left as budget
      from answers a join questions q on q.id = a.question_id where a.id = ${id}::uuid for update of q`)[0];
    if (!a) throw new HTTPException(404, { message: 'Resposta não encontrada.' });
    if (a.authorId === u.id) throw new HTTPException(400, { message: 'Gorjeta é para quem ajudou você.' });
    const col = await collusionBetween(tx, u.id, a.authorId);
    let minted = true;
    if (body.source === 'orcamento') {
      if (a.qAuthor !== u.id) throw new HTTPException(403, { message: 'O orçamento de gorjetas é de quem perguntou. Use seu saldo.' });
      if (body.amount > a.budget) throw new HTTPException(400, { message: `Você ainda tem ${a.budget} pepitas de gorjeta nessa pergunta.` });
      if (!(await takeCap(tx, u.id, 'gorjetas_orcamento', eco.limites_dia.gorjetas_orcamento, body.amount))) throw new HTTPException(429, { message: 'Limite diário de gorjetas atingido.' });
      await tx`update questions set tip_budget_left = tip_budget_left - ${body.amount} where id = ${a.questionId}::uuid`;
      minted = !col.strong;
    } else {
      await award(tx, u.id, 'gorjeta_enviada', 0, -body.amount, { type: 'resposta', id }, {}, 0);
    }
    const tip = (await tx<{ id: string }[]>`
      insert into tips(from_user, to_user, answer_id, amount, source, minted) values (${u.id}::uuid, ${a.authorId}::uuid, ${id}::uuid, ${body.amount}, ${body.source}, ${minted}) returning id`)[0]!;
    await award(tx, a.authorId, 'gorjeta_recebida', Math.ceil(body.amount / 5), minted ? body.amount : 0, { type: 'gorjeta', id: tip.id }, { de: u.id, fonte: body.source, ...(minted ? {} : { conluio: 'mesmo_dispositivo' }) });
    const given = (await tx<{ n: number }[]>`select count(*)::int as n from tips where from_user = ${u.id}::uuid`)[0]!.n;
    if (given >= 10) await grantBadge(tx, u.id, 'mao_aberta');
    return { tipId: tip.id, amount: body.amount, minted, budgetLeft: body.source === 'orcamento' ? a.budget - body.amount : a.budget };
  });
  await recordSignal(c, u.id);
  return c.json(out, 201);
});
