import type { AppConfig, Find, LedgerItem, Me, OpenPin, PlaceLite, QuestionDetail, QuestionListItem, RankRow, Similar, UploadResult, User } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data: unknown = null) { super(message); }
}

const DEVICE_KEY = 'garimpa.device';
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return 'sem-storage'; }
}

async function req<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = { 'x-garimpa-device': deviceId() };
  let payload: BodyInit | undefined;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new ApiError(res.status, data?.message ?? `Erro ${res.status}`, data);
  return data as T;
}

const q = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  config: () => req<AppConfig>('GET', '/api/config'),
  me: () => req<Me>('GET', '/api/me'),
  ledger: () => req<{ items: LedgerItem[] }>('GET', '/api/me/ledger'),
  loginGoogle: (credential: string) => req<{ user: User }>('POST', '/api/auth/google', { credential }),
  loginDev: (name: string) => req<{ user: User }>('POST', '/api/auth/dev', { name }),
  logout: () => req<{ ok: true }>('POST', '/api/auth/logout'),
  search: (text: string) => req<{ q: string; similar: Similar[]; finds: Find[] }>('GET', `/api/search${q({ q: text })}`),
  questions: (p: { status?: string; category?: string; mine?: 1; sort?: string; lat?: number; lng?: number; offset?: number }) =>
    req<{ items: QuestionListItem[]; nextOffset: number | null }>('GET', `/api/questions${q(p)}`),
  question: (id: string) => req<QuestionDetail>('GET', `/api/questions/${id}`),
  createQuestion: (b: { title: string; details?: string; category: string; lat?: number; lng?: number; photoEvidenceId?: string; force?: boolean }) =>
    req<{ id: string }>('POST', '/api/questions', b),
  follow: (id: string) => req<{ following: boolean; bounty: number }>('POST', `/api/questions/${id}/follow`),
  close: (id: string) => req<{ ok: true }>('POST', `/api/questions/${id}/close`),
  accept: (id: string, answerId: string) => req<{ answerId: string; credits: number; xp: number; collusion: string | null }>('POST', `/api/questions/${id}/accept`, { answerId }),
  createAnswer: (id: string, b: { placeId?: string; newPlace?: { name: string; address?: string; lat: number; lng: number; kind: string }; note?: string; priceCents?: number; seenOn?: string; evidenceIds: string[] }) =>
    req<{ answerId: string; placeId: string; isFirst: boolean; evidenceScore: number; strong: boolean; xp: number; checks: Array<{ id: string; score: number; flags: string[] }> }>('POST', `/api/questions/${id}/answers`, b),
  confirm: (answerId: string, b: { vote: 1 | -1; comment?: string; lat?: number; lng?: number }) =>
    req<{ vote: number; confirms: number; denies: number; status: string; xp: number }>('POST', `/api/answers/${answerId}/confirm`, b),
  tip: (answerId: string, amount: number, source: 'orcamento' | 'saldo') => req<{ tipId: string; amount: number; minted: boolean; budgetLeft: number }>('POST', `/api/answers/${answerId}/tip`, { amount, source }),
  flag: (b: { targetType: string; targetId: string; reason: string; details?: string }) => req<{ ok: true }>('POST', '/api/flags', b),
  upload: (file: File | Blob, extra: { lat?: number; lng?: number; kind?: string } = {}) => {
    const fd = new FormData();
    fd.set('file', file, 'prova.jpg');
    if (extra.lat != null) fd.set('lat', String(extra.lat));
    if (extra.lng != null) fd.set('lng', String(extra.lng));
    if (extra.kind) fd.set('kind', extra.kind);
    return req<UploadResult>('POST', '/api/uploads', undefined, fd);
  },
  places: (p: { q?: string; lat?: number; lng?: number }) => req<{ items: PlaceLite[] }>('GET', `/api/places${q(p)}`),
  place: (id: string) => req<{ place: PlaceLite & { whatsapp: string | null; createdAt: string }; finds: Array<{ answerId: string; status: string; priceCents: number | null; createdAt: string; confirms: number; questionId: string; title: string; authorName: string; authorAvatar: string | null; photo: string | null }> }>('GET', `/api/places/${id}`),
  createPlace: (b: { name: string; address?: string; lat: number; lng: number; kind: string }) => req<{ place: PlaceLite; created: boolean }>('POST', '/api/places', b),
  mapFinds: (bbox: string, text?: string) => req<{ items: Find[] }>('GET', `/api/map/finds${q({ bbox, q: text })}`),
  mapOpen: (bbox: string) => req<{ items: OpenPin[] }>('GET', `/api/map/open${q({ bbox })}`),
  ranking: (period: 'semana' | 'geral') => req<{ period: string; items: RankRow[]; me: RankRow | null }>('GET', `/api/ranking${q({ period })}`),
};
