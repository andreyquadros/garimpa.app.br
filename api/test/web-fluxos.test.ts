import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeApp, login, api, upload, testImage, uniq } from './helpers.js';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';

let app: App; let sql: Sql; let close: () => Promise<void>;
beforeAll(async () => { ({ app, sql, close } = await makeApp()); });
afterAll(async () => { await close(); });

const C = { lat: -9.9075, lng: -63.0415 };

describe('POST /questions/:id/follow com { on: true } é idempotente', () => {
  it('quem já segue recebe already=true e nada muda (seguidores, bônus, XP); autor não recebe 400', async () => {
    const marina = await login(app, uniq('Marina'));
    const bruno = await login(app, uniq('Bruno'));
    const q = await api(app, 'POST', '/api/questions', { session: marina, body: { title: `Panela de pressão elétrica ${uniq('t')}`, category: 'casa' } });
    expect(q.status).toBe(201);
    const qid = q.json.id as string;

    // Primeiro "também quero": liga de verdade
    const first = await api(app, 'POST', `/api/questions/${qid}/follow`, { session: bruno, body: { on: true } });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ following: true });
    expect(first.json.already).toBeUndefined();
    const snap = async () => (await sql<{ followersCount: number; bounty: number }[]>`select followers_count, bounty from questions where id = ${qid}::uuid`)[0]!;
    const ledger = async () => (await sql<{ n: number }[]>`select count(*)::int as n from ledger where user_id = ${bruno.user.id}::uuid and kind = 'tambem_quero'`)[0]!.n;
    const before = await snap();
    const xpBefore = await ledger();
    expect(before.followersCount).toBe(2);

    // Segundo toque com on=true: não desfaz, não soma de novo
    const again = await api(app, 'POST', `/api/questions/${qid}/follow`, { session: bruno, body: { on: true } });
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ following: true, bounty: before.bounty, already: true });
    expect(await snap()).toEqual(before);
    expect(await ledger()).toBe(xpBefore);

    // Autor: antes era 400 "Quem perguntou acompanha sempre."; com on=true é só "já acompanha"
    const author = await api(app, 'POST', `/api/questions/${qid}/follow`, { session: marina, body: { on: true } });
    expect(author.status).toBe(200);
    expect(author.json.already).toBe(true);
    const authorToggle = await api(app, 'POST', `/api/questions/${qid}/follow`, { session: marina });
    expect(authorToggle.status).toBe(400);

    // Sem corpo continua alternando (botão de seguidores na página da pergunta)
    const off = await api(app, 'POST', `/api/questions/${qid}/follow`, { session: bruno });
    expect(off.status).toBe(200);
    expect(off.json.following).toBe(false);
    expect((await snap()).followersCount).toBe(1);
  });
});

describe('GET /questions?mine=1 sem sessão', () => {
  it('devolve lista vazia em vez do feed inteiro', async () => {
    const ana = await login(app, uniq('Ana'));
    const q = await api(app, 'POST', '/api/questions', { session: ana, body: { title: `Fita isolante colorida ${uniq('t')}`, category: 'ferramentas' } });
    expect(q.status).toBe(201);
    const anon = await api(app, 'GET', '/api/questions?status=todas&mine=1');
    expect(anon.status).toBe(200);
    expect(anon.json.items).toEqual([]);
    const mine = await api(app, 'GET', '/api/questions?status=todas&mine=1', { session: ana });
    expect(mine.json.items.map((i: any) => i.id)).toContain(q.json.id);
  });
});

describe('GET /questions/:id', () => {
  it('devolve seenOn como YYYY-MM-DD (mesmo formato aceito na escrita)', async () => {
    const marina = await login(app, uniq('Marina'));
    const joao = await login(app, uniq('Joao'));
    const tag = uniq('t');
    const q = await api(app, 'POST', '/api/questions', { session: marina, body: { title: `Garrafa térmica inox ${tag}`, category: 'casa', lat: C.lat, lng: C.lng } });
    expect(q.status).toBe(201);
    const place = await api(app, 'POST', '/api/places', { session: joao, body: { name: `Loja ${tag}`, lat: C.lat + 0.001, lng: C.lng - 0.001, kind: 'loja' } });
    const up = await upload(app, joao, await testImage(41), { lat: String(C.lat + 0.001), lng: String(C.lng - 0.001) });
    expect(up.status).toBe(201);
    const a = await api(app, 'POST', `/api/questions/${q.json.id}/answers`, { session: joao, body: { placeId: place.json.place.id, seenOn: '2026-09-28', priceCents: 2490, evidenceIds: [up.json.id] } });
    expect(a.status, JSON.stringify(a.json)).toBe(201);
    const detail = await api(app, 'GET', `/api/questions/${q.json.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json.answers[0].seenOn).toBe('2026-09-28');
  });
});
