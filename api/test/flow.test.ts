import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeApp, login, api, upload, testImage, uniq, type Session } from './helpers.js';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';

let app: App; let sql: Sql; let close: () => Promise<void>;
beforeAll(async () => { ({ app, sql, close } = await makeApp()); });
afterAll(async () => { await close(); });

const C = { lat: -9.9075, lng: -63.0415 };

async function newPlace(s: Session, name: string, dlat = 0, dlng = 0) {
  const r = await api(app, 'POST', '/api/places', { session: s, body: { name, lat: C.lat + dlat, lng: C.lng + dlng, kind: 'loja' } });
  expect([200, 201]).toContain(r.status);
  return r.json.place.id as string;
}

describe('fluxo completo: perguntar, achar, confirmar, aceitar, gorjeta', () => {
  it('funciona de ponta a ponta com antiplágio e carência', async () => {
    const marina = await login(app, uniq('Marina'));
    const joao = await login(app, uniq('Joao'));
    const tais = await login(app, uniq('Tais'));
    const lucas = await login(app, uniq('Lucas'));
    const tag = uniq('x');

    // 1. Marina pergunta
    const q = await api(app, 'POST', '/api/questions', { session: marina, body: { title: `Garrafa de vidro com tampa hermética ${tag}`, category: 'casa', lat: C.lat, lng: C.lng } });
    expect(q.status).toBe(201);
    const qid = q.json.id as string;

    // 2. Dedupe: pergunta parecida é barrada sem force e aparece na busca
    const dup = await api(app, 'POST', '/api/questions', { session: joao, body: { title: `garrafa hermetica de vidro ${tag}` } });
    expect(dup.status).toBe(409);
    expect(dup.json.similar.map((s: any) => s.id)).toContain(qid);
    const search = await api(app, 'GET', `/api/search?q=${encodeURIComponent('garrafa hermética')}`);
    expect(search.status).toBe(200);
    expect(search.json.similar.map((s: any) => s.id)).toContain(qid);

    // 3. João responde com prova; Marina não pode responder a própria pergunta
    const placeA = await newPlace(joao, `Casa & Cozinha ${tag}`, 0.002, -0.003);
    const up1 = await upload(app, joao, await testImage(11), { lat: String(C.lat + 0.002), lng: String(C.lng - 0.003) });
    expect(up1.status).toBe(201);
    const own = await api(app, 'POST', `/api/questions/${qid}/answers`, { session: marina, body: { placeId: placeA, evidenceIds: [up1.json.id] } });
    expect(own.status).toBe(400);
    const a1 = await api(app, 'POST', `/api/questions/${qid}/answers`, { session: joao, body: { placeId: placeA, note: 'Prateleira do fundo, perto das panelas, vidro com tampa de clipe.', priceCents: 2490, evidenceIds: [up1.json.id] } });
    expect(a1.status).toBe(201);
    expect(a1.json.isFirst).toBe(true);

    // 4. Antiplágio: a mesma foto por outra pessoa é recusada; mesma loja depois vira segundo achado
    const same = await upload(app, tais, await testImage(11));
    expect(same.status).toBe(409);
    expect(same.json.error).toBe('foto_repetida');
    const up2 = await upload(app, tais, await testImage(12));
    const copied = await api(app, 'POST', `/api/questions/${qid}/answers`, { session: tais, body: { placeId: placeA, note: 'Prateleira do fundo, perto das panelas, vidro com tampa de clipe.', evidenceIds: [up2.json.id] } });
    expect(copied.status).toBe(409); // texto copiado no mesmo lugar
    const a2 = await api(app, 'POST', `/api/questions/${qid}/answers`, { session: tais, body: { placeId: placeA, note: 'Também vi lá hoje, corredor dos potes.', evidenceIds: [up2.json.id] } });
    expect(a2.status).toBe(201);
    expect(a2.json.isFirst).toBe(false);

    // 5. Confirmações: duas confirmações validam a resposta e cunham pepitas em carência
    const c1 = await api(app, 'POST', `/api/answers/${a1.json.answerId}/confirm`, { session: tais, body: { vote: 1 } });
    expect(c1.status).toBe(200);
    const selfVote = await api(app, 'POST', `/api/answers/${a1.json.answerId}/confirm`, { session: joao, body: { vote: 1 } });
    expect(selfVote.status).toBe(400);
    const c2 = await api(app, 'POST', `/api/answers/${a1.json.answerId}/confirm`, { session: lucas, body: { vote: 1 } });
    expect(c2.json.status).toBe('confirmada');

    // 6. Marina aceita a resposta do João: pepitas + bounty + primeiro achado, em carência
    const before = (await sql`select credits, credits_pending from users where id = ${joao.user.id}::uuid`)[0]!;
    const acc = await api(app, 'POST', `/api/questions/${qid}/accept`, { session: marina, body: { answerId: a1.json.answerId } });
    expect(acc.status).toBe(200);
    expect(acc.json.collusion).toBeNull();
    const after = (await sql`select credits, credits_pending from users where id = ${joao.user.id}::uuid`)[0]!;
    expect(after.creditsPending - before.creditsPending).toBe(50 + 10); // aceita + primeiro achado
    expect(after.credits).toBe(0);
    const detail = await api(app, 'GET', `/api/questions/${qid}`, { session: marina });
    expect(detail.json.question.status).toBe('resolvida');
    expect(detail.json.answers[0].status).toBe('aceita');
    expect(detail.json.answers[0].evidences).toHaveLength(1);

    // 7. Gorjeta do orçamento da pergunta (20 pepitas por pergunta) e limite
    const tip = await api(app, 'POST', `/api/answers/${a1.json.answerId}/tip`, { session: marina, body: { amount: 15, source: 'orcamento' } });
    expect(tip.status).toBe(201);
    expect(tip.json.budgetLeft).toBe(5);
    const tooMuch = await api(app, 'POST', `/api/answers/${a1.json.answerId}/tip`, { session: marina, body: { amount: 10, source: 'orcamento' } });
    expect(tooMuch.status).toBe(400);
    const notAuthor = await api(app, 'POST', `/api/answers/${a1.json.answerId}/tip`, { session: lucas, body: { amount: 5, source: 'orcamento' } });
    expect(notAuthor.status).toBe(403);

    // 8. Mapa e ranking refletem o achado
    const finds = await api(app, 'GET', `/api/map/finds?bbox=${C.lng - 0.1},${C.lat - 0.1},${C.lng + 0.1},${C.lat + 0.1}&q=${encodeURIComponent('garrafa')}`);
    expect(finds.json.items.map((p: any) => p.placeId)).toContain(placeA);
    const me = await api(app, 'GET', '/api/me', { session: joao });
    expect(me.json.user.creditsPending).toBeGreaterThanOrEqual(75);
    expect(me.json.badges.map((b: any) => b.slug)).toContain('primeiro_achado');
    const rank = await api(app, 'GET', '/api/ranking?period=semana', { session: joao });
    expect(rank.json.items.some((r: any) => r.id === joao.user.id)).toBe(true);
  });

  it('conluio: mesmo dispositivo entre quem pergunta e quem responde não cunha pepitas', async () => {
    const device = uniq('aparelho');
    const a = await login(app, uniq('Ana'), device);
    const b = await login(app, uniq('Bia'), device);
    const tag = uniq('y');
    const q = await api(app, 'POST', '/api/questions', { session: a, body: { title: `Fita isolante líquida ${tag}` } });
    const place = await newPlace(b, `Ferragens ${tag}`, -0.004, 0.001);
    const up = await upload(app, b, await testImage(21));
    const ans = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: b, body: { placeId: place, evidenceIds: [up.json.id] } });
    const acc = await api(app, 'POST', `/api/questions/${q.json.id}/accept`, { session: a, body: { answerId: ans.json.answerId } });
    expect(acc.json.collusion).toBe('forte');
    expect(acc.json.credits).toBe(0);
    const tip = await api(app, 'POST', `/api/answers/${ans.json.answerId}/tip`, { session: a, body: { amount: 5, source: 'orcamento' } });
    expect(tip.json.minted).toBe(false);
  });

  it('denúncias de contas confiáveis escondem a resposta e estornam o que rendeu', async () => {
    const asker = await login(app, uniq('Pedro'));
    const cheater = await login(app, uniq('Caio'));
    const tag = uniq('z');
    const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Lâmpada LED E27 ${tag}` } });
    const place = await newPlace(cheater, `Elétrica ${tag}`, 0.006, 0.004);
    const up = await upload(app, cheater, await testImage(31));
    const ans = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: cheater, body: { placeId: place, evidenceIds: [up.json.id] } });
    await api(app, 'POST', `/api/questions/${q.json.id}/accept`, { session: asker, body: { answerId: ans.json.answerId } });
    const pendingBefore = (await sql`select credits_pending from users where id = ${cheater.user.id}::uuid`)[0]!.creditsPending;
    expect(pendingBefore).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      const r = await login(app, uniq('Fiscal'));
      await sql`update users set trust = 0.9 where id = ${r.user.id}::uuid`;
      const f = await api(app, 'POST', '/api/flags', { session: r, body: { targetType: 'resposta', targetId: ans.json.answerId, reason: 'foto_falsa' } });
      expect(f.status).toBe(201);
    }
    const st = (await sql`select status from answers where id = ${ans.json.answerId}::uuid`)[0]!.status;
    expect(st).toBe('oculta');
    const pendingAfter = (await sql`select credits_pending from users where id = ${cheater.user.id}::uuid`)[0]!.creditsPending;
    expect(pendingAfter).toBe(0);
  });

  it('lugares: reaproveita o mesmo nome a menos de 150 m e recusa fora da cidade', async () => {
    const s = await login(app, uniq('Geo'));
    const tag = uniq('p');
    const first = await api(app, 'POST', '/api/places', { session: s, body: { name: `Mercado ${tag}`, lat: C.lat + 0.001, lng: C.lng } });
    const again = await api(app, 'POST', '/api/places', { session: s, body: { name: `mercado ${tag}`, lat: C.lat + 0.0012, lng: C.lng + 0.0002 } });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.json.place.id).toBe(first.json.place.id);
    const far = await api(app, 'POST', '/api/places', { session: s, body: { name: 'Loja em Porto Velho', lat: -8.76, lng: -63.9 } });
    expect(far.status).toBe(400);
  });
});
