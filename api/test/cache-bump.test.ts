import { afterAll, describe, expect, it } from 'vitest';
import { createCache } from '../src/cache.js';
import { bumpOnStartup, GLOBAL_GROUPS } from '../src/cache-bump.js';

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
