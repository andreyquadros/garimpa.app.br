import { afterAll, describe, expect, it } from 'vitest';
import { type Cache, createCache } from '../src/cache.js';
import { api, login, makeApp, type Session, TEST_REDIS, testImage, uniq, upload } from './helpers.js';

// Espião sobre um cache real: registra cada `bump` para conferir que cada escrita invalida exatamente os seus grupos
// (tabela "O que cada escrita invalida" da spec do cache).
const real = createCache(TEST_REDIS);
const bumps: string[][] = [];
const spy: Cache = {
  ...real,
  async bump(groups) {
    bumps.push([...groups].sort());
    await real.bump(groups);
  },
};
const ctx = await makeApp({ cache: spy });
const { app, sql } = ctx;
afterAll(() => ctx.close());

const C = { lat: -9.9075, lng: -63.0415 };
let seed = 300;

/** Roda a requisição e devolve a resposta e os grupos invalidados por ela. */
async function track<T>(fn: () => Promise<T>): Promise<{ res: T; bumped: string[][] }> {
  bumps.length = 0;
  const res = await fn();
  return { res, bumped: [...bumps] };
}
const groups = (...g: string[]) => [[...g].sort()];
const finds = (qid: string, pid: string) => groups('missoes', `missao:${qid}`, 'achados', `lugar:${pid}`, 'ranking');

async function question(s: Session, title = uniq('Parafuso sextavado inox')) {
  const r = await api(app, 'POST', '/api/questions', { session: s, body: { title, category: 'casa', force: true } });
  expect(r.status).toBe(201);
  return r.json.id as string;
}

async function place(s: Session) {
  const r = await api(app, 'POST', '/api/places', {
    session: s,
    body: { name: uniq('Loja'), lat: C.lat + 0.001, lng: C.lng, kind: 'loja' },
  });
  expect(r.status).toBe(201);
  return r.json.place.id as string;
}

async function evidence(s: Session) {
  const up = await upload(app, s, await testImage(seed++));
  expect(up.status).toBe(201);
  return up.json.id as string;
}

/** Missão de A com uma resposta de B num lugar já existente. */
async function scenario() {
  const asker = await login(app, uniq('Autora'));
  const helper = await login(app, uniq('Ajudante'));
  const qid = await question(asker);
  const pid = await place(helper);
  const ans = await api(app, 'POST', `/api/questions/${qid}/answers`, {
    session: helper,
    body: { placeId: pid, evidenceIds: [await evidence(helper)] },
  });
  expect(ans.status).toBe(201);
  return { asker, helper, qid, pid, aid: ans.json.answerId as string };
}

async function flagThrice(aid: string) {
  const ids: string[] = [];
  const results: string[][][] = [];
  for (let i = 0; i < 3; i++) {
    const r = await login(app, uniq('Fiscal'));
    await sql`update users set trust = 0.9 where id = ${r.user.id}::uuid`;
    const { res, bumped } = await track(() =>
      api(app, 'POST', '/api/flags', { session: r, body: { targetType: 'resposta', targetId: aid, reason: 'spam' } }),
    );
    expect(res.status).toBe(201);
    results.push(bumped);
    const f = await sql<{ id: string }[]>`
      select id from flags where target_id = ${aid}::uuid and reporter_id = ${r.user.id}::uuid`;
    ids.push(f[0]!.id);
  }
  return { ids, results };
}

describe('escritas invalidam exatamente os seus grupos', () => {
  it('POST /questions invalida missoes, a missão e o ranking', async () => {
    const s = await login(app, uniq('Ana'));
    const { res, bumped } = await track(() =>
      api(app, 'POST', '/api/questions', {
        session: s,
        body: { title: uniq('Lâmpada de geladeira'), category: 'casa', force: true },
      }),
    );
    expect(res.status).toBe(201);
    expect(bumped).toEqual(groups('missoes', `missao:${res.json.id}`, 'ranking'));
  });

  it('POST /questions recusada por parecida não invalida nada', async () => {
    const s = await login(app, uniq('Ana'));
    const title = uniq('Mangueira de jardim trançada');
    await question(s, title);
    const { res, bumped } = await track(() =>
      api(app, 'POST', '/api/questions', { session: s, body: { title, category: 'casa' } }),
    );
    expect(res.status).toBe(409);
    expect(bumped).toEqual([]);
  });

  it('POST /questions/:id/follow invalida a missão e, quando paga XP, o ranking', async () => {
    const a = await login(app, uniq('Ana'));
    const b = await login(app, uniq('Beto'));
    const qid = await question(a);
    const follow = await track(() => api(app, 'POST', `/api/questions/${qid}/follow`, { session: b }));
    expect(follow.res.json.following).toBe(true);
    expect(follow.bumped).toEqual(groups('missoes', `missao:${qid}`, 'ranking'));
    const already = await track(() =>
      api(app, 'POST', `/api/questions/${qid}/follow`, { session: b, body: { on: true } }),
    );
    expect(already.res.json.already).toBe(true);
    expect(already.bumped).toEqual([]);
    const unfollow = await track(() => api(app, 'POST', `/api/questions/${qid}/follow`, { session: b }));
    expect(unfollow.res.json.following).toBe(false);
    expect(unfollow.bumped).toEqual(groups('missoes', `missao:${qid}`));
  });

  it('POST /questions/:id/close invalida missoes e a missão', async () => {
    const a = await login(app, uniq('Ana'));
    const qid = await question(a);
    const { res, bumped } = await track(() => api(app, 'POST', `/api/questions/${qid}/close`, { session: a }));
    expect(res.status).toBe(200);
    expect(bumped).toEqual(groups('missoes', `missao:${qid}`));
  });

  it('POST /questions/:id/answers invalida missoes, a missão, o lugar e o ranking', async () => {
    const a = await login(app, uniq('Ana'));
    const b = await login(app, uniq('Beto'));
    const qid = await question(a);
    const pid = await place(b);
    const ev = await evidence(b);
    const { res, bumped } = await track(() =>
      api(app, 'POST', `/api/questions/${qid}/answers`, { session: b, body: { placeId: pid, evidenceIds: [ev] } }),
    );
    expect(res.status).toBe(201);
    expect(bumped).toEqual(groups('missoes', `missao:${qid}`, `lugar:${pid}`, 'ranking'));
  });

  it('POST /questions/:id/answers que cria lugar invalida também lugares', async () => {
    const a = await login(app, uniq('Ana'));
    const b = await login(app, uniq('Beto'));
    const qid = await question(a);
    const ev = await evidence(b);
    const { res, bumped } = await track(() =>
      api(app, 'POST', `/api/questions/${qid}/answers`, {
        session: b,
        body: { newPlace: { name: uniq('Bazar'), lat: C.lat, lng: C.lng }, evidenceIds: [ev] },
      }),
    );
    expect(res.status).toBe(201);
    expect(bumped).toEqual(groups('missoes', `missao:${qid}`, `lugar:${res.json.placeId}`, 'lugares', 'ranking'));
  });

  it('POST /answers/:id/confirm invalida missoes, a missão, achados, o lugar e o ranking', async () => {
    const { qid, pid, aid } = await scenario();
    const v = await login(app, uniq('Vera'));
    const { res, bumped } = await track(() =>
      api(app, 'POST', `/api/answers/${aid}/confirm`, { session: v, body: { vote: 1 } }),
    );
    expect(res.status).toBe(200);
    expect(bumped).toEqual(finds(qid, pid));
  });

  it('POST /questions/:id/accept invalida missoes, a missão, achados, o lugar e o ranking', async () => {
    const { asker, qid, pid, aid } = await scenario();
    const intrusa = await login(app, uniq('Intrusa'));
    const denied = await track(() =>
      api(app, 'POST', `/api/questions/${qid}/accept`, { session: intrusa, body: { answerId: aid } }),
    );
    expect(denied.res.status).toBe(403);
    expect(denied.bumped).toEqual([]);
    const { res, bumped } = await track(() =>
      api(app, 'POST', `/api/questions/${qid}/accept`, { session: asker, body: { answerId: aid } }),
    );
    expect(res.status).toBe(200);
    expect(bumped).toEqual(finds(qid, pid));
  });

  it('POST /answers/:id/tip invalida missoes, a missão, achados, o lugar e o ranking', async () => {
    const { asker, qid, pid, aid } = await scenario();
    const { res, bumped } = await track(() =>
      api(app, 'POST', `/api/answers/${aid}/tip`, { session: asker, body: { amount: 5 } }),
    );
    expect(res.status).toBe(201);
    expect(bumped).toEqual(finds(qid, pid));
  });

  it('POST /flags só invalida quando esconde a resposta; a moderação, quando muda a resposta', async () => {
    const { qid, pid, aid } = await scenario();
    const { ids, results } = await flagThrice(aid);
    expect(results).toEqual([[], [], finds(qid, pid)]);
    const mod = await login(app, uniq('Mod'));
    await sql`update users set role = 'moderator' where id = ${mod.user.id}::uuid`;
    const judge = (id: string, status: string) =>
      track(() => api(app, 'POST', `/api/admin/flags/${id}`, { session: mod, body: { status } }));
    // Improcedente com a resposta escondida: ela volta.
    const imp = await judge(ids[0]!, 'improcede');
    expect(imp.res.status).toBe(200);
    expect(imp.bumped).toEqual(finds(qid, pid));
    const pro = await judge(ids[1]!, 'procede');
    expect(pro.res.status).toBe(200);
    expect(pro.bumped).toEqual(finds(qid, pid));
    // Improcedente com a resposta já rejeitada: nada muda na resposta.
    const noop = await judge(ids[2]!, 'improcede');
    expect(noop.res.status).toBe(200);
    expect(noop.bumped).toEqual([]);
  });

  it('POST /places invalida lugares e o ranking só quando cria o lugar', async () => {
    const s = await login(app, uniq('Geo'));
    const name = uniq('Armarinho');
    const created = await track(() =>
      api(app, 'POST', '/api/places', { session: s, body: { name, lat: C.lat, lng: C.lng + 0.001 } }),
    );
    expect(created.res.status).toBe(201);
    expect(created.bumped).toEqual(groups('lugares', 'ranking'));
    const reused = await track(() =>
      api(app, 'POST', '/api/places', { session: s, body: { name, lat: C.lat, lng: C.lng + 0.001 } }),
    );
    expect(reused.res.status).toBe(200);
    expect(reused.bumped).toEqual([]);
  });

  it('POST /uploads não invalida nada', async () => {
    const s = await login(app, uniq('Foto'));
    const { res, bumped } = await track(async () => upload(app, s, await testImage(seed++)));
    expect(res.status).toBe(201);
    expect(bumped).toEqual([]);
  });

  it('GET /me invalida o ranking só quando lança o bônus de sequência', async () => {
    const s = await login(app, uniq('Sequencia'));
    const first = await track(() => api(app, 'GET', '/api/me', { session: s }));
    expect(first.res.status).toBe(200);
    expect(first.bumped).toEqual([]);
    await sql`update users set last_active_on = (now() at time zone 'America/Porto_Velho')::date - 1, streak_days = 1
              where id = ${s.user.id}::uuid`;
    const bonus = await track(() => api(app, 'GET', '/api/me', { session: s }));
    expect(bonus.res.json.user.streakDays).toBe(2);
    expect(bonus.bumped).toEqual(groups('ranking'));
    const again = await track(() => api(app, 'GET', '/api/me', { session: s }));
    expect(again.bumped).toEqual([]);
  });
});
