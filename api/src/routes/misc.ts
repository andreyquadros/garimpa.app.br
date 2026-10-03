import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { type AppEnv, requireUser, requireRole, recordSignal } from '../auth.js';
import { LEVELS, levelFor, loadEconomy, touchStreak, takeCap } from '../economy.js';
import { processImage, storeImage, DUPLICATE_HAMMING, SIMILAR_HAMMING } from '../evidence.js';
import { reverseAnswerAwards, restoreAnswerAwards, reopenQuestionIfAccepted } from './answers.js';

export const miscRoutes = new Hono<AppEnv>();

miscRoutes.get('/config', async (c) => {
  const cfg = c.get('config');
  const sql = c.get('sql');
  const city = (await sql`select id, name, state, lat, lng, radius_m from cities where id = ${cfg.CITY_DEFAULT}`)[0] ?? null;
  const eco = await loadEconomy(sql);
  return c.json({
    city,
    googleClientId: cfg.GOOGLE_CLIENT_ID ?? null,
    devLogin: cfg.allowDevLogin,
    levels: LEVELS,
    economy: { xp: eco.xp, pepitas: eco.pepitas, limites_dia: eco.limites_dia, carencia_dias: eco.carencia_dias, conversao: eco.conversao, evidencia_forte: eco.evidencia_forte },
    tiles: {
      // Padrão: OpenStreetMap (o Pepita Social não depende da infraestrutura de outros apps). Servidor próprio via TILES_URL.
      url: process.env.TILES_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      fallbackUrl: process.env.TILES_FALLBACK_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      minZoom: 12, maxZoom: 18,
    },
  });
});

miscRoutes.get('/me', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const eco = await loadEconomy(sql);
  const streak = await touchStreak(sql, u.id, eco);
  await sql`select fn_vest_due()`;
  const fresh = (await sql`select xp, credits, credits_pending, trust from users where id = ${u.id}::uuid`)[0]!;
  const badges = await sql`select b.slug, b.name, b.description, b.icon, ub.earned_at from user_badges ub join badges b on b.slug = ub.badge_slug where ub.user_id = ${u.id}::uuid order by ub.earned_at desc`;
  const stats = (await sql`
    select (select count(*) from questions where author_id = ${u.id}::uuid)::int as perguntas,
           (select count(*) from answers where author_id = ${u.id}::uuid)::int as respostas,
           (select count(*) from answers where author_id = ${u.id}::uuid and status in ('aceita','confirmada'))::int as achados,
           (select count(*) from confirmations where user_id = ${u.id}::uuid)::int as confirmacoes,
           (select count(*) from tips where to_user = ${u.id}::uuid)::int as gorjetas_recebidas,
           (select min(vests_at) from ledger where user_id = ${u.id}::uuid and state = 'carencia') as proxima_liberacao`)[0]!;
  const rank = (await sql`select count(*)::int + 1 as pos from users where xp > ${fresh.xp} and banned_at is null`)[0]!;
  return c.json({
    user: { ...u, xp: fresh.xp, credits: fresh.credits, creditsPending: fresh.creditsPending, trust: Number(fresh.trust), streakDays: streak },
    level: levelFor(fresh.xp), badges, stats, rank: rank.pos,
  });
});

miscRoutes.get('/me/ledger', async (c) => {
  const u = requireUser(c);
  const rows = await c.get('sql')`
    select id, kind, xp, credits, state, vests_at, ref_type, ref_id, meta, created_at
    from ledger where user_id = ${u.id}::uuid order by created_at desc, id desc limit 60`;
  return c.json({ items: rows });
});

miscRoutes.get('/ranking', async (c) => {
  const period = c.req.query('period') === 'geral' ? 'geral' : 'semana';
  const sql = c.get('sql');
  const me = c.get('user');
  type RankRow = { id: string; name: string; handle: string; avatarUrl: string | null; xp: number; pontos: number; streakDays: number };
  const items = period === 'geral'
    ? await sql<RankRow[]>`select id, name, handle, avatar_url, xp, xp as pontos, streak_days from users where banned_at is null and xp > 0 order by xp desc, created_at asc limit 50`
    : await sql<RankRow[]>`
        select u.id, u.name, u.handle, u.avatar_url, u.xp, sum(l.xp)::int as pontos, u.streak_days
        from ledger l join users u on u.id = l.user_id
        where l.xp > 0 and l.state <> 'estornado' and u.banned_at is null
          and l.created_at >= date_trunc('week', (now() at time zone 'America/Porto_Velho')) at time zone 'America/Porto_Velho'
        group by u.id order by pontos desc, u.xp desc limit 50`;
  const ranked = items.map((r, i) => ({ ...r, pos: i + 1, level: levelFor(Number(r.xp)) }));
  const mine = me ? ranked.find((r) => r.id === me.id) ?? null : null;
  return c.json({ period, items: ranked, me: mine });
});

/** Corpo acima do limite é cortado ainda no stream, antes de qualquer buffer em memória. */
const uploadBodyLimit = (c: Parameters<typeof requireUser>[0], next: () => Promise<void>) => {
  const mb = c.get('config').MAX_UPLOAD_MB;
  return bodyLimit({
    maxSize: mb * 1024 * 1024 + 64 * 1024,
    onError: () => { throw new HTTPException(413, { message: `Imagem acima de ${mb} MB.` }); },
  })(c, next);
};

/** Envio de prova (foto, nota, recibo). Fica "solta" até virar parte de uma resposta. */
miscRoutes.post('/uploads', uploadBodyLimit, async (c) => {
  const u = requireUser(c);
  const cfg = c.get('config');
  const sql = c.get('sql');
  const eco = await loadEconomy(sql);
  // Quem já estourou a cota não gasta CPU do servidor; a cota em si só é cobrada depois que a imagem foi aceita.
  const used = (await sql<{ n: number }[]>`
    select coalesce(count, 0)::int as n from daily_caps
    where user_id = ${u.id}::uuid and day = (now() at time zone 'America/Porto_Velho')::date and kind = 'uploads'`)[0]?.n ?? 0;
  if (used >= eco.limites_dia.uploads) throw new HTTPException(429, { message: 'Limite de envios de hoje atingido. Volte amanhã.' });
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'Envie um arquivo de imagem no campo "file".' });
  if (file.size > cfg.MAX_UPLOAD_MB * 1024 * 1024) throw new HTTPException(413, { message: `Imagem acima de ${cfg.MAX_UPLOAD_MB} MB.` });
  const kind = z.enum(['foto_produto', 'foto_fachada', 'nota_fiscal', 'recibo', 'print', 'outro']).catch('foto_produto').parse(body['kind']);
  const num = (v: unknown) => { const n = typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
  const deviceLat = num(body['lat']);
  const deviceLng = num(body['lng']);
  const input = Buffer.from(await file.arrayBuffer());
  let processed;
  try { processed = await processImage(input); } catch { throw new HTTPException(415, { message: 'Não consegui ler essa imagem. Envie JPG, PNG, WebP ou HEIC convertido.' }); }
  if (!(await takeCap(sql, u.id, 'uploads', eco.limites_dia.uploads))) throw new HTTPException(429, { message: 'Limite de envios de hoje atingido. Volte amanhã.' });

  const dup = await sql<{ id: string; uploaderId: string; d: number }[]>`
    select id, uploader_id, fn_hamming(dhash, ${processed.dhash}::bit(64)) as d
    from evidences where dhash is not null and (sha256 = ${processed.sha256} or fn_hamming(dhash, ${processed.dhash}::bit(64)) <= ${SIMILAR_HAMMING})
    order by d asc limit 1`;
  const flags: string[] = [];
  const near = dup[0];
  const certain = near ? near.d <= DUPLICATE_HAMMING : false;
  if (near && near.uploaderId !== u.id && certain) {
    return c.json({ error: 'foto_repetida', message: 'Essa foto já foi enviada por outra pessoa. Tire uma foto sua no local: é ela que vale pepitas.' }, 409);
  }
  if (near && near.uploaderId !== u.id) flags.push('foto_parecida');
  if (near && near.uploaderId === u.id) flags.push('foto_reutilizada');
  if (processed.exifLat == null) flags.push('sem_gps');
  if (!processed.exifTakenAt) flags.push('sem_data');

  const rel = await storeImage(cfg.UPLOAD_DIR, processed.sha256, processed.jpeg);
  const row = (await sql<{ id: string }[]>`
    insert into evidences(uploader_id, kind, file_path, mime, width, height, bytes, sha256, dhash, exif_taken_at, exif_lat, exif_lng, device_lat, device_lng, flags)
    values (${u.id}::uuid, ${kind}, ${rel}, 'image/jpeg', ${processed.width}, ${processed.height}, ${processed.jpeg.length}, ${processed.sha256},
            ${processed.dhash}::bit(64), ${processed.exifTakenAt}, ${processed.exifLat}, ${processed.exifLng}, ${deviceLat}, ${deviceLng}, ${flags}::text[])
    returning id`)[0]!;
  await recordSignal(c, u.id);
  return c.json({
    id: row.id, url: `/u/${rel}`, width: processed.width, height: processed.height, kind, flags,
    exif: { hasGps: processed.exifLat != null, takenAt: processed.exifTakenAt },
    device: { hasLocation: deviceLat != null },
  }, 201);
});

miscRoutes.post('/flags', async (c) => {
  const u = requireUser(c);
  const sql = c.get('sql');
  const body = z.object({
    targetType: z.enum(['pergunta', 'resposta', 'evidencia', 'lugar', 'usuario']),
    targetId: z.string().uuid(),
    reason: z.enum(['plagio', 'foto_falsa', 'lugar_errado', 'spam', 'ofensivo', 'outro']),
    details: z.string().max(500).optional(),
  }).parse(await c.req.json());
  await sql`insert into flags(target_type, target_id, reporter_id, reason, details)
            values (${body.targetType}, ${body.targetId}::uuid, ${u.id}::uuid, ${body.reason}, ${body.details ?? null})
            on conflict (target_type, target_id, reporter_id) do update set reason = excluded.reason, details = excluded.details`;
  // Três denúncias de contas confiáveis escondem a resposta e estornam o que ela rendeu, até revisão.
  if (body.targetType === 'resposta') {
    const n = (await sql<{ n: number }[]>`
      select count(*)::int as n from flags f join users r on r.id = f.reporter_id
      where f.target_type = 'resposta' and f.target_id = ${body.targetId}::uuid and f.status = 'aberta' and r.trust >= 0.6`)[0]!.n;
    if (n >= 3) {
      await sql.begin(async (tx) => {
        const hid = await tx`update answers set status = 'oculta' where id = ${body.targetId}::uuid and status not in ('oculta', 'rejeitada') returning id`;
        if (hid.length) {
          await reopenQuestionIfAccepted(tx, body.targetId);
          await reverseAnswerAwards(tx, body.targetId, 'denuncias_da_comunidade');
        }
      });
    }
  }
  return c.json({ ok: true }, 201);
});

miscRoutes.get('/admin/flags', async (c) => {
  requireRole(c, ['moderator', 'admin']);
  const rows = await c.get('sql')`
    select f.*, r.name as reporter_name from flags f join users r on r.id = f.reporter_id
    where f.status = 'aberta' order by f.created_at asc limit 100`;
  return c.json({ items: rows });
});

miscRoutes.post('/admin/flags/:id', async (c) => {
  const mod = requireRole(c, ['moderator', 'admin']);
  const sql = c.get('sql');
  const body = z.object({ status: z.enum(['procede', 'improcede']) }).parse(await c.req.json());
  const id = c.req.param('id');
  const f = (await sql<{ targetType: string; targetId: string }[]>`select target_type, target_id from flags where id = ${id}::uuid`)[0];
  if (!f) throw new HTTPException(404, { message: 'Denúncia não encontrada.' });
  await sql.begin(async (tx) => {
    await tx`update flags set status = ${body.status}, resolved_at = now(), resolved_by = ${mod.id}::uuid where id = ${id}::uuid`;
    if (f.targetType === 'resposta') {
      const aid = f.targetId;
      if (body.status === 'procede') {
        // Rejeição é definitiva: a resposta deixa de ocupar o "primeiro achado" do lugar e a pergunta reabre se ela era a aceita.
        await tx`update answers set status = 'rejeitada', is_first_for_place = false where id = ${aid}::uuid`;
        await reopenQuestionIfAccepted(tx, aid);
        await reverseAnswerAwards(tx, aid, 'denuncia_procedente');
        const author = (await tx<{ authorId: string }[]>`select author_id from answers where id = ${aid}::uuid`)[0];
        if (author) await tx`select fn_recompute_trust(${author.authorId}::uuid)`;
      } else {
        // Improcedente: a resposta volta com o status que tinha e com o que rendeu (na carência que ainda corria),
        // desde que não reste outro motivo para ficar escondida (denúncia procedente, 3 denúncias confiáveis abertas
        // ou negação pela própria comunidade).
        const a = (await tx<{ status: string }[]>`select status from answers where id = ${aid}::uuid for update`)[0];
        if (a?.status === 'oculta') {
          const still = (await tx<{ procede: boolean; abertas: number; negada: boolean }[]>`
            select exists (select 1 from flags where target_type = 'resposta' and target_id = ${aid}::uuid and status = 'procede') as procede,
                   (select count(*)::int from flags f2 join users r on r.id = f2.reporter_id
                     where f2.target_type = 'resposta' and f2.target_id = ${aid}::uuid and f2.status = 'aberta' and r.trust >= 0.6) as abertas,
                   exists (select 1 from ledger where ref_type = 'resposta' and ref_id = ${aid}::uuid and kind = 'estorno'
                             and state <> 'estornado' and meta->>'motivo' = 'negada_pela_comunidade') as negada`)[0]!;
          if (!still.procede && still.abertas < 3 && !still.negada) {
            await restoreAnswerAwards(tx, aid, 'denuncia_improcedente');
            await tx`update answers set status = case
                when exists (select 1 from questions q where q.accepted_answer_id = answers.id) then 'aceita'
                when exists (select 1 from ledger l where l.ref_type = 'resposta' and l.ref_id = answers.id and l.state <> 'estornado'
                               and (l.kind = 'resposta_confirmada' or (l.kind = 'devolucao' and l.meta->>'original' = 'resposta_confirmada'))) then 'confirmada'
                else 'pendente' end
              where id = ${aid}::uuid and status = 'oculta'`;
            await tx`update questions set status = 'resolvida', solved_at = now() where accepted_answer_id = ${aid}::uuid and status = 'respondida'`;
          }
        }
      }
    }
  });
  return c.json({ ok: true });
});
