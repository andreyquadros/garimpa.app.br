import type { Cache } from './cache.js';

/**
 * Invalida grupos do cache à mão (`pnpm cache:bump <grupo...>`). Serve para quando o banco muda por fora da API
 * (ex.: ajuste de `settings.economia` por SQL): sem isso a configuração antiga viveria até o TTL acabar.
 */
export async function bumpGroups(cache: Cache, groups: string[]): Promise<void> {
  if (groups.length === 0) throw new Error('informe ao menos um grupo (ex.: config)');
  await cache.bump(groups);
}
