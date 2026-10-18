import { HTTPException } from 'hono/http-exception';
import { afterAll, describe, expect, it } from 'vitest';
import { createCache } from '../src/cache.js';
import { bumpGroups } from '../src/cache-bump.js';
import { markDirty } from '../src/cache-http.js';
import { api, login, makeApp, uniq } from './helpers.js';

const ctx = await makeApp();
afterAll(() => ctx.close());

// O Hono congela as rotas na primeira requisição, então as rotas de teste são registradas antes de qualquer uma.
const gOk = uniq('gX');
const gFail = uniq('gY');
ctx.app.post('/api/teste-ok', (c) => {
  markDirty(c, gOk, gOk);
  return c.json({ ok: true }, 201);
});
ctx.app.post('/api/teste-400', (c) => {
  markDirty(c, gFail);
  return c.json({ error: 'x' }, 400);
});
ctx.app.post('/api/teste-throw', (c) => {
  markDirty(c, gFail);
  throw new Error('boom');
});

ctx.app.post('/api/teste-403', (c) => {
  markDirty(c, gFail);
  throw new HTTPException(403, { message: 'proibido' });
});

const xcache = async (url = '/api/config') => {
  const res = await ctx.app.request(url);
  expect(res.status).toBe(200);
  return res.headers.get('x-cache');
};

describe('cache no Hono', () => {
  it('GET /api/config responde MISS e depois HIT', async () => {
    await ctx.cache.bump(['config']);
    expect(await xcache()).toBe('MISS');
    expect(await xcache()).toBe('HIT');
  });

  it('escrita com sucesso incrementa os grupos marcados', async () => {
    const g = gOk;
    const load = () => ctx.cache.wrap('t', [g], {}, 60, async () => 1);
    expect((await load()).status).toBe('MISS');
    expect((await load()).status).toBe('HIT');
    expect((await api(ctx.app, 'POST', '/api/teste-ok')).status).toBe(201);
    expect((await load()).status).toBe('MISS');
  });

  it('escrita que falha não incrementa', async () => {
    const g = gFail;
    const load = () => ctx.cache.wrap('t', [g], {}, 60, async () => 1);
    await load();
    expect((await api(ctx.app, 'POST', '/api/teste-400')).status).toBe(400);
    expect((await api(ctx.app, 'POST', '/api/teste-throw')).status).toBe(500);
    expect((await api(ctx.app, 'POST', '/api/teste-403')).status).toBe(403);
    expect((await load()).status).toBe('HIT');
  });

  it('Redis fora: leituras respondem BYPASS e escritas funcionam', async () => {
    const down = await makeApp({ cache: createCache('redis://127.0.0.1:1', { log: () => {} }) });
    try {
      const res = await down.app.request('/api/config');
      expect(res.status).toBe(200);
      expect(res.headers.get('x-cache')).toBe('BYPASS');
      const s = await login(down.app, uniq('ana'));
      const r = await api(down.app, 'POST', '/api/questions', {
        session: s,
        body: { title: uniq('Onde acho pilha AAA'), category: 'casa', force: true },
      });
      expect(r.status).toBe(201);
    } finally {
      await down.close();
    }
  });

  it('cache:bump config invalida a economia', async () => {
    await xcache();
    expect(await xcache()).toBe('HIT');
    await bumpGroups(ctx.cache, ['config']);
    expect(await xcache()).toBe('MISS');
  });

  it('configs de ambiente diferentes no mesmo Redis não trocam as respostas', async () => {
    const a = await makeApp({ cache: ctx.cache, env: { GOOGLE_CLIENT_ID: uniq('cid-a') } });
    const b = await makeApp({ cache: ctx.cache, env: { GOOGLE_CLIENT_ID: uniq('cid-b') } });
    try {
      await ctx.cache.bump(['config']);
      const ra = await a.app.request('/api/config');
      expect(ra.headers.get('x-cache')).toBe('MISS');
      const rb = await b.app.request('/api/config');
      expect(rb.headers.get('x-cache')).toBe('MISS');
      expect(((await rb.json()) as any).googleClientId).toBe(b.config.GOOGLE_CLIENT_ID);
      const ra2 = await a.app.request('/api/config');
      expect(ra2.headers.get('x-cache')).toBe('HIT');
      expect(((await ra2.json()) as any).googleClientId).toBe(a.config.GOOGLE_CLIENT_ID);
    } finally {
      // Fecha só o Postgres: o cache é compartilhado com o app principal do arquivo.
      await a.sql.end();
      await b.sql.end();
    }
  });
});
