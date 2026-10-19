import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { award, rankingWeek } from '../src/economy.js';
import { api, login, makeApp, type Session, testImage, uniq, upload } from './helpers.js';

const ctx = await makeApp();
const { app, cache } = ctx;
afterAll(() => ctx.close());

const C = { lat: -9.9075, lng: -63.0415 };
const BBOX = `${C.lng - 0.05},${C.lat - 0.05},${C.lng + 0.05},${C.lat + 0.05}`;

/** GET com o cabeçalho X-Cache, como pessoa logada ou anônima. */
async function get(url: string, session?: Session) {
  const headers: Record<string, string> = { 'x-garimpa-device': session?.device ?? 'dev-anonimo' };
  if (session) headers.cookie = session.cookie;
  const res = await app.request(url, { headers });
  expect(res.status).toBe(200);
  return { xcache: res.headers.get('x-cache'), json: (await res.json()) as any };
}

// Uma missão com posição e uma resposta confirmada num lugar: dá conteúdo a todas as leituras.
let asker: Session;
let helper: Session;
let voter1: Session;
let voter2: Session;
let qid: string;
let pid: string;
let aid: string;
const tag = uniq('leit');

beforeAll(async () => {
  asker = await login(app, uniq('Autora'));
  helper = await login(app, uniq('Ajudante'));
  voter1 = await login(app, uniq('Vera'));
  voter2 = await login(app, uniq('Vito'));
  const q = await api(app, 'POST', '/api/questions', {
    session: asker,
    body: { title: `Cadeado de latão ${tag}`, category: 'ferramentas', lat: C.lat, lng: C.lng, force: true },
  });
  qid = q.json.id;
  const p = await api(app, 'POST', '/api/places', {
    session: helper,
    body: { name: `Ferragens ${tag}`, lat: C.lat + 0.001, lng: C.lng },
  });
  pid = p.json.place.id;
  const up = await upload(app, helper, await testImage(401));
  const a = await api(app, 'POST', `/api/questions/${qid}/answers`, {
    session: helper,
    body: { placeId: pid, evidenceIds: [up.json.id] },
  });
  aid = a.json.answerId;
  // XP alto na semana: o ranking (50 primeiros) acumula contas de todos os testes.
  for (const s of [asker, helper]) await award(ctx.sql, s.user.id, 'ajuste', 5000, 0);
  for (const v of [voter1, voter2])
    await api(app, 'POST', `/api/answers/${aid}/confirm`, { session: v, body: { vote: 1 } });
});

const routes: Array<{ route: string; url: () => string; groups: () => string[] }> = [
  { route: '/map/finds', url: () => `/api/map/finds?bbox=${BBOX}`, groups: () => ['achados'] },
  { route: '/map/open', url: () => `/api/map/open?bbox=${BBOX}`, groups: () => ['missoes'] },
  { route: '/search', url: () => `/api/search?q=${encodeURIComponent(`cadeado ${tag}`)}`, groups: () => ['missoes'] },
  { route: '/questions', url: () => '/api/questions?status=todas', groups: () => ['missoes'] },
  { route: '/questions/:id', url: () => `/api/questions/${qid}`, groups: () => [`missao:${qid}`] },
  { route: '/places', url: () => `/api/places?q=${encodeURIComponent(tag)}`, groups: () => ['lugares'] },
  { route: '/places/:id', url: () => `/api/places/${pid}`, groups: () => [`lugar:${pid}`] },
  { route: '/ranking', url: () => '/api/ranking?period=semana', groups: () => ['ranking'] },
];

describe('leituras públicas no cache', () => {
  for (const r of routes) {
    it(`${r.route} responde MISS e depois HIT com o mesmo JSON`, async () => {
      await cache.bump(r.groups());
      const miss = await get(r.url());
      expect(miss.xcache).toBe('MISS');
      const hit = await get(r.url());
      expect(hit.xcache).toBe('HIT');
      expect(hit.json).toEqual(miss.json);
    });
  }

  it('bbox que difere só a partir da 4ª casa decimal compartilha a entrada', async () => {
    await cache.bump(['achados']);
    // Longe das fronteiras de arredondamento: os dois caem nos mesmos 3 decimais.
    const a = await get('/api/map/finds?bbox=-63.0912,-9.9572,-63.0412,-9.8572');
    const b = await get('/api/map/finds?bbox=-63.0914,-9.9574,-63.0414,-9.8574');
    expect([a.xcache, b.xcache]).toEqual(['MISS', 'HIT']);
  });

  it('/places e /questions com a posição do usuário não usam cache', async () => {
    // A posição é quase única por pessoa: cachear daria pouco reaproveitamento e a distância precisa ser exata.
    for (const url of [
      `/api/places?lat=${C.lat}&lng=${C.lng}`,
      `/api/questions?lat=${C.lat}&lng=${C.lng}`,
      `/api/questions?lat=${C.lat + 0.00011}&lng=${C.lng}`,
    ]) {
      expect((await get(url)).xcache).toBe('BYPASS');
      expect((await get(url)).xcache).toBe('BYPASS');
    }
  });

  it('q com 500 caracteres usa a mesma entrada dos 80 primeiros', async () => {
    const curto = `cadeado ${tag} `.padEnd(80, 'x').slice(0, 80);
    const longo = curto + 'y'.repeat(420);
    for (const [path, groups] of [
      ['/api/search?q=', ['missoes', 'achados']],
      ['/api/places?q=', ['lugares', 'achados']],
      [`/api/map/finds?bbox=${BBOX}&q=`, ['achados']],
    ] as const) {
      await cache.bump([...groups]);
      expect((await get(path + encodeURIComponent(curto))).xcache).toBe('MISS');
      expect((await get(path + encodeURIComponent(longo))).xcache).toBe('HIT');
    }
  });

  it('/questions com categoria desconhecida ou offset acima de 200 não usa cache', async () => {
    for (const url of ['/api/questions?category=nao-existe', '/api/questions?offset=220']) {
      expect((await get(url)).xcache).toBe('BYPASS');
      expect((await get(url)).xcache).toBe('BYPASS');
    }
    expect((await get('/api/questions?category=ferramentas&offset=200')).xcache).not.toBe('BYPASS');
  });

  it('/questions com mine=1 ou sort=perto não usa cache', async () => {
    for (const url of ['/api/questions?mine=1', `/api/questions?sort=perto&lat=${C.lat}&lng=${C.lng}`]) {
      expect((await get(url, asker)).xcache).toBe('BYPASS');
      expect((await get(url, asker)).xcache).toBe('BYPASS');
    }
    const mine = await get('/api/questions?mine=1', asker);
    expect(mine.json.items.map((i: any) => i.id)).toContain(qid);
  });

  it('/questions/:id em HIT traz os campos pessoais de quem pede', async () => {
    const other = await login(app, uniq('Carla'));
    expect((await api(app, 'POST', `/api/questions/${qid}/follow`, { session: helper })).json.following).toBe(true);
    const url = `/api/questions/${qid}`;
    await get(url, asker);
    const a = await get(url, asker);
    expect(a.xcache).toBe('HIT');
    expect(a.json.canAccept).toBe(true);
    expect(a.json.question.iFollow).toBe(true);
    expect(a.json.answers[0].myVote).toBeNull();
    const b = await get(url, helper);
    expect(b.xcache).toBe('HIT');
    expect(b.json.question.iFollow).toBe(true);
    expect(b.json.canAccept).toBe(false);
    const c = await get(url, other);
    expect(c.xcache).toBe('HIT');
    expect(c.json.question.iFollow).toBe(false);
    expect(c.json.canAccept).toBe(false);
    const v = await get(url, voter1);
    expect(v.xcache).toBe('HIT');
    expect(v.json.answers[0].myVote).toBe(1);
    const anon = await get(url);
    expect(anon.xcache).toBe('HIT');
    expect(anon.json.question.iFollow).toBe(false);
    expect(anon.json.answers[0].myVote).toBeNull();
    // O que fica no cache é só a parte pública: nenhuma das colunas internas da missão vaza.
    expect(Object.keys(anon.json.question)).not.toContain('tsv');
    expect(Object.keys(anon.json.question)).not.toContain('geog');
  });

  it('/ranking em HIT calcula "me" para quem pede', async () => {
    const url = '/api/ranking?period=semana';
    await get(url, asker);
    const a = await get(url, asker);
    expect(a.xcache).toBe('HIT');
    expect(a.json.me.id).toBe(asker.user.id);
    const h = await get(url, helper);
    expect(h.xcache).toBe('HIT');
    expect(h.json.me.id).toBe(helper.user.id);
    expect(h.json.items).toEqual(a.json.items);
    const anon = await get(url);
    expect(anon.xcache).toBe('HIT');
    expect(anon.json.me).toBeNull();
  });

  it('a semana do ranking é a semana ISO no fuso de Porto Velho', () => {
    expect(rankingWeek(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    expect(rankingWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    // Segunda 00:30 em UTC ainda é domingo 20:30 em Porto Velho (UTC−4): mesma semana do domingo.
    expect(rankingWeek(new Date('2026-10-19T00:30:00Z'))).toBe('2026-W42');
    expect(rankingWeek(new Date('2026-10-19T04:30:00Z'))).toBe('2026-W43');
  });

  it('missão inexistente continua 404', async () => {
    const res = await app.request('/api/questions/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    const place = await app.request('/api/places/00000000-0000-4000-8000-000000000000');
    expect(place.status).toBe(404);
  });
});
