import { type Cache, createCache } from './cache.js';

/**
 * Invalida grupos do cache à mão (`pnpm cache:bump <grupo...>`). Serve para quando o banco muda por fora da API
 * (ex.: ajuste de `settings.economia` por SQL): sem isso a configuração antiga viveria até o TTL acabar.
 */
export async function bumpGroups(cache: Cache, groups: string[]): Promise<void> {
  if (groups.length === 0) throw new Error('informe ao menos um grupo (ex.: config)');
  await cache.bump(groups);
}

/** Grupos sem id na chave: valem para a cidade toda e podem depender de configuração, esquema ou código. */
export const GLOBAL_GROUPS = ['config', 'missoes', 'achados', 'lugares', 'ranking'];

/**
 * Roda quando a API sobe. Um deploy pode trazer migração que muda `settings.economia`, mudança em `DEFAULT_ECONOMY`
 * ou outro formato de resposta; sem isso o Redis serviria a versão antiga (e os prêmios usariam a economia velha)
 * até o TTL de até 1 h acabar. Os grupos por id (`missao:<id>`, `lugar:<id>`) ficam de fora: expiram em 10 min.
 */
export async function bumpOnStartup(cache: Cache): Promise<void> {
  await cache.bump(GLOBAL_GROUPS);
}

/**
 * Versão da linha de comando: o cache é fail-open (erro do Redis só vai ao log), o que numa operação manual
 * faria `pnpm cache:bump` dizer "invalidados" sem ter invalidado nada. Aqui qualquer erro registrado vira falha.
 */
export async function bumpViaUrl(
  url: string,
  groups: string[],
  commandTimeoutMs = 2000,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const errors: string[] = [];
  const cache = createCache(url, { commandTimeoutMs, log: (msg) => errors.push(msg) });
  try {
    await bumpGroups(cache, groups);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await cache.close();
  }
  return errors.length ? { ok: false, error: errors[0]! } : { ok: true };
}
