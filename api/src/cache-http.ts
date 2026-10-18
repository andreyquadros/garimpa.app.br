import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './auth.js';

/** Marca grupos do cache a invalidar quando a requisição terminar com sucesso. */
export function markDirty(c: Context<AppEnv>, ...groups: string[]): void {
  let dirty = c.get('cacheDirty');
  if (!dirty) {
    dirty = new Set();
    c.set('cacheDirty', dirty);
  }
  for (const g of groups) dirty.add(g);
}

/**
 * Roda depois do handler. Só invalida se a resposta foi de sucesso: escrita recusada (4xx) ou com erro (5xx)
 * não mudou nada no banco, então derrubar o cache só custaria acertos. Exceções viram 4xx/5xx no `onError`,
 * que já terminou quando o `await next()` volta, por isso olhar `c.res.status` cobre os dois caminhos.
 */
export const cacheInvalidation: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const dirty = c.get('cacheDirty');
  if (dirty && dirty.size > 0 && c.res.status < 400) await c.get('cache').bump([...dirty]);
};

/** Lê pelo cache e informa o resultado (HIT, MISS ou BYPASS) no cabeçalho X-Cache. */
export async function cached<T>(
  c: Context<AppEnv>,
  name: string,
  groups: string[],
  params: unknown,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const { value, status } = await c.get('cache').wrap(name, groups, params, ttlSeconds, loader);
  c.header('X-Cache', status);
  return value;
}
