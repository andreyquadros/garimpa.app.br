import net from 'node:net';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

  it('grupos em outra ordem reaproveitam a entrada', async () => {
    const cache = make();
    const name = uniq('n');
    const [g1, g2] = [uniq('g'), uniq('g')];
    await cache.wrap(name, [g1, g2], null, 30, async () => 'v');
    expect((await cache.wrap(name, [g2, g1], null, 30, async () => 'v')).status).toBe('HIT');
  });

  it('MISS devolve o mesmo formato do HIT (ida e volta por JSON)', async () => {
    const cache = make();
    const name = uniq('n');
    const g = uniq('g');
    const loader = async () => ({ d: new Date(0) });
    const a = await cache.wrap(name, [g], null, 30, loader);
    const b = await cache.wrap(name, [g], null, 30, loader);
    expect([a.status, b.status]).toEqual(['MISS', 'HIT']);
    expect(a.value).toEqual({ d: '1970-01-01T00:00:00.000Z' });
    expect(b.value).toEqual({ d: '1970-01-01T00:00:00.000Z' });
  });

  it('valor não serializável devolve o valor cru com BYPASS e registra no log', async () => {
    const log = vi.fn();
    const cache = make(REDIS, { log });
    const raw = { n: 1n };
    const r = await cache.wrap(uniq('n'), [uniq('g')], null, 30, async () => raw);
    expect(r.status).toBe('BYPASS');
    expect(r.value).toBe(raw);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('falha no bump é registrada no log sem lançar', async () => {
    const log = vi.fn();
    const cache = make(REDIS, { log });
    const g = uniq('g');
    const raw = new Redis(REDIS);
    await raw.set(`pepita:v1:grupo:${g}`, 'abc', 'EX', 30);
    await raw.quit();
    await expect(cache.bump([g])).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
  });

  describe('servidor que aceita a conexão e nunca responde', () => {
    const sockets: net.Socket[] = [];
    const server = net.createServer((s) => {
      sockets.push(s);
      s.on('error', () => {});
    });
    let url = '';
    beforeAll(async () => {
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      url = `redis://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
    });
    afterAll(async () => {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    });

    it('depois da primeira espera, as chamadas seguintes dão BYPASS na hora', async () => {
      const cache = make(url, { log: () => {} });
      await cache.wrap(uniq('n'), [uniq('g')], null, 30, async () => 0);
      const t0 = Date.now();
      for (let i = 0; i < 10; i++) {
        const r = await cache.wrap(uniq('n'), [uniq('g')], null, 30, async () => i);
        expect(r.status).toBe('BYPASS');
      }
      expect(Date.now() - t0).toBeLessThan(150);
    });

    it('rajada de chamadas simultâneas não gera MaxListenersExceededWarning', async () => {
      const warnings: string[] = [];
      const onWarning = (w: Error) => warnings.push(w.name);
      process.on('warning', onWarning);
      const cache = make(url, { log: () => {} });
      await Promise.all(Array.from({ length: 30 }, () => cache.wrap(uniq('n'), [uniq('g')], null, 30, async () => 1)));
      await new Promise((r) => setTimeout(r, 20));
      process.off('warning', onWarning);
      expect(warnings).not.toContain('MaxListenersExceededWarning');
    });
  });

  it('porta recusada não espera o prazo inteiro na primeira chamada', async () => {
    const cache = make('redis://127.0.0.1:1', { log: () => {} });
    const t0 = Date.now();
    await cache.wrap(uniq('n'), [uniq('g')], null, 30, async () => 1);
    expect(Date.now() - t0).toBeLessThan(30);
  });
});
