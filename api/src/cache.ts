import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';

// Cache de leitura sobre o Redis (ADR-0006). O Redis é só um acelerador: qualquer falha dele
// vira BYPASS e a requisição segue pelo banco, nunca vira erro para a pessoa.

export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export type Cache = {
  wrap<T>(
    name: string,
    groups: string[],
    params: unknown,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<{ value: T; status: CacheStatus }>;
  bump(groups: string[]): Promise<void>;
  close(): Promise<void>;
};

const PREFIX = 'pepita:v1:';
const LOG_INTERVAL_MS = 60_000;

const groupKey = (g: string) => `${PREFIX}grupo:${g}`;

// JSON com chaves ordenadas recursivamente: {a,b} e {b,a} precisam gerar a mesma chave.
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return v;
  });
}

const hashParams = (params: unknown) =>
  createHash('sha1')
    .update(stableStringify(params) ?? 'undefined')
    .digest('hex');

const nullCache: Cache = {
  async wrap(_name, _groups, _params, _ttl, loader) {
    return { value: await loader(), status: 'BYPASS' };
  },
  async bump() {},
  async close() {},
};

export function createCache(
  url?: string,
  opts: { commandTimeoutMs?: number; log?: (msg: string) => void } = {},
): Cache {
  if (!url) return nullCache;
  const log = opts.log ?? ((msg: string) => console.error(msg));

  // Com o Redis fora do ar, cada requisição falharia e geraria uma linha de log. Limitamos a uma
  // por minuto e informamos quantas foram suprimidas, para o log não virar ruído nem esconder o problema.
  let lastLogAt = Number.NEGATIVE_INFINITY;
  let suppressed = 0;
  const noteError = (err: unknown) => {
    const now = Date.now();
    if (now - lastLogAt < LOG_INTERVAL_MS) {
      suppressed++;
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    log(`Cache Redis indisponível (${msg}); ${suppressed} erro(s) suprimido(s) no último minuto.`);
    lastLogAt = now;
    suppressed = 0;
  };

  const redis = new Redis(url, {
    // Sem fila offline e com timeout curto: Redis lento ou fora do ar nunca pode atrasar a API.
    enableOfflineQueue: false,
    commandTimeout: opts.commandTimeoutMs ?? 50,
    maxRetriesPerRequest: 0,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  // Sem listener, o 'error' do ioredis vira exceção não tratada e derruba o processo.
  redis.on('error', noteError);

  // Sem fila offline, comando enviado antes do handshake falha. Só na primeira conexão vale esperar
  // (até o timeout de comando); em 'reconnecting' o Redis está caído e falhar na hora evita atrasar a API.
  const commandTimeoutMs = opts.commandTimeoutMs ?? 50;
  async function ensureReady() {
    if (redis.status === 'ready') return;
    if (redis.status !== 'connecting' && redis.status !== 'connect') throw new Error(`Redis ${redis.status}`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        redis.off('ready', onReady);
        reject(new Error('Redis ainda conectando'));
      }, commandTimeoutMs);
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      redis.once('ready', onReady);
    });
  }

  const inflight = new Map<string, Promise<{ value: unknown; status: CacheStatus }>>();

  async function wrap<T>(
    name: string,
    groups: string[],
    params: unknown,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<{ value: T; status: CacheStatus }> {
    let key: string;
    try {
      await ensureReady();
      // Versão de cada grupo (ausente = 0): o bump a incrementa, o que invalida as chaves antigas sem apagá-las.
      const versions = groups.length ? await redis.mget(groups.map(groupKey)) : [];
      const versionPart = groups.map((g, i) => `${g}=${versions[i] ?? 0}`).join(',');
      key = `${PREFIX}${name}:${versionPart}:${hashParams(params)}`;
    } catch (err) {
      noteError(err);
      return { value: await loader(), status: 'BYPASS' };
    }

    const pending = inflight.get(key);
    if (pending) return (await pending) as { value: T; status: CacheStatus };

    const run = (async (): Promise<{ value: T; status: CacheStatus }> => {
      try {
        const raw = await redis.get(key);
        if (raw !== null) return { value: JSON.parse(raw) as T, status: 'HIT' };
      } catch (err) {
        noteError(err);
        return { value: await loader(), status: 'BYPASS' };
      }
      const value = await loader();
      const json = JSON.stringify(value);
      if (json === undefined) return { value, status: 'MISS' };
      try {
        await redis.set(key, json, 'EX', ttlSeconds);
        return { value, status: 'MISS' };
      } catch (err) {
        // O loader já rodou e o valor é válido, mas nada foi guardado: reportamos BYPASS para
        // que métricas e cabeçalhos não aleguem um cache que não ficou gravado.
        noteError(err);
        return { value, status: 'BYPASS' };
      }
    })();
    inflight.set(key, run);
    try {
      return await run;
    } finally {
      // Também roda quando o loader rejeita: a entrada em voo some e nada é gravado.
      inflight.delete(key);
    }
  }

  return {
    wrap,
    async bump(groups) {
      if (!groups.length) return;
      try {
        await ensureReady();
        const pipeline = redis.pipeline();
        for (const g of groups) pipeline.incr(groupKey(g));
        await pipeline.exec();
      } catch (err) {
        noteError(err);
      }
    },
    async close() {
      try {
        await redis.quit();
      } catch {
        // Conexão já caída: quit falha, então cortamos o socket e os timers de reconexão.
        redis.disconnect();
      }
    },
  };
}
