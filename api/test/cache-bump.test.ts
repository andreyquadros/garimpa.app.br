import { afterAll, describe, expect, it } from 'vitest';
import { createCache } from '../src/cache.js';
import { bumpOnStartup, bumpViaUrl, GLOBAL_GROUPS } from '../src/cache-bump.js';

const REDIS = process.env.REDIS_URL_TEST ?? 'redis://127.0.0.1:63799/2';
const cache = createCache(REDIS);
afterAll(() => cache.close());

describe('invalidação na subida da API', () => {
  it('derruba as entradas de cada grupo global', async () => {
    const loader = async () => 'v';
    for (const g of GLOBAL_GROUPS) {
      await cache.wrap('subida', [g], null, 30, loader);
      expect((await cache.wrap('subida', [g], null, 30, loader)).status).toBe('HIT');
    }
    await bumpOnStartup(cache);
    for (const g of GLOBAL_GROUPS) {
      expect((await cache.wrap('subida', [g], null, 30, loader)).status).toBe('MISS');
    }
  });
});

describe('cache:bump pela linha de comando', () => {
  it('com Redis inacessível informa a falha em vez de fingir sucesso', async () => {
    const r = await bumpViaUrl('redis://127.0.0.1:1', ['config']);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error).toMatch(/Redis/);
  });

  it('com Redis no ar invalida e informa sucesso', async () => {
    const loader = async () => 'v';
    const g = 'config';
    await cache.wrap('cli', [g], null, 30, loader);
    expect((await bumpViaUrl(REDIS, [g])).ok).toBe(true);
    expect((await cache.wrap('cli', [g], null, 30, loader)).status).toBe('MISS');
  });
});
