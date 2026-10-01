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

/** Três contas confiáveis denunciam a resposta: é o gatilho de ocultação + estorno. Devolve os ids das denúncias. */
async function flagThrice(answerId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await login(app, uniq('Fiscal'));
    await sql`update users set trust = 0.9 where id = ${r.user.id}::uuid`;
    const f = await api(app, 'POST', '/api/flags', { session: r, body: { targetType: 'resposta', targetId: answerId, reason: 'foto_falsa' } });
    expect(f.status).toBe(201);
    ids.push((await sql<{ id: string }[]>`select id from flags where target_id = ${answerId}::uuid and reporter_id = ${r.user.id}::uuid`)[0]!.id);
  }
  return ids;
}

async function moderator() {
  const m = await login(app, uniq('Mod'));
  await sql`update users set role = 'moderator' where id = ${m.user.id}::uuid`;
  return m;
}

const today = () => sql`select (now() at time zone 'America/Porto_Velho')::date as d`.then((r) => r[0]!.d as string);

describe('bônus "também quero"', () => {
  it('seguir/deixar de seguir em loop não infla o bônus, XP vem uma vez por pergunta e o aceite paga só o bônus de quem acompanha', async () => {
    const alice = await login(app, uniq('Alice'));
    const beto = await login(app, uniq('Beto'));
    const carla = await login(app, uniq('Carla'));
    const tag = uniq('b');
    const q = await api(app, 'POST', '/api/questions', { session: alice, body: { title: `Furadeira de impacto 650W ${tag}`, category: 'ferramentas' } });
    expect(q.status).toBe(201);
    const qid = q.json.id as string;
    const snap = async () => (await sql<{ bounty: number; followersCount: number }[]>`select bounty, followers_count from questions where id = ${qid}::uuid`)[0]!;
    for (let i = 0; i < 12; i++) expect((await api(app, 'POST', `/api/questions/${qid}/follow`, { session: beto })).status).toBe(200);
    expect(await snap()).toEqual({ bounty: 0, followersCount: 1 });
    const on = await api(app, 'POST', `/api/questions/${qid}/follow`, { session: beto });
    expect(on.json).toMatchObject({ following: true, bounty: 5 });
    expect(await snap()).toEqual({ bounty: 5, followersCount: 2 });
    const xpRows = (await sql<{ n: number }[]>`select count(*)::int as n from ledger where user_id = ${beto.user.id}::uuid and kind = 'tambem_quero'`)[0]!.n;
    expect(xpRows).toBe(1);

    const place = await newPlace(carla, `Ferragens ${tag}`, 0.003, 0.002);
    const up = await upload(app, carla, await testImage(51));
    expect(up.status).toBe(201);
    const ans = await api(app, 'POST', `/api/questions/${qid}/answers`, { session: carla, body: { placeId: place, evidenceIds: [up.json.id] } });
    expect(ans.status).toBe(201);
    const acc = await api(app, 'POST', `/api/questions/${qid}/accept`, { session: alice, body: { answerId: ans.json.answerId } });
    expect(acc.status).toBe(200);
    expect(acc.json.credits).toBe(50 + 5);
    expect(acc.json.primeiroAchado).toBe(10);
    // Depois de resolvida, o bônus congela (já foi pago)
    const off = await api(app, 'POST', `/api/questions/${qid}/follow`, { session: beto });
    expect(off.json).toMatchObject({ following: false, bounty: 5 });
  });
});

describe('confirmação com conluio', () => {
  it('votantes no mesmo aparelho do autor confirmam a resposta, mas o autor não cunha pepitas', async () => {
    const device = uniq('cel');
    const asker = await login(app, uniq('Ask'));
    const author = await login(app, uniq('Aut'), device);
    const v1 = await login(app, uniq('V1'), device);
    const v2 = await login(app, uniq('V2'), device);
    const tag = uniq('c');
    const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Panela de pressão 7 litros ${tag}`, category: 'casa' } });
    const place = await newPlace(author, `Utilidades ${tag}`, -0.002, 0.003);
    const up = await upload(app, author, await testImage(52));
    const ans = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: author, body: { placeId: place, evidenceIds: [up.json.id] } });
    expect(ans.status).toBe(201);
    const xpBefore = (await sql<{ xp: number }[]>`select xp from users where id = ${author.user.id}::uuid`)[0]!.xp;
    await api(app, 'POST', `/api/answers/${ans.json.answerId}/confirm`, { session: v1, body: { vote: 1 } });
    const c2 = await api(app, 'POST', `/api/answers/${ans.json.answerId}/confirm`, { session: v2, body: { vote: 1 } });
    expect(c2.json.status).toBe('confirmada');
    expect(c2.json.collusion).toBe('forte');
    // meta::text: o transform camelCase do cliente reescreveria as chaves do JSON
    const row = (await sql<{ credits: number; meta: string }[]>`select credits, meta::text as meta from ledger where user_id = ${author.user.id}::uuid and kind = 'resposta_confirmada'`)[0]!;
    expect(row.credits).toBe(0);
    expect(JSON.parse(row.meta)).toMatchObject({ conluio: 'mesmo_dispositivo' });
    const u = (await sql<{ xp: number; creditsPending: number }[]>`select xp, credits_pending from users where id = ${author.user.id}::uuid`)[0]!;
    expect(u.creditsPending).toBe(0);
    expect(u.xp).toBe(xpBefore + 20); // XP continua
  });
});

describe('denúncia improcedente devolve status, pepitas e pergunta', () => {
  it('3 denúncias reabrem a pergunta; "improcede" devolve "aceita", a carência e "resolvida"; um "procede" depois estorna de novo', async () => {
    const asker = await login(app, uniq('Pergunta'));
    const honest = await login(app, uniq('Honesto'));
    const tag = uniq('d');
    const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Cadeira de escritório ergonômica ${tag}`, category: 'casa' } });
    const qid = q.json.id as string;
    const place = await newPlace(honest, `Móveis ${tag}`, 0.004, -0.002);
    const up = await upload(app, honest, await testImage(53));
    const ans = await api(app, 'POST', `/api/questions/${qid}/answers`, { session: honest, body: { placeId: place, evidenceIds: [up.json.id] } });
    const aid = ans.json.answerId as string;
    const acc = await api(app, 'POST', `/api/questions/${qid}/accept`, { session: asker, body: { answerId: aid } });
    expect(acc.status).toBe(200);
    const user = async () => (await sql<{ xp: number; credits: number; creditsPending: number }[]>`select xp, credits, credits_pending from users where id = ${honest.user.id}::uuid`)[0]!;
    const afterAccept = await user();
    expect(afterAccept.creditsPending).toBe(60);

    const flags = await flagThrice(aid);
    expect((await sql`select status from answers where id = ${aid}::uuid`)[0]!.status).toBe('oculta');
    const hidden = await user();
    expect(hidden.creditsPending).toBe(0);
    expect(hidden.xp).toBeLessThan(afterAccept.xp);
    // A pergunta não fica presa em "resolvida" apontando para uma resposta invisível
    const reopened = await api(app, 'GET', `/api/questions/${qid}`, { session: asker });
    expect(reopened.json.question.status).toBe('respondida');
    expect(reopened.json.answers).toEqual([]);
    expect(reopened.json.canAccept).toBe(true);
    // O ranking não conta XP estornado
    const rank = await api(app, 'GET', '/api/ranking?period=semana', { session: honest });
    expect(rank.json.me.pontos).toBe(hidden.xp);

    const mod = await moderator();
    const imp = await api(app, 'POST', `/api/admin/flags/${flags[0]}`, { session: mod, body: { status: 'improcede' } });
    expect(imp.status).toBe(200);
    expect((await sql`select status from answers where id = ${aid}::uuid`)[0]!.status).toBe('aceita');
    expect((await sql`select status, accepted_answer_id from questions where id = ${qid}::uuid`)[0]).toMatchObject({ status: 'resolvida', acceptedAnswerId: aid });
    const restored = await user();
    expect(restored).toEqual(afterAccept); // pepitas de volta em carência, não liberadas
    const devol = await sql<{ state: string; credits: number }[]>`select state, credits from ledger where user_id = ${honest.user.id}::uuid and kind = 'devolucao' and credits > 0`;
    expect(devol.map((d) => d.state)).toEqual(['carencia', 'carencia']);
    const detail = await api(app, 'GET', `/api/questions/${qid}`, { session: asker });
    expect(detail.json.answers[0].status).toBe('aceita');
    expect(detail.json.canAccept).toBe(false);

    // Outra denúncia julgada procedente: a devolução é estornada de novo e a pergunta reabre
    const pro = await api(app, 'POST', `/api/admin/flags/${flags[1]}`, { session: mod, body: { status: 'procede' } });
    expect(pro.status).toBe(200);
    expect((await sql`select status, is_first_for_place from answers where id = ${aid}::uuid`)[0]).toMatchObject({ status: 'rejeitada', isFirstForPlace: false });
    expect((await user()).creditsPending).toBe(0);
    expect((await sql`select status from questions where id = ${qid}::uuid`)[0]!.status).toBe('respondida');
    // "improcede" na terceira não ressuscita uma resposta rejeitada
    await api(app, 'POST', `/api/admin/flags/${flags[2]}`, { session: mod, body: { status: 'improcede' } });
    expect((await sql`select status from answers where id = ${aid}::uuid`)[0]!.status).toBe('rejeitada');
    expect((await user()).creditsPending).toBe(0);
  });

  it('quem votou contra a resposta escondida mantém o XP de confirmar', async () => {
    const asker = await login(app, uniq('Pq'));
    const author = await login(app, uniq('Au'));
    const denier = await login(app, uniq('Neg'));
    const tag = uniq('n');
    const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Mangueira de jardim 30 m ${tag}`, category: 'casa' } });
    const place = await newPlace(author, `Agro ${tag}`, -0.003, -0.004);
    const up = await upload(app, author, await testImage(54));
    const ans = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: author, body: { placeId: place, evidenceIds: [up.json.id] } });
    const before = (await sql<{ xp: number }[]>`select xp from users where id = ${denier.user.id}::uuid`)[0]!.xp;
    const v = await api(app, 'POST', `/api/answers/${ans.json.answerId}/confirm`, { session: denier, body: { vote: -1 } });
    expect(v.json.xp).toBe(3);
    await flagThrice(ans.json.answerId);
    const after = (await sql<{ xp: number }[]>`select xp from users where id = ${denier.user.id}::uuid`)[0]!.xp;
    expect(after).toBe(before + 3);
  });
});

describe('resposta removida', () => {
  it('não recebe gorjeta nem voto', async () => {
    const asker = await login(app, uniq('Pa'));
    const author = await login(app, uniq('Ra'));
    const other = await login(app, uniq('Ou'));
    const tag = uniq('r');
    const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Ventilador de teto com controle ${tag}`, category: 'casa' } });
    const place = await newPlace(author, `Elétrica ${tag}`, 0.005, 0.001);
    const up = await upload(app, author, await testImage(55));
    const ans = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: author, body: { placeId: place, evidenceIds: [up.json.id] } });
    await sql`update answers set status = 'rejeitada' where id = ${ans.json.answerId}::uuid`;
    const tip = await api(app, 'POST', `/api/answers/${ans.json.answerId}/tip`, { session: asker, body: { amount: 5, source: 'orcamento' } });
    expect(tip.status).toBe(400);
    const vote = await api(app, 'POST', `/api/answers/${ans.json.answerId}/confirm`, { session: other, body: { vote: 1 } });
    expect(vote.status).toBe(400);
    expect((await sql`select count(*)::int as n from tips where answer_id = ${ans.json.answerId}::uuid`)[0]!.n).toBe(0);
  });
});

describe('corrida no primeiro achado', () => {
  it('duas respostas simultâneas no mesmo lugar: 201 e 201, com um único primeiro achado', async () => {
    for (let round = 0; round < 3; round++) {
      const asker = await login(app, uniq('Co'));
      const b = await login(app, uniq('Cb'));
      const cc = await login(app, uniq('Cc'));
      const tag = uniq('k');
      const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Tinta spray preto fosco ${tag}`, category: 'ferramentas', force: true } });
      expect(q.status).toBe(201);
      const place = await newPlace(b, `Tintas ${tag}`, 0.001, 0.006);
      const [u1, u2] = await Promise.all([upload(app, b, await testImage(56 + round * 2)), upload(app, cc, await testImage(57 + round * 2))]);
      expect([u1.status, u2.status]).toEqual([201, 201]);
      const [r1, r2] = await Promise.all([
        api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: b, body: { placeId: place, evidenceIds: [u1.json.id] } }),
        api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: cc, body: { placeId: place, evidenceIds: [u2.json.id] } }),
      ]);
      expect([r1.status, r2.status], JSON.stringify([r1.json, r2.json])).toEqual([201, 201]);
      expect([r1.json.isFirst, r2.json.isFirst].filter(Boolean)).toHaveLength(1);
    }
  });
});

describe('teto diário de pepitas cunhadas', () => {
  it('com 300 já cunhadas no dia, o aceite paga XP mas nenhuma pepita (teto_diario)', async () => {
    const asker = await login(app, uniq('Pt'));
    const author = await login(app, uniq('At'));
    const tag = uniq('t');
    const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Botijão de gás 13 kg ${tag}`, category: 'casa' } });
    const place = await newPlace(author, `Gás ${tag}`, -0.006, 0.002);
    const up = await upload(app, author, await testImage(62));
    const ans = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: author, body: { placeId: place, evidenceIds: [up.json.id] } });
    await sql`insert into daily_caps(user_id, day, kind, count) values (${author.user.id}::uuid, ${await today()}::date, 'pepitas_cunhadas', 300)`;
    const xpBefore = (await sql<{ xp: number }[]>`select xp from users where id = ${author.user.id}::uuid`)[0]!.xp;
    const acc = await api(app, 'POST', `/api/questions/${q.json.id}/accept`, { session: asker, body: { answerId: ans.json.answerId } });
    expect(acc.status).toBe(200);
    expect(acc.json).toMatchObject({ credits: 0, primeiroAchado: 0, tetoDiario: true, motivo: 'teto_diario', collusion: null });
    const u = (await sql<{ xp: number; creditsPending: number }[]>`select xp, credits_pending from users where id = ${author.user.id}::uuid`)[0]!;
    expect(u.creditsPending).toBe(0);
    expect(u.xp).toBeGreaterThanOrEqual(xpBefore + 60);
    const row = (await sql<{ meta: string }[]>`select meta::text as meta from ledger where user_id = ${author.user.id}::uuid and kind = 'resposta_aceita'`)[0]!;
    expect(JSON.parse(row.meta)).toMatchObject({ teto_diario: true });
  });
});

describe('limite de lugares novos', () => {
  it('vale também quando o lugar nasce junto com a resposta', async () => {
    const asker = await login(app, uniq('Pl'));
    const author = await login(app, uniq('Al'));
    const tag = uniq('l');
    const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Capacete de bicicleta infantil ${tag}`, category: 'esporte' } });
    const up = await upload(app, author, await testImage(63));
    await sql`insert into daily_caps(user_id, day, kind, count) values (${author.user.id}::uuid, ${await today()}::date, 'lugares', 15)`;
    const ans = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: author, body: { newPlace: { name: `Bike ${tag}`, lat: C.lat + 0.002, lng: C.lng + 0.002, kind: 'loja' }, evidenceIds: [up.json.id] } });
    expect(ans.status).toBe(429);
    expect((await sql`select count(*)::int as n from places where name = ${`Bike ${tag}`}`)[0]!.n).toBe(0);
  });
});

describe('gorjeta do saldo', () => {
  it('exige nível 2 e no mínimo 5 pepitas; XP de gorjeta é ⌊valor/5⌋', async () => {
    const asker = await login(app, uniq('Pg'));
    const author = await login(app, uniq('Ag'));
    const giver = await login(app, uniq('Gg'));
    const tag = uniq('g');
    const q = await api(app, 'POST', '/api/questions', { session: asker, body: { title: `Caixa organizadora 56 L ${tag}`, category: 'casa' } });
    const place = await newPlace(author, `Plásticos ${tag}`, 0.002, -0.005);
    const up = await upload(app, author, await testImage(64));
    const ans = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: author, body: { placeId: place, evidenceIds: [up.json.id] } });
    await sql`select fn_award(${giver.user.id}::uuid, 'ajuste', 0, 30, null, null, '{}'::jsonb, 0)`; // saldo disponível
    const lvl1 = await api(app, 'POST', `/api/answers/${ans.json.answerId}/tip`, { session: giver, body: { amount: 5, source: 'saldo' } });
    expect(lvl1.status).toBe(403);
    await sql`update users set xp = 150 where id = ${giver.user.id}::uuid`; // nível 2 (Bateia)
    const tooSmall = await api(app, 'POST', `/api/answers/${ans.json.answerId}/tip`, { session: giver, body: { amount: 1, source: 'saldo' } });
    expect(tooSmall.status).toBe(400);
    const ok = await api(app, 'POST', `/api/answers/${ans.json.answerId}/tip`, { session: giver, body: { amount: 7, source: 'saldo' } });
    expect(ok.status).toBe(201);
    const row = (await sql<{ xp: number; credits: number }[]>`select xp, credits from ledger where user_id = ${author.user.id}::uuid and kind = 'gorjeta_recebida'`)[0]!;
    expect(row).toEqual({ xp: 1, credits: 7 });
    expect((await sql`select credits from users where id = ${giver.user.id}::uuid`)[0]!.credits).toBe(23);
  });
});
