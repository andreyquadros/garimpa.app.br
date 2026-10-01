import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeApp, login, api, upload, testImage, uniq } from './helpers.js';
import { loadConfig } from '../src/config.js';
import { upsertGoogleUser } from '../src/routes/auth.js';
import type { App } from '../src/app.js';
import type { Sql } from '../src/db.js';
import type { Config } from '../src/config.js';

let app: App; let sql: Sql; let config: Config; let close: () => Promise<void>;
beforeAll(async () => { ({ app, sql, config, close } = await makeApp()); });
afterAll(async () => { await close(); });

describe('configuração', () => {
  it('produção recusa o SESSION_SECRET padrão; desenvolvimento usa o padrão', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', PUBLIC_URL: 'https://garimpa.app.br' })).toThrow(/SESSION_SECRET/);
    expect(loadConfig({ NODE_ENV: 'development' }).SESSION_SECRET).toMatch(/^garimpa-dev-secret/);
    expect(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) }).production).toBe(true);
  });
});

describe('login com Google', () => {
  it('não reatribui um e-mail já vinculado a outro sub (tomada de conta)', async () => {
    const email = `${uniq('vitima')}@exemplo.com`;
    const sub1 = uniq('S1');
    const id1 = await upsertGoogleUser(sql, { sub: sub1, email, name: 'Vítima', picture: null }, 'ariquemes');
    await expect(upsertGoogleUser(sql, { sub: uniq('S2'), email, name: 'Atacante', picture: null }, 'ariquemes')).rejects.toMatchObject({ status: 409 });
    const row = (await sql<{ googleSub: string; name: string }[]>`select google_sub, name from users where id = ${id1}::uuid`)[0]!;
    expect(row).toEqual({ googleSub: sub1, name: 'Vítima' });
    expect(await upsertGoogleUser(sql, { sub: sub1, email, name: 'Vítima', picture: null }, 'ariquemes')).toBe(id1);
  });
});

describe('escritas exigem o cabeçalho do app (anti-CSRF)', () => {
  it('formulário text/plain sem x-garimpa-device não faz login; com o cabeçalho mas text/plain é 415; leituras seguem livres', async () => {
    const r1 = await app.request('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"name":"atacante-z","x":"=\\"}' });
    expect(r1.status).toBe(403);
    expect(r1.headers.get('set-cookie')).toBeNull();
    const r2 = await app.request('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'text/plain', 'x-garimpa-device': 'd' }, body: '{"name":"atacante-z"}' });
    expect(r2.status).toBe(415);
    const r3 = await app.request('/api/config');
    expect(r3.status).toBe(200);
    const r4 = await app.request('/api/auth/logout', { method: 'POST', headers: { 'x-garimpa-device': 'd' } }); // sem corpo nem content-type
    expect(r4.status).toBe(200);
  });
});

describe('upload', () => {
  it('corpo acima do limite e imagem ilegível são recusados sem gastar a cota do dia', async () => {
    const s = await login(app, uniq('Up'));
    const used = async () => (await sql<{ n: number }[]>`select coalesce(sum(count), 0)::int as n from daily_caps where user_id = ${s.user.id}::uuid and kind = 'uploads'`)[0]!.n;
    const big = new FormData();
    big.set('file', new Blob([new Uint8Array(config.MAX_UPLOAD_MB * 1024 * 1024 + 80 * 1024)], { type: 'image/png' }), 'grande.png');
    const r1 = await api(app, 'POST', '/api/uploads', { session: s, form: big });
    expect(r1.status).toBe(413);
    expect(await used()).toBe(0);
    const text = new FormData();
    text.set('file', new Blob([new TextEncoder().encode('isto nao e uma imagem')], { type: 'text/plain' }), 'x.txt');
    const r2 = await api(app, 'POST', '/api/uploads', { session: s, form: text });
    expect(r2.status).toBe(415);
    expect(await used()).toBe(0);
    const ok = await upload(app, s, await testImage(71));
    expect(ok.status).toBe(201);
    expect(await used()).toBe(1);
  });
});

describe('posição de quem pergunta', () => {
  it('é guardada e devolvida só como região aproximada (3 casas)', async () => {
    const s = await login(app, uniq('Geo'));
    const lat = -9.912345678; const lng = -63.043210987;
    const q = await api(app, 'POST', '/api/questions', { session: s, body: { title: `Berço desmontável ${uniq('z')}`, category: 'bebe', lat, lng } });
    expect(q.status).toBe(201);
    const d = await api(app, 'GET', `/api/questions/${q.json.id}`);
    const decimals = (v: number) => (String(v).split('.')[1] ?? '').length;
    expect(decimals(d.json.question.lat)).toBeLessThanOrEqual(3);
    expect(decimals(d.json.question.lng)).toBeLessThanOrEqual(3);
    expect(Math.abs(d.json.question.lat - lat)).toBeLessThan(0.0035);
    expect(Math.abs(d.json.question.lng - lng)).toBeLessThan(0.0035);
    expect(d.json.question.lat).not.toBe(lat);
  });
});
