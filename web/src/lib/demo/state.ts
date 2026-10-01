import { BADGES, DEFAULT_ECONOMY } from '../economy';
import { seedDhash } from './image';
import { hash32, rng, scoreEvidence } from './text';

/**
 * Estado do modo demonstração: um "banco" em memória, persistido em localStorage (sem imagens),
 * com as mesmas regras do livro-razão da API (carência, estorno, limites diários, confiança, sequência).
 */

export const STORAGE_KEY = 'garimpa.demo.v1';
export const TZ = 'America/Porto_Velho';
export const CITY = { id: 'ariquemes', name: 'Ariquemes', state: 'RO', lat: -9.9075, lng: -63.0415, radiusM: 15000 };
export const eco = DEFAULT_ECONOMY;

export type DemoUser = {
  id: string; name: string; handle: string; email: string | null; avatarUrl: string | null; cityId: string;
  xp: number; credits: number; creditsPending: number; trust: number; streakDays: number; lastActiveOn: string | null;
  role: 'user' | 'moderator' | 'admin'; bannedAt: string | null; createdAt: string; googleSub: string;
};
export type DemoPlace = {
  id: string; name: string; address: string | null; lat: number; lng: number; kind: string; whatsapp: string | null;
  partnerTier: string | null; source: string; createdBy: string | null; createdAt: string;
};
export type DemoQuestion = {
  id: string; authorId: string; title: string; details: string | null; category: string; lat: number | null; lng: number | null;
  status: 'aberta' | 'respondida' | 'resolvida' | 'fechada'; bounty: number; tipBudgetLeft: number; followersCount: number; answersCount: number;
  photoEvidenceId: string | null; acceptedAnswerId: string | null; createdAt: string; solvedAt: string | null;
};
export type DemoFollower = { questionId: string; userId: string; createdAt: string };
export type DemoAnswer = {
  id: string; questionId: string; authorId: string; placeId: string; note: string | null; priceCents: number | null; seenOn: string | null;
  status: 'pendente' | 'aceita' | 'confirmada' | 'rejeitada' | 'oculta'; evidenceScore: number; isFirstForPlace: boolean; confirms: number; denies: number; createdAt: string;
};
export type DemoEvidence = {
  id: string; answerId: string | null; uploaderId: string; kind: string; width: number; height: number; sha: string; dhash: string;
  /** Prova do seed: a imagem é gerada de novo a partir do título (nunca vai para o localStorage). */
  seedImage: { title: string; n: number } | null;
  exifTakenAt: string | null; exifLat: number | null; exifLng: number | null; deviceLat: number | null; deviceLng: number | null;
  distanceExifM: number | null; distanceDeviceM: number | null; flags: string[]; score: number; createdAt: string;
};
export type DemoConfirmation = { answerId: string; userId: string; vote: 1 | -1; comment: string | null; weight: number; createdAt: string };
export type DemoLedger = {
  id: number; userId: string; kind: string; xp: number; credits: number; state: 'disponivel' | 'carencia' | 'estornado'; vestsAt: string | null;
  refType: string | null; refId: string | null; meta: Record<string, unknown>; reversalOf: number | null; createdAt: string;
};
export type DemoTip = { id: string; fromUser: string; toUser: string; answerId: string; amount: number; source: 'orcamento' | 'saldo'; minted: boolean; createdAt: string };
export type DemoUserBadge = { userId: string; slug: string; earnedAt: string };
export type DemoFlag = { id: string; targetType: string; targetId: string; reporterId: string; reason: string; details: string | null; status: 'aberta' | 'procede' | 'improcede'; createdAt: string };

export type DemoState = {
  version: 1; createdAt: string;
  /** Relógio simulado ("Simular 7 dias" soma aqui). */
  clockOffsetMs: number;
  sessionUserId: string | null;
  seq: number;
  users: DemoUser[]; places: DemoPlace[]; questions: DemoQuestion[]; followers: DemoFollower[]; answers: DemoAnswer[];
  evidences: DemoEvidence[]; confirmations: DemoConfirmation[]; ledger: DemoLedger[]; tips: DemoTip[]; badges: DemoUserBadge[]; flags: DemoFlag[];
  caps: Record<string, number>;
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = { error: 'http' }) { super(message); }
}

/** Imagens enviadas nesta sessão (id da prova → data URL). Não persistem: ao recarregar viram placeholder. */
export const memImages = new Map<string, string>();

let state: DemoState | null = null;

export function getState(): DemoState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoState>;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.users)) { state = parsed as DemoState; return state; }
    }
  } catch { /* sem storage ou JSON inválido: recomeça */ }
  state = buildSeed();
  save();
  return state;
}

export function save(): void {
  if (!state) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota ou modo privado: segue só em memória */ }
}

export function resetDemo(): void {
  state = null;
  memImages.clear();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nada */ }
}

/** Avança o relógio simulado dia a dia: libera carências vencidas e mantém a sequência de quem está logado. */
export function simulateDays(days = 7): { vested: number; streak: number | null } {
  const s = getState();
  let streak: number | null = null;
  for (let i = 0; i < days; i++) {
    s.clockOffsetMs += 86400000;
    if (s.sessionUserId) streak = touchStreak(s, s.sessionUserId);
  }
  const vested = vestDue(s);
  save();
  return { vested, streak };
}

export const now = (): Date => new Date(Date.now() + (state?.clockOffsetMs ?? 0));
export const nowIso = (): string => now().toISOString();
export const localDay = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: TZ });

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const h = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}
const seedId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export function userById(s: DemoState, id: string): DemoUser {
  const u = s.users.find((x) => x.id === id);
  if (!u) throw new HttpError(500, `usuário ${id} inexistente`);
  return u;
}

/* ---------- motor de pontos (espelho de db/migrations/0002_economy.sql) ---------- */

export type AwardKind =
  | 'pergunta' | 'tambem_quero' | 'resposta_com_evidencia' | 'resposta_aceita' | 'resposta_confirmada'
  | 'confirmar' | 'confirmacao_validada' | 'primeiro_achado' | 'aceitar_resposta' | 'gorjeta_recebida'
  | 'gorjeta_enviada' | 'bonus_streak' | 'badge' | 'lugar_novo' | 'ajuste' | 'estorno';

/** Lança XP/pepitas. Pepitas positivas entram em carência (7 dias; 14 para confiança baixa), salvo vestDays = 0. */
export function award(
  s: DemoState, userId: string, kind: AwardKind, xp: number, credits: number,
  ref?: { type: string; id: string }, meta: Record<string, unknown> = {}, vestDays?: number, at?: Date,
): number {
  const u = userById(s, userId);
  const when = at ?? now();
  const days = vestDays ?? (u.trust < eco.confianca_baixa ? eco.carencia_dias_baixa_confianca : eco.carencia_dias);
  xp = Math.round(xp);
  credits = Math.round(credits);
  if (credits < 0 && u.credits + credits < 0) throw new HttpError(400, 'saldo insuficiente', { error: 'saldo' });
  let st: DemoLedger['state'] = 'disponivel';
  let vestsAt: string | null = null;
  if (credits > 0 && days > 0) { st = 'carencia'; vestsAt = new Date(when.getTime() + days * 86400000).toISOString(); }
  const id = ++s.seq;
  s.ledger.push({ id, userId, kind, xp, credits, state: st, vestsAt, refType: ref?.type ?? null, refId: ref?.id ?? null, meta, reversalOf: null, createdAt: when.toISOString() });
  u.xp = Math.max(0, u.xp + xp);
  if (st === 'disponivel') u.credits = Math.max(0, u.credits + credits); else u.creditsPending += credits;
  return id;
}

/** Libera pepitas cuja carência venceu. */
export function vestDue(s: DemoState): number {
  const t = now().getTime();
  let n = 0;
  for (const l of s.ledger) {
    if (l.state !== 'carencia' || !l.vestsAt || new Date(l.vestsAt).getTime() > t) continue;
    l.state = 'disponivel';
    const u = userById(s, l.userId);
    u.credits += l.credits;
    u.creditsPending = Math.max(0, u.creditsPending - l.credits);
    n++;
  }
  return n;
}

/** Estorna um lançamento: gera o espelho e corrige saldos. */
export function reverseLedger(s: DemoState, ledgerId: number, reason: string): number | null {
  const r = s.ledger.find((l) => l.id === ledgerId);
  if (!r || r.state === 'estornado') return null;
  if (s.ledger.some((l) => l.reversalOf === ledgerId)) return null;
  const id = ++s.seq;
  s.ledger.push({ id, userId: r.userId, kind: 'estorno', xp: -r.xp, credits: -r.credits, state: 'disponivel', vestsAt: null, refType: r.refType, refId: r.refId, meta: { motivo: reason, original: r.kind }, reversalOf: ledgerId, createdAt: nowIso() });
  const wasVesting = r.state === 'carencia';
  r.state = 'estornado';
  const u = userById(s, r.userId);
  u.xp = Math.max(0, u.xp - r.xp);
  if (wasVesting) u.creditsPending = Math.max(0, u.creditsPending - r.credits); else u.credits = Math.max(0, u.credits - r.credits);
  return id;
}

/** Estorna tudo que uma resposta rendeu (autor, confirmadores e gorjetas). */
export function reverseAnswerAwards(s: DemoState, answerId: string, reason: string): void {
  const rows = s.ledger.filter((l) => l.refType === 'resposta' && l.refId === answerId && l.state !== 'estornado' && l.kind !== 'estorno' && l.reversalOf == null);
  for (const r of rows) reverseLedger(s, r.id, reason);
  const tipIds = new Set(s.tips.filter((t) => t.answerId === answerId).map((t) => t.id));
  const tipRows = s.ledger.filter((l) => l.refType === 'gorjeta' && l.refId && tipIds.has(l.refId) && l.credits > 0 && l.state !== 'estornado');
  for (const r of tipRows) reverseLedger(s, r.id, reason);
}

/** Limite diário atômico (dia no fuso de Rondônia). */
export function takeCap(s: DemoState, userId: string, kind: string, max: number, amount = 1): boolean {
  const key = `${userId}|${localDay(now())}|${kind}`;
  const v = (s.caps[key] ?? 0) + amount;
  if (v > max) return false;
  s.caps[key] = v;
  return true;
}

export function grantBadge(s: DemoState, userId: string, slug: string, at?: Date): boolean {
  if (s.badges.some((b) => b.userId === userId && b.slug === slug)) return false;
  s.badges.push({ userId, slug, earnedAt: (at ?? now()).toISOString() });
  const bonus = BADGES.find((b) => b.slug === slug)?.xpBonus ?? 0;
  if (bonus > 0) award(s, userId, 'badge', bonus, 0, { type: 'badge', id: userId }, { badge: slug }, 0, at);
  return true;
}

/** Confiança (0..1): cresce com respostas aceitas/confirmadas e idade da conta, cai com denúncias procedentes. */
export function recomputeTrust(s: DemoState, userId: string): number {
  const u = userById(s, userId);
  const mine = s.answers.filter((a) => a.authorId === userId);
  const aceitas = mine.filter((a) => a.status === 'aceita').length;
  const confirmadas = mine.filter((a) => a.status === 'confirmada').length;
  const myAnswerIds = new Set(mine.map((a) => a.id));
  const flags = s.flags.filter((f) => f.status === 'procede' && ((f.targetType === 'usuario' && f.targetId === userId) || (f.targetType === 'resposta' && myAnswerIds.has(f.targetId)))).length;
  const ageDays = Math.floor((now().getTime() - new Date(u.createdAt).getTime()) / 86400000);
  let trust = 0.45 + 0.06 * Math.min(aceitas, 8) + 0.02 * Math.min(confirmadas, 10) + (ageDays >= 7 ? 0.05 : 0) - 0.2 * flags;
  trust = Math.max(0.1, Math.min(1, Math.round(trust * 100) / 100));
  u.trust = trust;
  return trust;
}

/** Sequência diária: XP pequeno por dia consecutivo (teto), sem pepitas. */
export function touchStreak(s: DemoState, userId: string): number {
  const u = userById(s, userId);
  const today = localDay(now());
  if (u.lastActiveOn === today) return u.streakDays;
  const yesterday = localDay(new Date(now().getTime() - 86400000));
  u.streakDays = u.lastActiveOn === yesterday ? u.streakDays + 1 : 1;
  u.lastActiveOn = today;
  if (u.streakDays > 1) {
    award(s, userId, 'bonus_streak', Math.min(eco.xp.streak_maximo, eco.xp.streak_por_dia * (u.streakDays - 1)), 0, undefined, { streak: u.streakDays }, 0);
    if (u.streakDays >= 7) grantBadge(s, userId, 'maratonista');
  }
  return u.streakDays;
}

/* ---------- seed (equivalente a api/src/seed.ts) ---------- */

type SeedAnswer = { by: string; place: number; note: string; price?: number; accept?: boolean; confirms?: string[]; gps?: boolean };
type SeedQuestion = { by: string; title: string; details?: string; category: string; daysAgo: number; answers: SeedAnswer[] };

export const SEED_USERS = [
  { handle: 'demo-marina', name: 'Marina Castro' }, { handle: 'demo-joao', name: 'João Pedro Lima' },
  { handle: 'demo-tais', name: 'Taís Oliveira' }, { handle: 'demo-rafael', name: 'Rafael Souza' },
  { handle: 'demo-dona-neide', name: 'Dona Neide' }, { handle: 'demo-lucas', name: 'Lucas Ferreira' },
] as const;

const SEED_PLACES = [
  ['Casa & Cozinha Jamari', 'Av. Jamari, Setor 01', 'loja', 0.0021, -0.0038],
  ['Mercado Tancredo', 'Av. Tancredo Neves, Setor 02', 'mercado', -0.0045, 0.0022],
  ['Utilidades Canaã', 'Av. Canaã, Setor 03', 'loja', 0.0062, 0.0051],
  ['Farmácia Capitão Sílvio', 'Av. Capitão Sílvio, Setor 04', 'farmacia', -0.0088, -0.0064],
  ['Papelaria JK', 'Av. Juscelino Kubitschek, Setor 05', 'loja', 0.0105, -0.0011],
  ['Ferragens Machadinho', 'Av. Machadinho, Setor 06', 'loja', -0.0131, 0.0098],
  ['Feira do Produtor', 'Setor Institucional', 'feira', 0.0034, 0.0122],
  ['Pet Guaporé', 'Av. Guaporé, Setor 02', 'loja', -0.0012, 0.0067],
  ['Eletrônica Jorge Teixeira', 'Bairro Jardim Jorge Teixeira', 'loja', 0.0151, 0.0083],
  ['Atacado Setor 09', 'Setor 09', 'mercado', -0.0176, -0.0032],
] as const;

const SEED_QUESTIONS: SeedQuestion[] = [
  { by: 'demo-marina', title: 'Garrafa de vidro com tampa hermética (1 litro)', details: 'Para guardar kombucha. Pode ser de clipe ou rosca, mas tem que vedar.', category: 'casa', daysAgo: 6,
    answers: [
      { by: 'demo-joao', place: 0, note: 'Tem na prateleira do fundo, perto das panelas. Vidro com tampa de clipe, 1 L.', price: 2490, accept: true, confirms: ['demo-tais', 'demo-lucas'], gps: true },
      { by: 'demo-rafael', place: 2, note: 'Vi hoje de manhã no corredor de potes, modelo com rosca.', price: 1990, confirms: ['demo-marina'] },
    ] },
  { by: 'demo-rafael', title: 'Fonte carregador USB-C 65W (notebook)', details: 'Pode ser de qualquer marca, só precisa ser USB-C PD 65W.', category: 'eletronicos', daysAgo: 4,
    answers: [{ by: 'demo-lucas', place: 8, note: 'Tem Baseus 65W no balcão, pediu pra testar e funcionou no meu Lenovo.', price: 15900, accept: true, confirms: ['demo-joao', 'demo-tais'], gps: true }] },
  { by: 'demo-dona-neide', title: 'Ração hipoalergênica para gato castrado', category: 'pets', daysAgo: 3,
    answers: [{ by: 'demo-tais', place: 7, note: 'Pacote de 1,5 kg da Premier Gourmet e da Guabi. Preço na foto.', price: 8990, confirms: ['demo-rafael', 'demo-lucas'], gps: true }] },
  { by: 'demo-joao', title: 'Lâmpada LED E27 bivolt 15W luz amarela', category: 'casa', daysAgo: 2,
    answers: [{ by: 'demo-dona-neide', place: 5, note: 'Caixa com 3 unidades, R$ 29,90.', price: 2990, confirms: ['demo-marina'] }] },
  { by: 'demo-tais', title: 'Fita isolante líquida', category: 'ferramentas', daysAgo: 2, answers: [] },
  { by: 'demo-lucas', title: 'Caderno de desenho A3 (papel 180g)', category: 'papelaria', daysAgo: 1,
    answers: [{ by: 'demo-marina', place: 4, note: 'Canson A3 180g, última unidade estava hoje às 10h.', price: 4590 }] },
  { by: 'demo-marina', title: 'Guarda-chuva transparente estilo bolha', category: 'roupas', daysAgo: 1, answers: [] },
  { by: 'demo-rafael', title: 'Cadeirinha de carro reversível até 25 kg', category: 'bebe', daysAgo: 0, answers: [] },
];

export function buildSeed(): DemoState {
  const base = Date.now();
  const s: DemoState = {
    version: 1, createdAt: new Date(base).toISOString(), clockOffsetMs: 0, sessionUserId: null, seq: 0,
    users: [], places: [], questions: [], followers: [], answers: [], evidences: [], confirmations: [], ledger: [], tips: [], badges: [], flags: [], caps: {},
  };
  // O estado ainda não está publicado em `state`; now() devolve o relógio real, igual ao que o seed da API usa.
  const at = (daysAgo: number, hours = 0) => new Date(base - daysAgo * 86400000 - hours * 3600000);
  let n = 0;
  const nextId = () => seedId(++n);
  const c = CITY;

  const uid: Record<string, string> = {};
  for (const u of SEED_USERS) {
    const id = nextId();
    uid[u.handle] = id;
    s.users.push({ id, name: u.name, handle: u.handle, email: null, avatarUrl: null, cityId: c.id, xp: 0, credits: 0, creditsPending: 0, trust: 0.5, streakDays: 0, lastActiveOn: null, role: 'user', bannedAt: null, createdAt: at(20).toISOString(), googleSub: `seed:${u.handle}` });
    grantBadge(s, id, 'fundador', at(20));
  }
  const u = (h: string): string => uid[h]!;

  const pid: string[] = [];
  for (const [name, address, kind, dlat, dlng] of SEED_PLACES) {
    const id = nextId();
    pid.push(id);
    s.places.push({ id, name, address, lat: c.lat + dlat, lng: c.lng + dlng, kind, whatsapp: null, partnerTier: null, source: 'seed', createdBy: u('demo-tais'), createdAt: at(19).toISOString() });
  }

  for (const q of SEED_QUESTIONS) {
    const r = rng(hash32(q.title));
    const qid = nextId();
    const qAt = at(q.daysAgo, 3);
    const question: DemoQuestion = {
      id: qid, authorId: u(q.by), title: q.title, details: q.details ?? null, category: q.category,
      lat: c.lat + (r() - 0.5) * 0.02, lng: c.lng + (r() - 0.5) * 0.02, status: 'aberta', bounty: 0, tipBudgetLeft: eco.pepitas.gorjeta_por_pergunta,
      followersCount: 1, answersCount: 0, photoEvidenceId: null, acceptedAnswerId: null, createdAt: qAt.toISOString(), solvedAt: null,
    };
    s.questions.push(question);
    s.followers.push({ questionId: qid, userId: u(q.by), createdAt: qAt.toISOString() });
    award(s, u(q.by), 'pergunta', eco.xp.pergunta, 0, { type: 'pergunta', id: qid }, {}, 0, qAt);
    for (const f of ['demo-lucas', 'demo-tais'].filter((h) => h !== q.by).slice(0, q.daysAgo % 3)) {
      if (s.followers.some((x) => x.questionId === qid && x.userId === u(f))) continue;
      s.followers.push({ questionId: qid, userId: u(f), createdAt: at(q.daysAgo, 2).toISOString() });
      question.followersCount++;
      question.bounty = Math.min(eco.pepitas.bounty_maximo, question.bounty + eco.pepitas.bounty_tambem_quero);
    }
    let first = true;
    for (const a of q.answers) {
      const placeId = pid[a.place]!;
      const pl = s.places.find((p) => p.id === placeId)!;
      const aid = nextId();
      const aAt = at(q.daysAgo, 1);
      const answer: DemoAnswer = {
        id: aid, questionId: qid, authorId: u(a.by), placeId, note: a.note, priceCents: a.price ?? null, seenOn: localDay(at(q.daysAgo)),
        status: 'pendente', evidenceScore: 0, isFirstForPlace: first, confirms: 0, denies: 0, createdAt: aAt.toISOString(),
      };
      s.answers.push(answer);
      const exifLat = a.gps ? pl.lat + 0.0004 : null;
      const exifLng = a.gps ? pl.lng - 0.0003 : null;
      const takenAt = a.gps ? at(q.daysAgo) : null;
      const sc = scoreEvidence({ kind: 'foto_produto', exifLat, exifLng, exifTakenAt: takenAt, deviceLat: pl.lat + 0.001, deviceLng: pl.lng, placeLat: pl.lat, placeLng: pl.lng, reusedBySameUser: false, now: new Date(base) });
      s.evidences.push({
        id: nextId(), answerId: aid, uploaderId: u(a.by), kind: 'foto_produto', width: 800, height: 600, sha: hash32(`${q.title}|${a.place}`).toString(16), dhash: seedDhash(q.title, a.place),
        seedImage: { title: q.title, n: a.place }, exifTakenAt: takenAt ? takenAt.toISOString() : null, exifLat, exifLng, deviceLat: pl.lat + 0.001, deviceLng: pl.lng,
        distanceExifM: sc.distanceExifM, distanceDeviceM: sc.distanceDeviceM, flags: sc.flags, score: sc.score, createdAt: aAt.toISOString(),
      });
      answer.evidenceScore = sc.score;
      question.answersCount++;
      if (question.status === 'aberta') question.status = 'respondida';
      const strong = sc.score >= eco.evidencia_forte;
      award(s, u(a.by), 'resposta_com_evidencia', strong ? eco.xp.resposta_com_evidencia : 5, 0, { type: 'resposta', id: aid }, { forte: strong }, 0, aAt);
      for (const v of a.confirms ?? []) {
        const cAt = at(q.daysAgo, 0.5);
        s.confirmations.push({ answerId: aid, userId: u(v), vote: 1, comment: null, weight: 1, createdAt: cAt.toISOString() });
        answer.confirms++;
        award(s, u(v), 'confirmar', eco.xp.confirmar, 0, { type: 'resposta', id: aid }, {}, 0, cAt);
      }
      if ((a.confirms?.length ?? 0) >= eco.confirmacoes_para_validar) {
        answer.status = 'confirmada';
        const cAt = at(q.daysAgo, 0.4);
        award(s, u(a.by), 'resposta_confirmada', eco.xp.resposta_confirmada, Math.round(eco.pepitas.resposta_confirmada * (first ? 1 : eco.pepitas.fracao_segundo_achado)), { type: 'resposta', id: aid }, {}, 0, cAt);
        for (const v of a.confirms ?? []) award(s, u(v), 'confirmacao_validada', eco.xp.confirmacao_validada, eco.pepitas.confirmacao_validada, { type: 'resposta', id: aid }, {}, 0, cAt);
      }
      if (a.accept) {
        const sAt = at(q.daysAgo, 0.2);
        question.status = 'resolvida';
        question.acceptedAnswerId = aid;
        question.solvedAt = sAt.toISOString();
        answer.status = 'aceita';
        award(s, u(a.by), 'resposta_aceita', eco.xp.resposta_aceita, eco.pepitas.resposta_aceita, { type: 'resposta', id: aid }, { primeiro: first }, 0, sAt);
        award(s, u(a.by), 'primeiro_achado', eco.xp.primeiro_achado, eco.pepitas.primeiro_achado, { type: 'resposta', id: aid }, {}, 0, sAt);
        award(s, u(q.by), 'aceitar_resposta', eco.xp.aceitar_resposta, 0, { type: 'pergunta', id: qid }, {}, 0, sAt);
        grantBadge(s, u(a.by), 'primeiro_achado', sAt);
        const tipId = nextId();
        s.tips.push({ id: tipId, fromUser: u(q.by), toUser: u(a.by), answerId: aid, amount: 10, source: 'orcamento', minted: true, createdAt: sAt.toISOString() });
        question.tipBudgetLeft -= 10;
        award(s, u(a.by), 'gorjeta_recebida', 2, 10, { type: 'gorjeta', id: tipId }, { de: u(q.by) }, 0, sAt);
      }
      first = false;
    }
  }
  for (const user of s.users) recomputeTrust(s, user.id);
  const today = localDay(new Date(base));
  const marina = s.users.find((x) => x.handle === 'demo-marina')!;
  marina.streakDays = 5; marina.lastActiveOn = today;
  const tais = s.users.find((x) => x.handle === 'demo-tais')!;
  tais.streakDays = 12; tais.lastActiveOn = today;
  return s;
}
