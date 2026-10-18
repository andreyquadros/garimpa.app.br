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
    connectTimeout: 1000,
    maxRetriesPerRequest: 0,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  // Sem listener, o 'error' do ioredis vira exceção não tratada e derruba o processo.
  redis.on('error', noteError);

  // Sem fila offline, comando enviado antes do handshake falha. Esperamos só antes do PRIMEIRO 'ready',
  // uma única vez e compartilhada por todos os pedidos (um timer e um listener, não um por chamada), e
  // encerramos a espera cedo em 'error'/'close'. Depois disso, status diferente de 'ready' falha na hora:
  // numa queda com host que não recusa a conexão, esperar a cada tentativa somaria latência a toda requisição.
  const commandTimeoutMs = opts.commandTimeoutMs ?? 50;
  let initialSettled = false;
  let settleInitial: (ok: boolean) => void = () => {};
  const initial = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => settleInitial(false), commandTimeoutMs);
    settleInitial = (ok) => {
      if (initialSettled) return;
      initialSettled = true;
      clearTimeout(timer);
      resolve(ok);
    };
  });
  redis.on('ready', () => settleInitial(true));
  redis.on('error', () => settleInitial(false));
  redis.on('close', () => settleInitial(false));
  async function ensureReady() {
    const isReady = () => redis.status === 'ready';
    if (isReady()) return;
    if (!initialSettled && (await initial) && isReady()) return;
    throw new Error(`Redis ${redis.status}`);
  }

  const inflight = new Map<string, Promise<{ value: unknown; status: CacheStatus }>>();

  async function wrap<T>(
    name: string,
    groups: string[],
    params: unknown,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<{ value: T; status: CacheStatus }> {
    // Ordenados para que ['a','b'] e ['b','a'] compartilhem a entrada.
    const sorted = [...groups].sort();
    let key: string;
    try {
      await ensureReady();
      // Versão de cada grupo (ausente = 0): o bump a incrementa, o que invalida as chaves antigas sem apagá-las.
      const versions = groups.length ? await redis.mget(sorted.map(groupKey)) : [];
      const versionPart = sorted.map((g, i) => `${g}=${versions[i] ?? 0}`).join(',');
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
      const loaded = await loader();
      let json: string | undefined;
      try {
        json = JSON.stringify(loaded);
      } catch (err) {
        // BigInt, referência circular etc.: sem como guardar, mas o valor do loader continua válido.
        noteError(err);
        return { value: loaded, status: 'BYPASS' };
      }
      if (json === undefined) return { value: loaded, status: 'BYPASS' };
      // O MISS devolve a cópia que passou por JSON, com o mesmo formato do HIT (Date vira string etc.),
      // para a resposta não mudar conforme o cache esteja quente ou frio.
      const value = JSON.parse(json) as T;
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
        const results = await pipeline.exec();
        // exec() não rejeita quando um comando falha: o erro vem dentro do resultado de cada um.
        const failed = results?.find(([err]) => err);
        if (failed?.[0]) noteError(failed[0]);
      } catch (err) {
        noteError(err);
      }
    },
    async close() {
      settleInitial(false); // solta o timer da espera inicial
      try {
        await redis.quit();
      } catch {
        // Conexão já caída: quit falha, então cortamos o socket e os timers de reconexão.
        redis.disconnect();
      }
    },
  };
}
