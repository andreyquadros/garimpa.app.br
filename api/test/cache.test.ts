import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Cache, createCache } from '../src/cache.js';
import { uniq } from './helpers.js';

const REDIS = process.env.REDIS_URL_TEST ?? 'redis://127.0.0.1:63799/2';
const caches: Cache[] = [];

function make(url: string = REDIS, opts?: Parameters<typeof createCache>[1]) {
  const cache = createCache(url, opts);
  caches.push(cache);
  return cache;
}

afterEach(async () => {
  await Promise.all(caches.splice(0).map((c) => c.close()));
});

describe('cache', () => {
  it('primeira leitura é MISS e a segunda é HIT', async () => {
    const cache = make();
    const name = uniq('n');
    const g = uniq('g');
    const loader = vi.fn(async () => ({ x: 1 }));
    const a = await cache.wrap(name, [g], { q: 1 }, 30, loader);
    const b = await cache.wrap(name, [g], { q: 1 }, 30, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect([a.status, b.status]).toEqual(['MISS', 'HIT']);
    expect(b.value).toEqual(a.value);
  });

  it('parâmetros com chaves em outra ordem reaproveitam a entrada', async () => {
    const cache = make();
    const name = uniq('n');
    const g = uniq('g');
    const loader = async () => 'v';
    await cache.wrap(name, [g], { a: 1, b: { c: 1, d: 2 } }, 30, loader);
    const r = await cache.wrap(name, [g], { b: { d: 2, c: 1 }, a: 1 }, 30, loader);
    expect(r.status).toBe('HIT');
  });

  it('bump do grupo invalida; bump de outro grupo não', async () => {
    const cache = make();
    const name = uniq('n');
    const g1 = uniq('g');
    const gOutro = uniq('g');
    const loader = async () => 'v';
    await cache.wrap(name, [g1], null, 30, loader);
    await cache.bump([g1]);
    expect((await cache.wrap(name, [g1], null, 30, loader)).status).toBe('MISS');
    await cache.bump([gOutro]);
    expect((await cache.wrap(name, [g1], null, 30, loader)).status).toBe('HIT');
  });

  it('entrada expira no prazo', async () => {
    const cache = make();
    const name = uniq('n');
    const g = uniq('g');
    const loader = async () => 'v';
    await cache.wrap(name, [g], null, 1, loader);
    await new Promise((r) => setTimeout(r, 1200));
    expect((await cache.wrap(name, [g], null, 1, loader)).status).toBe('MISS');
  });

  it('pedidos simultâneos iguais chamam o loader uma vez', async () => {
    const cache = make();
    const name = uniq('n');
    const g = uniq('g');
    const loader = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { v: 42 };
    });
    const rs = await Promise.all(Array.from({ length: 5 }, () => cache.wrap(name, [g], null, 30, loader)));
    expect(loader).toHaveBeenCalledTimes(1);
    for (const r of rs) expect(r.value).toEqual({ v: 42 });
  });

  it('erro do loader propaga e não grava', async () => {
    const cache = make();
    const name = uniq('n');
    const g = uniq('g');
    await expect(
      cache.wrap(name, [g], null, 30, async () => {
        throw new Error('falhou');
      }),
    ).rejects.toThrow('falhou');
    const loader = vi.fn(async () => 'ok');
    const r = await cache.wrap(name, [g], null, 30, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ value: 'ok', status: 'MISS' });
  });

  it('valor null é guardado', async () => {
    const cache = make();
    const name = uniq('n');
    const g = uniq('g');
    const loader = vi.fn(async () => null);
    await cache.wrap(name, [g], null, 30, loader);
    const r = await cache.wrap(name, [g], null, 30, loader);
    expect(r).toEqual({ value: null, status: 'HIT' });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('Redis inacessível responde BYPASS sem erro e rápido', async () => {
    const cache = make('redis://127.0.0.1:1', { log: () => {} });
    const t0 = Date.now();
    const r = await cache.wrap(uniq('n'), [uniq('g')], null, 30, async () => 'direto');
    expect(r).toEqual({ value: 'direto', status: 'BYPASS' });
    expect(Date.now() - t0).toBeLessThan(500);
    await expect(cache.bump([uniq('g')])).resolves.toBeUndefined();
  });

  it('erros do Redis vão ao log no máximo uma vez por minuto', async () => {
    const log = vi.fn();
    const cache = make('redis://127.0.0.1:1', { log });
    for (let i = 0; i < 10; i++) await cache.wrap(uniq('n'), [uniq('g')], null, 30, async () => i);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('sem URL o cache não guarda nada', async () => {
    const cache = createCache();
    const loader = vi.fn(async () => 'v');
    const a = await cache.wrap('n', ['g'], null, 30, loader);
    const b = await cache.wrap('n', ['g'], null, 30, loader);
    expect([a.status, b.status]).toEqual(['BYPASS', 'BYPASS']);
    expect(loader).toHaveBeenCalledTimes(2);
    await cache.bump(['g']);
  });
});
