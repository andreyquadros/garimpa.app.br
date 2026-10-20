import type { QueryClient } from '@tanstack/react-query';
import type { PushApi } from './push';

export type SignOutDeps = {
  forgetDevice: (pushApi: PushApi) => Promise<void>;
  logout: () => Promise<unknown>;
  pushApi: PushApi;
};

/**
 * Sair da conta. O aparelho é esquecido antes do logout (a remoção da inscrição no servidor exige a sessão), e o
 * cache das consultas é limpo mesmo se o logout falhar: num aparelho compartilhado, os dados de quem saiu não podem
 * continuar na tela.
 */
export async function signOut(qc: QueryClient, deps: SignOutDeps): Promise<void> {
  await deps.forgetDevice(deps.pushApi);
  try {
    await deps.logout();
  } finally {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'config' });
    qc.setQueryData(['me'], null);
  }
}
