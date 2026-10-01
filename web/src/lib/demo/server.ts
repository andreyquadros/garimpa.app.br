import { BADGES, LEVELS, levelFor } from '../economy';
import { demoImageDataUrl, placeholderDataUrl, processImage } from './image';
import {
  CITY, HttpError, award, eco, getState, grantBadge, localDay, memImages, now, nowIso, recomputeTrust, reverseAnswerAwards, save, takeCap,
  touchStreak, userById, uuid, vestDue, type DemoAnswer, type DemoEvidence, type DemoPlace, type DemoQuestion, type DemoState, type DemoUser,
} from './state';
import { DUPLICATE_HAMMING, SIMILAR_HAMMING, hamming, haversineM, normText, scoreEvidence, similarity, slugify, textMatches, tokens, trigramSimilarity } from './text';

/**
 * API falsa do modo demonstração: reproduz as rotas, formatos e códigos de api/src/routes/*.ts inteiramente no navegador.
 * Diferenças assumidas: sem EXIF (só a localização do aparelho pontua), sem conluio por dispositivo (todas as personas usam o mesmo navegador).
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = new URL(req.url, location.href);
  await sleep(150 + Math.random() * 150); // latência artificial: dá tempo de as animações aparecerem
  try {
    const out = await route(req, url);
    save();
    return json(out.body, out.status);
  } catch (e) {
    save();
    if (e instanceof HttpError) return json({ ...e.body, message: e.message }, e.status);
    console.error('[demo]', e);
    return json({ error: 'interno', message: 'Algo deu errado do nosso lado. Tente de novo.' }, 500);
  }
}

type Out = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Out => ({ status, body });
type Body = Record<string, unknown>;

/* ---------- validação (no lugar do zod) ---------- */

const invalid = (name: string, msg: string) => new HttpError(400, `${name}: ${msg}`, { error: 'validacao' });
function str(b: Body, name: string, o: { min?: number; max?: number; optional?: boolean; trim?: boolean } = {}): string | undefined {
  const raw = b[name];
  if (raw == null || raw === '') { if (o.optional) return undefined; throw invalid(name, 'obrigatório'); }
  if (typeof raw !== 'string') throw invalid(name, 'texto esperado');
  const v = o.trim !== false ? raw.trim() : raw;
  if (o.min != null && v.length < o.min) throw invalid(name, `mínimo de ${o.min} caracteres`);
  if (o.max != null && v.length > o.max) throw invalid(name, `máximo de ${o.max} caracteres`);
  return v;
}
function num(b: Body, name: string, o: { min?: number; max?: number; int?: boolean; optional?: boolean } = {}): number | undefined {
  const v = b[name];
  if (v == null) { if (o.optional) return undefined; throw invalid(name, 'obrigatório'); }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw invalid(name, 'número esperado');
  if (o.int && !Number.isInteger(v)) throw invalid(name, 'inteiro esperado');
  if (o.min != null && v < o.min) throw invalid(name, `mínimo ${o.min}`);
  if (o.max != null && v > o.max) throw invalid(name, `máximo ${o.max}`);
  return v;
}
function oneOf<T extends string>(v: unknown, name: string, values: readonly T[], fallback?: T): T {
  if (v == null || v === '') { if (fallback !== undefined) return fallback; throw invalid(name, 'obrigatório'); }
  if (typeof v === 'string' && (values as readonly string[]).includes(v)) return v as T;
  throw invalid(name, `valor inválido`);
}
const qnum = (v: string | null): number | undefined => { if (v == null || v === '') return undefined; const n = Number(v); if (!Number.isFinite(n)) throw invalid('posição', 'número esperado'); return n; };

const CATEGORIES = ['casa', 'eletronicos', 'ferramentas', 'saude', 'alimentos', 'pets', 'roupas', 'papelaria', 'auto', 'bebe', 'esporte', 'outros'] as const;
const PLACE_KINDS = ['loja', 'mercado', 'farmacia', 'feira', 'servico', 'outro'] as const;
const EVIDENCE_KINDS = ['foto_produto', 'foto_fachada', 'nota_fiscal', 'recibo', 'print', 'outro'] as const;

/* ---------- serialização (camelCase, como o cliente Postgres da API) ---------- */

function pubUser(u: DemoUser) {
  const { googleSub: _g, lastActiveOn: _l, ...rest } = u;
  return rest;
}
export function evidenceUrl(e: DemoEvidence): string {
  if (e.seedImage) return demoImageDataUrl(e.seedImage.title, e.seedImage.n);
  return memImages.get(e.id) ?? placeholderDataUrl();
}
const byTime = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
const statusRank = (st: string) => (st === 'aceita' ? 0 : st === 'confirmada' ? 1 : 2);
const place = (s: DemoState, id: string): DemoPlace => { const p = s.places.find((x) => x.id === id); if (!p) throw new HttpError(404, 'Lugar não encontrado.'); return p; };
const question = (s: DemoState, id: string): DemoQuestion => { const q = s.questions.find((x) => x.id === id); if (!q) throw new HttpError(404, 'Pergunta não encontrada.'); return q; };
const photoPathOf = (s: DemoState, q: DemoQuestion): string | null => { if (!q.photoEvidenceId) return null; const e = s.evidences.find((x) => x.id === q.photoEvidenceId); return e ? evidenceUrl(e) : null; };

/** Lugar mais forte de uma pergunta (aceito primeiro, depois confirmado por mais gente). */
function topPlace(s: DemoState, qid: string): string | null {
  const a = s.answers.filter((x) => x.questionId === qid && (x.status === 'aceita' || x.status === 'confirmada'))
    .sort((x, y) => statusRank(x.status) - statusRank(y.status) || y.confirms - x.confirms)[0];
  return a ? place(s, a.placeId).name : null;
}

function questionListItem(s: DemoState, q: DemoQuestion, pos?: { lat: number; lng: number }) {
  const u = userById(s, q.authorId);
  return {
    id: q.id, title: q.title, category: q.category, status: q.status, bounty: q.bounty, answersCount: q.answersCount, followersCount: q.followersCount,
    createdAt: q.createdAt, solvedAt: q.solvedAt, lat: q.lat, lng: q.lng, photoPath: photoPathOf(s, q),
    authorId: u.id, authorName: u.name, authorAvatar: u.avatarUrl, authorXp: u.xp, topPlace: topPlace(s, q.id),
    distanceM: pos && q.lat != null && q.lng != null ? haversineM(q.lat, q.lng, pos.lat, pos.lng) : null,
  };
}

function answerView(s: DemoState, a: DemoAnswer, me: DemoUser | null) {
  const p = place(s, a.placeId);
  const u = userById(s, a.authorId);
  const evidences = s.evidences.filter((e) => e.answerId === a.id).sort(byTime).map((e) => ({
    id: e.id, url: evidenceUrl(e), kind: e.kind, score: e.score, flags: e.flags, width: e.width, height: e.height,
    hasGps: e.exifLat != null, takenAt: e.exifTakenAt, distanceExifM: e.distanceExifM, distanceDeviceM: e.distanceDeviceM,
  }));
  const tips = s.tips.filter((t) => t.answerId === a.id).sort(byTime).map((t) => ({ id: t.id, amount: t.amount, from: userById(s, t.fromUser).name }));
  const myVote = me ? s.confirmations.find((c) => c.answerId === a.id && c.userId === me.id)?.vote ?? null : null;
  return {
    id: a.id, note: a.note, priceCents: a.priceCents, seenOn: a.seenOn, status: a.status, evidenceScore: a.evidenceScore, isFirstForPlace: a.isFirstForPlace,
    confirms: a.confirms, denies: a.denies, createdAt: a.createdAt,
    placeId: p.id, placeName: p.name, placeAddress: p.address, placeLat: p.lat, placeLng: p.lng, placeKind: p.kind, partnerTier: p.partnerTier,
    authorId: u.id, authorName: u.name, authorAvatar: u.avatarUrl, authorXp: u.xp, evidences, tips, myVote,
  };
}

type Similar = {
  id: string; title: string; status: string; category: string; answersCount: number; followersCount: number; createdAt: string;
  sim: number; wsim: number; rank: number; score: number;
  places: Array<{ id: string; name: string; lat: number; lng: number; kind: string; status: string; priceCents: number | null }>;
};

/** Perguntas parecidas (base da deduplicação), com os lugares já apontados em cada uma. */
function similarQuestions(s: DemoState, text: string, limit = 8): Similar[] {
  if (text.trim().length < 3) return [];
  const rows = s.questions
    .filter((q) => q.status !== 'fechada')
    .map((q) => ({ q, t: similarity(text, q.title, q.details ?? '') }))
    .filter(({ t }) => textMatches(t))
    .sort((a, b) => b.t.score - a.t.score || (a.q.createdAt < b.q.createdAt ? 1 : -1))
    .slice(0, limit);
  return rows.map(({ q, t }) => {
    const places: Similar['places'] = [];
    const answers = s.answers.filter((a) => a.questionId === q.id && ['aceita', 'confirmada', 'pendente'].includes(a.status))
      .sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.confirms - a.confirms);
    for (const a of answers) {
      if (places.some((x) => x.id === a.placeId)) continue;
      const p = place(s, a.placeId);
      places.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, kind: p.kind, status: a.status, priceCents: a.priceCents });
    }
    return { id: q.id, title: q.title, status: q.status, category: q.category, answersCount: q.answersCount, followersCount: q.followersCount, createdAt: q.createdAt, sim: t.sim, wsim: t.wsim, rank: t.rank, score: t.score, places };
  });
}

type BBox = [number, number, number, number];
function parseBbox(v: string | null): BBox | null {
  const b = (v ?? '').split(',').map(Number);
  return b.length === 4 && b.every(Number.isFinite) ? (b as BBox) : null;
}
const inBox = (p: { lat: number; lng: number }, box: BBox | null) => !box || (p.lat >= box[1] && p.lat <= box[3] && p.lng >= box[0] && p.lng <= box[2]);

/** Pinos do mapa: lugares com achados (aceitos ou confirmados), opcionalmente filtrados pelo produto e pela área visível. */
function placeFinds(s: DemoState, text: string | null, box: BBox | null, limit: number) {
  const matching = text ? new Set(s.questions.filter((q) => textMatches(similarity(text, q.title, q.details ?? ''))).map((q) => q.id)) : null;
  const groups = new Map<string, { p: DemoPlace; answers: DemoAnswer[] }>();
  for (const a of s.answers) {
    if (a.status !== 'aceita' && a.status !== 'confirmada') continue;
    if (matching && !matching.has(a.questionId)) continue;
    const p = place(s, a.placeId);
    if (!inBox(p, box)) continue;
    const g = groups.get(p.id) ?? { p, answers: [] };
    g.answers.push(a);
    groups.set(p.id, g);
  }
  return [...groups.values()].map(({ p, answers }) => {
    const sorted = answers.slice().sort((a, b) => -byTime(a, b));
    return {
      placeId: p.id, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, address: p.address, partnerTier: p.partnerTier,
      finds: answers.length, titles: sorted.slice(0, 5).map((a) => question(s, a.questionId).title), lastFindAt: sorted[0]!.createdAt,
    };
  }).sort((a, b) => b.finds - a.finds).slice(0, limit);
}

/** Início da semana (segunda 00:00) no fuso de Rondônia, que não tem horário de verão (UTC-4). */
function weekStartIso(): string {
  const [y, m, d] = localDay(now()).split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7), 4)).toISOString();
}

type NewPlace = { name: string; address?: string; lat: number; lng: number; kind: string; whatsapp?: string };
function parseNewPlace(b: Body): NewPlace {
  return {
    name: str(b, 'name', { min: 2, max: 120 })!, address: str(b, 'address', { max: 200, optional: true }),
    lat: num(b, 'lat', { min: -90, max: 90 })!, lng: num(b, 'lng', { min: -180, max: 180 })!,
    kind: oneOf(b['kind'], 'kind', PLACE_KINDS, 'loja'), whatsapp: str(b, 'whatsapp', { max: 20, optional: true }),
  };
}

/** Reaproveita um lugar com o mesmo nome a menos de 150 m; senão cria. Recusa pontos fora do raio da cidade. */
function getOrCreatePlace(s: DemoState, input: NewPlace, userId: string): { id: string; created: boolean } {
  if (haversineM(CITY.lat, CITY.lng, input.lat, input.lng) > CITY.radiusM) throw new HttpError(400, 'Esse ponto fica fora da área do piloto (Ariquemes).');
  const n = normText(input.name);
  const same = s.places.find((p) => normText(p.name) === n && haversineM(p.lat, p.lng, input.lat, input.lng) <= 150);
  if (same) return { id: same.id, created: false };
  const id = uuid();
  s.places.push({ id, name: input.name, address: input.address ?? null, lat: input.lat, lng: input.lng, kind: input.kind, whatsapp: input.whatsapp ?? null, partnerTier: null, source: 'user', createdBy: userId, createdAt: nowIso() });
  award(s, userId, 'lugar_novo', 4, 0, { type: 'lugar', id }, {}, 0);
  if (s.places.filter((p) => p.createdBy === userId).length >= 5) grantBadge(s, userId, 'cartografo');
  return { id, created: true };
}

function uniqueHandle(s: DemoState, name: string): string {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.floor(100 + Math.random() * 900)}`;
    if (!s.users.some((u) => u.handle.toLowerCase() === candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/* ---------- roteamento ---------- */

async function readJson(req: Request): Promise<Body> {
  try { const v = (await req.json()) as unknown; return v && typeof v === 'object' ? (v as Body) : {}; } catch { return {}; }
}

async function route(req: Request, url: URL): Promise<Out> {
  const s = getState();
  const me = s.sessionUserId ? s.users.find((u) => u.id === s.sessionUserId && !u.bannedAt) ?? null : null;
  const requireUser = (): DemoUser => { if (!me) throw new HttpError(401, 'Entre para continuar.'); return me; };
  const method = req.method.toUpperCase();
  const idx = url.pathname.indexOf('/api/');
  const seg = (idx >= 0 ? url.pathname.slice(idx) : url.pathname).split('/').filter(Boolean).slice(1); // depois de "api"
  const b = seg[1];
  const qs = url.searchParams;
  const is = (m: string, ...parts: Array<string | null>) => method === m && seg.length === parts.length && parts.every((p, i) => p === null || seg[i] === p);

  if (is('GET', 'health')) return ok({ ok: true, time: nowIso() });

  /* auth */
  if (is('POST', 'auth', 'google')) throw new HttpError(503, 'Login com Google não configurado (GOOGLE_CLIENT_ID).');
  if (is('POST', 'auth', 'dev')) {
    const body = await readJson(req);
    const name = str(body, 'name', { min: 2, max: 60, trim: false })!;
    // "marina" entra na conta de demonstração demo-marina (dados do seed); outros nomes criam contas dev.
    const demo = s.users.find((u) => u.handle === `demo-${slugify(name)}` && u.googleSub.startsWith('seed:') && !u.bannedAt);
    let user = demo ?? null;
    if (!user) {
      const sub = `dev:${name.toLowerCase()}`;
      user = s.users.find((u) => u.googleSub === sub) ?? null;
      if (user) user.name = name;
      else {
        user = { id: uuid(), name, handle: uniqueHandle(s, name), email: null, avatarUrl: null, cityId: CITY.id, xp: 0, credits: 0, creditsPending: 0, trust: 0.5, streakDays: 0, lastActiveOn: null, role: 'user', bannedAt: null, createdAt: nowIso(), googleSub: sub };
        s.users.push(user);
        grantBadge(s, user.id, 'fundador');
      }
    }
    s.sessionUserId = user.id;
    return ok({ user: pubUser(user) });
  }
  if (is('POST', 'auth', 'logout')) { s.sessionUserId = null; return ok({ ok: true }); }
  if (is('DELETE', 'auth', 'account')) {
    const u = requireUser();
    u.bannedAt = nowIso(); u.name = 'Conta removida'; u.email = null; u.avatarUrl = null;
    s.sessionUserId = null;
    return ok({ ok: true });
  }

  /* config, perfil, livro-razão, ranking */
  if (is('GET', 'config')) {
    return ok({
      city: CITY, googleClientId: null, devLogin: true, levels: LEVELS,
      economy: { xp: eco.xp, pepitas: eco.pepitas, limites_dia: eco.limites_dia, carencia_dias: eco.carencia_dias, conversao: eco.conversao, evidencia_forte: eco.evidencia_forte },
      tiles: { url: 'https://onibus.incubadora.cloud/tiles/{z}/{x}/{y}.png', fallbackUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', minZoom: 12, maxZoom: 18 },
    });
  }
  if (is('GET', 'me')) {
    const u = requireUser();
    const streak = touchStreak(s, u.id);
    vestDue(s);
    const badges = s.badges.filter((x) => x.userId === u.id).sort((x, y) => -byTime({ createdAt: x.earnedAt }, { createdAt: y.earnedAt }))
      .map((x) => { const d = BADGES.find((bd) => bd.slug === x.slug); return { slug: x.slug, name: d?.name ?? x.slug, description: d?.description ?? '', icon: d?.icon ?? 'award', earnedAt: x.earnedAt }; });
    const mine = s.answers.filter((x) => x.authorId === u.id);
    const pending = s.ledger.filter((l) => l.userId === u.id && l.state === 'carencia' && l.vestsAt).map((l) => l.vestsAt!).sort();
    const stats = {
      perguntas: s.questions.filter((q) => q.authorId === u.id).length, respostas: mine.length,
      achados: mine.filter((x) => x.status === 'aceita' || x.status === 'confirmada').length,
      confirmacoes: s.confirmations.filter((x) => x.userId === u.id).length, gorjetasRecebidas: s.tips.filter((t) => t.toUser === u.id).length,
      proximaLiberacao: pending[0] ?? null,
    };
    const rank = s.users.filter((x) => !x.bannedAt && x.xp > u.xp).length + 1;
    return ok({ user: { ...pubUser(u), streakDays: streak }, level: levelFor(u.xp), badges, stats, rank });
  }
  if (is('GET', 'me', 'ledger')) {
    const u = requireUser();
    const items = s.ledger.filter((l) => l.userId === u.id).sort((x, y) => -byTime(x, y) || y.id - x.id).slice(0, 60)
      .map(({ reversalOf: _r, ...l }) => l);
    return ok({ items });
  }
  if (is('GET', 'ranking')) {
    const period = qs.get('period') === 'geral' ? 'geral' : 'semana';
    type Row = { id: string; name: string; handle: string; avatarUrl: string | null; xp: number; pontos: number; streakDays: number };
    let rows: Row[];
    if (period === 'geral') {
      rows = s.users.filter((u) => !u.bannedAt && u.xp > 0).sort((x, y) => y.xp - x.xp || byTime(x, y)).slice(0, 50)
        .map((u) => ({ id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, xp: u.xp, pontos: u.xp, streakDays: u.streakDays }));
    } else {
      const since = weekStartIso();
      const pts = new Map<string, number>();
      for (const l of s.ledger) if (l.xp > 0 && l.createdAt >= since) pts.set(l.userId, (pts.get(l.userId) ?? 0) + l.xp);
      rows = [...pts.entries()].map(([id, pontos]) => ({ u: userById(s, id), pontos })).filter(({ u }) => !u.bannedAt)
        .sort((x, y) => y.pontos - x.pontos || y.u.xp - x.u.xp).slice(0, 50)
        .map(({ u, pontos }) => ({ id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, xp: u.xp, pontos, streakDays: u.streakDays }));
    }
    const ranked = rows.map((r, i) => ({ ...r, pos: i + 1, level: levelFor(r.xp) }));
    return ok({ period, items: ranked, me: me ? ranked.find((r) => r.id === me.id) ?? null : null });
  }

  /* busca e perguntas */
  if (is('GET', 'search')) {
    const text = (qs.get('q') ?? '').trim();
    if (text.length < 2) return ok({ q: text, similar: [], finds: [] });
    return ok({ q: text, similar: similarQuestions(s, text, 8), finds: placeFinds(s, text, null, 30) });
  }
  if (is('GET', 'questions')) {
    const status = oneOf(qs.get('status'), 'status', ['aberta', 'respondida', 'resolvida', 'fechada', 'abertas', 'todas'] as const, 'todas');
    const category = qs.get('category') || undefined;
    const mine = qs.get('mine') || undefined;
    const sort = oneOf(qs.get('sort'), 'sort', ['recentes', 'populares', 'perto'] as const, 'recentes');
    const lat = qnum(qs.get('lat'));
    const lng = qnum(qs.get('lng'));
    const offset = Math.max(0, Math.floor(qnum(qs.get('offset')) ?? 0));
    const pos = lat != null && lng != null ? { lat, lng } : undefined;
    const followed = me ? new Set(s.followers.filter((f) => f.userId === me.id).map((f) => f.questionId)) : null;
    const items = s.questions.filter((q) => {
      if (status === 'todas' ? q.status === 'fechada' : status === 'abertas' ? !(q.status === 'aberta' || q.status === 'respondida') : q.status !== status) return false;
      if (category && q.category !== category) return false;
      if (mine && me && followed && !(q.authorId === me.id || followed.has(q.id))) return false;
      return true;
    }).map((q) => questionListItem(s, q, pos));
    items.sort((x, y) => {
      if (sort === 'populares') return y.bounty - x.bounty || y.followersCount - x.followersCount || -byTime(x, y);
      if (sort === 'perto' && pos) return (x.distanceM ?? Infinity) - (y.distanceM ?? Infinity) || -byTime(x, y);
      return -byTime(x, y);
    });
    const page = items.slice(offset, offset + 20);
    return ok({ items: page, nextOffset: page.length === 20 ? offset + 20 : null });
  }
  if (is('POST', 'questions')) {
    const u = requireUser();
    const body = await readJson(req);
    const title = str(body, 'title', { min: 3, max: 140 })!;
    const details = str(body, 'details', { max: 1000, optional: true });
    const category = oneOf(body['category'], 'category', CATEGORIES, 'outros');
    const lat = num(body, 'lat', { optional: true });
    const lng = num(body, 'lng', { optional: true });
    const photoEvidenceId = str(body, 'photoEvidenceId', { optional: true });
    const force = body['force'] === true;
    if (!force) {
      const similar = similarQuestions(s, title, 5);
      if (similar.some((x) => x.sim >= 0.5 || x.wsim >= 0.75)) return ok({ error: 'parecida', message: 'Já garimparam isso. Veja se serve antes de perguntar de novo.', similar }, 409);
    }
    if (!takeCap(s, u.id, 'perguntas', eco.limites_dia.perguntas)) throw new HttpError(429, 'Você já perguntou bastante hoje. Volte amanhã.');
    const ev = photoEvidenceId ? s.evidences.find((e) => e.id === photoEvidenceId && e.uploaderId === u.id && e.answerId == null) : undefined;
    const id = uuid();
    s.questions.push({ id, authorId: u.id, title, details: details ?? null, category, lat: lat ?? null, lng: lng ?? null, status: 'aberta', bounty: 0, tipBudgetLeft: eco.pepitas.gorjeta_por_pergunta, followersCount: 1, answersCount: 0, photoEvidenceId: ev?.id ?? null, acceptedAnswerId: null, createdAt: nowIso(), solvedAt: null });
    s.followers.push({ questionId: id, userId: u.id, createdAt: nowIso() });
    award(s, u.id, 'pergunta', eco.xp.pergunta, 0, { type: 'pergunta', id }, {}, 0);
    return ok({ id }, 201);
  }
  if (is('GET', 'questions', null)) {
    const q = question(s, b!);
    const au = userById(s, q.authorId);
    const answers = s.answers.filter((x) => x.questionId === q.id && x.status !== 'oculta' && x.status !== 'rejeitada')
      .sort((x, y) => statusRank(x.status) - statusRank(y.status) || y.evidenceScore - x.evidenceScore || byTime(x, y))
      .map((x) => answerView(s, x, me));
    const { photoEvidenceId: _p, ...rest } = q;
    const pub = { ...rest, cityId: CITY.id, photoPath: photoPathOf(s, q), authorName: au.name, authorAvatar: au.avatarUrl, authorXp: au.xp, authorHandle: au.handle, iFollow: !!me && s.followers.some((f) => f.questionId === q.id && f.userId === me.id) };
    return ok({ question: pub, answers, canAccept: !!me && me.id === q.authorId && q.status !== 'resolvida' && q.status !== 'fechada' });
  }
  if (is('POST', 'questions', null, 'follow')) {
    const u = requireUser();
    const q = question(s, b!);
    const i = s.followers.findIndex((f) => f.questionId === q.id && f.userId === u.id);
    if (i >= 0) {
      if (q.authorId === u.id) throw new HttpError(400, 'Quem perguntou acompanha sempre.');
      s.followers.splice(i, 1);
      q.followersCount = Math.max(0, q.followersCount - 1);
      return ok({ following: false, bounty: q.bounty });
    }
    s.followers.push({ questionId: q.id, userId: u.id, createdAt: nowIso() });
    q.bounty = Math.min(eco.pepitas.bounty_maximo, q.bounty + eco.pepitas.bounty_tambem_quero);
    q.followersCount++;
    if (takeCap(s, u.id, 'tambem_quero', 10)) award(s, u.id, 'tambem_quero', eco.xp.tambem_quero, 0, { type: 'pergunta', id: q.id }, {}, 0);
    return ok({ following: true, bounty: q.bounty });
  }
  if (is('POST', 'questions', null, 'close')) {
    const u = requireUser();
    const q = s.questions.find((x) => x.id === b);
    if (!q || q.authorId !== u.id || !(q.status === 'aberta' || q.status === 'respondida')) throw new HttpError(400, 'Só quem perguntou fecha, e só se ainda estiver aberta.');
    q.status = 'fechada';
    return ok({ ok: true });
  }
  if (is('POST', 'questions', null, 'accept')) {
    const u = requireUser();
    const body = await readJson(req);
    const answerId = str(body, 'answerId')!;
    const q = question(s, b!);
    if (q.authorId !== u.id) throw new HttpError(403, 'Só quem perguntou pode aceitar.');
    if (q.status === 'resolvida' || q.status === 'fechada') throw new HttpError(400, 'Essa pergunta já foi resolvida.');
    const an = s.answers.find((x) => x.id === answerId && x.questionId === q.id);
    if (!an) throw new HttpError(404, 'Resposta não encontrada nessa pergunta.');
    if (an.status === 'oculta' || an.status === 'rejeitada') throw new HttpError(400, 'Essa resposta foi removida.');
    // Conluio por dispositivo não se aplica à demonstração: todas as personas usam este mesmo navegador.
    const fraction = an.isFirstForPlace ? 1 : eco.pepitas.fracao_segundo_achado;
    const credits = Math.round(eco.pepitas.resposta_aceita * fraction) + (an.isFirstForPlace ? q.bounty : 0);
    q.status = 'resolvida'; q.acceptedAnswerId = an.id; q.solvedAt = nowIso();
    an.status = 'aceita';
    award(s, an.authorId, 'resposta_aceita', eco.xp.resposta_aceita, credits, { type: 'resposta', id: an.id }, { primeiro: an.isFirstForPlace, bounty: q.bounty, evidencia: an.evidenceScore });
    if (an.isFirstForPlace) award(s, an.authorId, 'primeiro_achado', eco.xp.primeiro_achado, eco.pepitas.primeiro_achado, { type: 'resposta', id: an.id }, {});
    award(s, u.id, 'aceitar_resposta', eco.xp.aceitar_resposta, 0, { type: 'pergunta', id: q.id }, {}, 0);
    const firsts = new Set(s.answers.filter((x) => x.authorId === an.authorId && x.status === 'aceita' && x.isFirstForPlace).map((x) => x.placeId)).size;
    grantBadge(s, an.authorId, 'primeiro_achado');
    if (firsts >= 5) grantBadge(s, an.authorId, 'olho_de_lince');
    recomputeTrust(s, an.authorId);
    return ok({ answerId: an.id, credits, xp: eco.xp.resposta_aceita, collusion: null });
  }
  if (is('POST', 'questions', null, 'answers')) {
    const u = requireUser();
    const body = await readJson(req);
    const placeId = str(body, 'placeId', { optional: true });
    const newPlace = body['newPlace'] && typeof body['newPlace'] === 'object' ? parseNewPlace(body['newPlace'] as Body) : undefined;
    const note = str(body, 'note', { max: 600, optional: true });
    const priceCents = num(body, 'priceCents', { int: true, min: 0, max: 100_000_000, optional: true });
    const seenOn = str(body, 'seenOn', { optional: true });
    if (seenOn && !/^\d{4}-\d{2}-\d{2}$/.test(seenOn)) throw invalid('seenOn', 'data inválida');
    const evidenceIds = body['evidenceIds'];
    if (!Array.isArray(evidenceIds) || evidenceIds.length < 1) throw invalid('evidenceIds', 'Envie pelo menos uma prova.');
    if (evidenceIds.length > 4) throw invalid('evidenceIds', 'no máximo 4 provas');
    if (!placeId && !newPlace) throw invalid('dados', 'Escolha um lugar ou cadastre um novo.');

    const q = question(s, b!);
    if (q.authorId === u.id) throw new HttpError(400, 'Você não responde a própria pergunta; peça para alguém confirmar.');
    if (q.status === 'resolvida' || q.status === 'fechada') throw new HttpError(400, 'Essa pergunta já foi resolvida. Você ainda pode confirmar as respostas.');
    if (!takeCap(s, u.id, 'respostas', eco.limites_dia.respostas)) throw new HttpError(429, 'Limite de respostas de hoje atingido.');

    const pid = placeId ?? getOrCreatePlace(s, newPlace!, u.id).id;
    const pl = place(s, pid);
    const evs = s.evidences.filter((e) => evidenceIds.includes(e.id) && e.uploaderId === u.id && e.answerId == null);
    if (evs.length === 0) throw new HttpError(400, 'Envie pelo menos uma prova (foto do produto na loja, nota ou recibo).');

    // Texto copiado de outra resposta da mesma pergunta: sinal de plágio.
    let textCopied = false;
    if (note && note.length >= 20) {
      const copy = s.answers.find((x) => x.questionId === q.id && x.authorId !== u.id && (x.note ?? '').length >= 20 && trigramSimilarity(x.note ?? '', note) > 0.85);
      if (copy) {
        textCopied = true;
        if (copy.placeId === pid) throw new HttpError(409, 'Já existe uma resposta igual para esse lugar. Confirme a dela em vez de repetir.');
      }
    }
    if (s.answers.some((x) => x.questionId === q.id && x.authorId === u.id && x.placeId === pid)) throw new HttpError(409, 'Você já respondeu com esse lugar nessa pergunta.');
    const isFirst = !s.answers.some((x) => x.questionId === q.id && x.placeId === pid);
    const answerId = uuid();
    const an: DemoAnswer = { id: answerId, questionId: q.id, authorId: u.id, placeId: pid, note: note ?? null, priceCents: priceCents ?? null, seenOn: seenOn ?? null, status: 'pendente', evidenceScore: 0, isFirstForPlace: isFirst, confirms: 0, denies: 0, createdAt: nowIso() };
    s.answers.push(an);

    let best = 0;
    const checks: Array<{ id: string; score: number; flags: string[] }> = [];
    for (const ev of evs) {
      const reused = ev.flags.includes('foto_reutilizada')
        || s.evidences.some((o) => o.uploaderId === u.id && o.id !== ev.id && o.answerId != null && hamming(o.dhash, ev.dhash) <= SIMILAR_HAMMING);
      const r = scoreEvidence({
        kind: ev.kind, exifLat: ev.exifLat, exifLng: ev.exifLng, exifTakenAt: ev.exifTakenAt ? new Date(ev.exifTakenAt) : null,
        deviceLat: ev.deviceLat, deviceLng: ev.deviceLng, placeLat: pl.lat, placeLng: pl.lng, reusedBySameUser: reused, similarToOther: ev.flags.includes('foto_parecida'), now: now(),
      });
      const flags = Array.from(new Set([...ev.flags.filter((f) => !['sem_gps', 'sem_data'].includes(f)), ...r.flags, ...(textCopied ? ['texto_copiado'] : [])]));
      ev.answerId = answerId; ev.score = r.score; ev.flags = flags; ev.distanceExifM = r.distanceExifM; ev.distanceDeviceM = r.distanceDeviceM;
      best = Math.max(best, r.score);
      checks.push({ id: ev.id, score: r.score, flags });
    }
    an.evidenceScore = best;
    q.answersCount++;
    if (q.status === 'aberta') q.status = 'respondida';
    const strong = best >= eco.evidencia_forte;
    const xp = strong ? eco.xp.resposta_com_evidencia : Math.max(3, Math.floor(eco.xp.resposta_com_evidencia / 3));
    award(s, u.id, 'resposta_com_evidencia', xp, 0, { type: 'resposta', id: answerId }, { forte: strong, primeiro: isFirst }, 0);
    if (s.evidences.filter((e) => e.uploaderId === u.id && e.score >= 70 && e.answerId != null).length >= 10) grantBadge(s, u.id, 'bom_de_prova');
    return ok({ answerId, placeId: pid, isFirst, evidenceScore: best, strong, xp, checks }, 201);
  }

  /* respostas: confirmar e gorjeta */
  if (is('POST', 'answers', null, 'confirm')) {
    const u = requireUser();
    const body = await readJson(req);
    const vote = body['vote'];
    if (vote !== 1 && vote !== -1) throw invalid('vote', 'use 1 ou -1');
    const comment = str(body, 'comment', { max: 300, optional: true });
    const an = s.answers.find((x) => x.id === b);
    if (!an) throw new HttpError(404, 'Resposta não encontrada.');
    if (an.authorId === u.id) throw new HttpError(400, 'Você não confirma a própria resposta.');
    // Peso do voto em degraus: conta suspeita 0,5 · normal 1 · veterana 1,5. Duas contas normais confirmam.
    const weight = u.trust < eco.confianca_baixa ? 0.5 : u.trust >= 0.8 ? 1.5 : 1.0;
    const existing = s.confirmations.find((x) => x.answerId === an.id && x.userId === u.id);
    const isNew = !existing;
    if (isNew && !takeCap(s, u.id, 'confirmacoes', eco.limites_dia.confirmacoes)) throw new HttpError(429, 'Limite de confirmações de hoje atingido.');
    if (existing) { existing.vote = vote; existing.comment = comment ?? null; existing.weight = weight; existing.createdAt = nowIso(); }
    else s.confirmations.push({ answerId: an.id, userId: u.id, vote, comment: comment ?? null, weight, createdAt: nowIso() });
    const votes = s.confirmations.filter((x) => x.answerId === an.id);
    const confirms = votes.filter((x) => x.vote === 1).reduce((t, x) => t + x.weight, 0);
    const denies = votes.filter((x) => x.vote === -1).reduce((t, x) => t + x.weight, 0);
    an.confirms = Math.round(confirms); an.denies = Math.round(denies);
    if (isNew) award(s, u.id, 'confirmar', eco.xp.confirmar, 0, { type: 'resposta', id: an.id }, { vote }, 0);

    let newStatus: string = an.status;
    if (an.status === 'pendente' && confirms >= eco.confirmacoes_para_validar && confirms > denies) {
      newStatus = 'confirmada';
      an.status = 'confirmada';
      const fraction = an.isFirstForPlace ? 1 : eco.pepitas.fracao_segundo_achado;
      award(s, an.authorId, 'resposta_confirmada', eco.xp.resposta_confirmada, Math.round(eco.pepitas.resposta_confirmada * fraction), { type: 'resposta', id: an.id }, { primeiro: an.isFirstForPlace });
      for (const v of votes.filter((x) => x.vote === 1)) {
        award(s, v.userId, 'confirmacao_validada', eco.xp.confirmacao_validada, eco.pepitas.confirmacao_validada, { type: 'resposta', id: an.id }, {});
        if (s.confirmations.filter((x) => x.userId === v.userId && x.vote === 1).length >= 10) grantBadge(s, v.userId, 'bateia');
      }
      recomputeTrust(s, an.authorId);
    } else if (an.status !== 'aceita' && denies >= 3 && denies > confirms * 2) {
      newStatus = 'oculta';
      an.status = 'oculta';
      reverseAnswerAwards(s, an.id, 'negada_pela_comunidade');
    }
    return ok({ vote, confirms, denies, status: newStatus, xp: isNew ? eco.xp.confirmar : 0 });
  }
  if (is('POST', 'answers', null, 'tip')) {
    const u = requireUser();
    const body = await readJson(req);
    const amount = num(body, 'amount', { int: true, min: 1, max: 500 })!;
    const source = oneOf(body['source'], 'source', ['orcamento', 'saldo'] as const, 'orcamento');
    const an = s.answers.find((x) => x.id === b);
    if (!an) throw new HttpError(404, 'Resposta não encontrada.');
    if (an.authorId === u.id) throw new HttpError(400, 'Gorjeta é para quem ajudou você.');
    const q = question(s, an.questionId);
    const budget = q.tipBudgetLeft;
    if (source === 'orcamento') {
      if (q.authorId !== u.id) throw new HttpError(403, 'O orçamento de gorjetas é de quem perguntou. Use seu saldo.');
      if (amount > budget) throw new HttpError(400, `Você ainda tem ${budget} pepitas de gorjeta nessa pergunta.`);
      if (!takeCap(s, u.id, 'gorjetas_orcamento', eco.limites_dia.gorjetas_orcamento, amount)) throw new HttpError(429, 'Limite diário de gorjetas atingido.');
      q.tipBudgetLeft -= amount;
    } else {
      award(s, u.id, 'gorjeta_enviada', 0, -amount, { type: 'resposta', id: an.id }, {}, 0);
    }
    const tipId = uuid();
    s.tips.push({ id: tipId, fromUser: u.id, toUser: an.authorId, answerId: an.id, amount, source, minted: true, createdAt: nowIso() });
    award(s, an.authorId, 'gorjeta_recebida', Math.ceil(amount / 5), amount, { type: 'gorjeta', id: tipId }, { de: u.id, fonte: source });
    if (s.tips.filter((t) => t.fromUser === u.id).length >= 10) grantBadge(s, u.id, 'mao_aberta');
    return ok({ tipId, amount, minted: true, budgetLeft: source === 'orcamento' ? budget - amount : budget }, 201);
  }

  /* denúncias */
  if (is('POST', 'flags')) {
    const u = requireUser();
    const body = await readJson(req);
    const targetType = oneOf(body['targetType'], 'targetType', ['pergunta', 'resposta', 'evidencia', 'lugar', 'usuario'] as const);
    const targetId = str(body, 'targetId')!;
    const reason = oneOf(body['reason'], 'reason', ['plagio', 'foto_falsa', 'lugar_errado', 'spam', 'ofensivo', 'outro'] as const);
    const details = str(body, 'details', { max: 500, optional: true, trim: false });
    const existing = s.flags.find((f) => f.targetType === targetType && f.targetId === targetId && f.reporterId === u.id);
    if (existing) { existing.reason = reason; existing.details = details ?? null; }
    else s.flags.push({ id: uuid(), targetType, targetId, reporterId: u.id, reason, details: details ?? null, status: 'aberta', createdAt: nowIso() });
    // Três denúncias de contas confiáveis escondem a resposta e estornam o que ela rendeu, até revisão.
    if (targetType === 'resposta') {
      const n = s.flags.filter((f) => f.targetType === 'resposta' && f.targetId === targetId && f.status === 'aberta' && userById(s, f.reporterId).trust >= 0.6).length;
      const an = s.answers.find((x) => x.id === targetId);
      if (n >= 3 && an && an.status !== 'oculta') { an.status = 'oculta'; reverseAnswerAwards(s, an.id, 'denuncias_da_comunidade'); }
    }
    return ok({ ok: true }, 201);
  }

  /* envio de prova */
  if (is('POST', 'uploads')) {
    const u = requireUser();
    if (!takeCap(s, u.id, 'uploads', eco.limites_dia.uploads)) throw new HttpError(429, 'Limite de envios de hoje atingido. Volte amanhã.');
    let form: FormData;
    try { form = await req.formData(); } catch { throw new HttpError(400, 'Envie um arquivo de imagem no campo "file".'); }
    const file = form.get('file');
    if (!(file instanceof Blob)) throw new HttpError(400, 'Envie um arquivo de imagem no campo "file".');
    if (file.size > 8 * 1024 * 1024) throw new HttpError(413, 'Imagem acima de 8 MB.');
    const kindRaw = form.get('kind');
    const kind = typeof kindRaw === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : 'foto_produto';
    const fnum = (v: FormDataEntryValue | null) => { const n = typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
    const deviceLat = fnum(form.get('lat'));
    const deviceLng = fnum(form.get('lng'));
    let processed;
    try { processed = await processImage(file); } catch { throw new HttpError(415, 'Não consegui ler essa imagem. Envie JPG, PNG, WebP ou HEIC convertido.'); }

    const near = s.evidences.map((e) => ({ e, d: e.sha === processed.sha ? 0 : hamming(e.dhash, processed.dhash) })).filter((x) => x.d <= SIMILAR_HAMMING).sort((x, y) => x.d - y.d)[0];
    const flags: string[] = [];
    if (near && near.e.uploaderId !== u.id && near.d <= DUPLICATE_HAMMING) {
      return ok({ error: 'foto_repetida', message: 'Essa foto já foi enviada por outra pessoa. Tire uma foto sua no local: é ela que vale pepitas.' }, 409);
    }
    if (near && near.e.uploaderId !== u.id) flags.push('foto_parecida');
    if (near && near.e.uploaderId === u.id) flags.push('foto_reutilizada');
    flags.push('sem_gps', 'sem_data'); // o navegador não lê EXIF
    const id = uuid();
    memImages.set(id, processed.dataUrl);
    s.evidences.push({
      id, answerId: null, uploaderId: u.id, kind, width: processed.width, height: processed.height, sha: processed.sha, dhash: processed.dhash, seedImage: null,
      exifTakenAt: null, exifLat: null, exifLng: null, deviceLat, deviceLng, distanceExifM: null, distanceDeviceM: null, flags, score: 0, createdAt: nowIso(),
    });
    return ok({ id, url: processed.dataUrl, width: processed.width, height: processed.height, kind, flags, exif: { hasGps: false, takenAt: null }, device: { hasLocation: deviceLat != null } }, 201);
  }

  /* lugares e mapa */
  if (is('GET', 'places')) {
    const text = (qs.get('q') ?? '').trim();
    const lat = Number(qs.get('lat'));
    const lng = Number(qs.get('lng'));
    const hasPos = Number.isFinite(lat) && Number.isFinite(lng);
    const qn = normText(text);
    const rows = s.places.map((p) => {
      const pn = normText(p.name);
      const t = text ? similarity(text, p.name) : null;
      const sim = t ? Math.max(t.sim, t.wsim * 0.8, pn.includes(qn) ? 0.9 : 0) : 0;
      return {
        id: p.id, name: p.name, address: p.address, lat: p.lat, lng: p.lng, kind: p.kind, partnerTier: p.partnerTier,
        finds: s.answers.filter((a) => a.placeId === p.id && (a.status === 'aceita' || a.status === 'confirmada')).length,
        distanceM: hasPos ? haversineM(p.lat, p.lng, lat, lng) : null, sim,
        hit: !text || sim > 0 || (t?.allFound ?? false) || tokens(text).some((w) => pn.includes(w)),
      };
    }).filter((r) => r.hit).map(({ hit: _h, ...r }) => r);
    rows.sort((x, y) => (text ? y.sim - x.sim : 0) || (hasPos ? (x.distanceM ?? 0) - (y.distanceM ?? 0) : 0) || y.finds - x.finds || x.name.localeCompare(y.name, 'pt-BR'));
    return ok({ items: rows.slice(0, 20) });
  }
  if (is('GET', 'places', null)) {
    const p = place(s, b!);
    const finds = s.answers.filter((x) => x.placeId === p.id && ['aceita', 'confirmada', 'pendente'].includes(x.status))
      .sort((x, y) => statusRank(x.status) - statusRank(y.status) || -byTime(x, y)).slice(0, 50)
      .map((x) => {
        const q = question(s, x.questionId);
        const au = userById(s, x.authorId);
        const best = s.evidences.filter((e) => e.answerId === x.id).sort((e1, e2) => e2.score - e1.score)[0];
        return { answerId: x.id, status: x.status, priceCents: x.priceCents, createdAt: x.createdAt, confirms: x.confirms, questionId: q.id, title: q.title, authorName: au.name, authorAvatar: au.avatarUrl, photo: best ? evidenceUrl(best) : null };
      });
    const { source: _s, createdBy: _c, ...pub } = p;
    return ok({ place: pub, finds });
  }
  if (is('POST', 'places')) {
    const u = requireUser();
    const input = parseNewPlace(await readJson(req));
    if (!takeCap(s, u.id, 'lugares', 15)) throw new HttpError(429, 'Muitos lugares novos hoje. Volte amanhã.');
    const r = getOrCreatePlace(s, input, u.id);
    const p = place(s, r.id);
    return ok({ place: { id: p.id, name: p.name, address: p.address, lat: p.lat, lng: p.lng, kind: p.kind, partnerTier: p.partnerTier }, created: r.created }, r.created ? 201 : 200);
  }
  if (is('GET', 'map', 'finds')) {
    const text = (qs.get('q') ?? '').trim();
    return ok({ items: placeFinds(s, text || null, parseBbox(qs.get('bbox')), 300) });
  }
  if (is('GET', 'map', 'open')) {
    const box = parseBbox(qs.get('bbox'));
    const items = s.questions.filter((q) => (q.status === 'aberta' || q.status === 'respondida') && q.lat != null && q.lng != null && inBox({ lat: q.lat, lng: q.lng }, box))
      .sort((x, y) => y.bounty - x.bounty || -byTime(x, y)).slice(0, 200)
      .map((q) => ({ id: q.id, title: q.title, category: q.category, bounty: q.bounty, followersCount: q.followersCount, lat: q.lat, lng: q.lng, createdAt: q.createdAt }));
    return ok({ items });
  }

  return ok({ error: 'nao_encontrado', message: 'Rota não encontrada.' }, 404);
}
