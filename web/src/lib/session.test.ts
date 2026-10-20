// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { signOut } from './session';

function client() {
  const qc = new QueryClient();
  qc.setQueryData(['config'], { city: null });
  qc.setQueryData(['me'], { user: { id: 'u1' } });
  qc.setQueryData(['notifications', 'unread'], 3);
  return qc;
}

const pushApi = { subscribePush: vi.fn(), unsubscribePush: vi.fn() };

describe('signOut', () => {
  it('esquece o aparelho antes de encerrar a sessão e limpa o cache pessoal', async () => {
    const order: string[] = [];
    const qc = client();
    await signOut(qc, {
      forgetDevice: async () => {
        order.push('forget');
      },
      logout: async () => {
        order.push('logout');
      },
      pushApi,
    });
    expect(order).toEqual(['forget', 'logout']);
    expect(qc.getQueryData(['me'])).toBeNull();
    expect(qc.getQueryData(['notifications', 'unread'])).toBeUndefined();
    expect(qc.getQueryData(['config'])).toEqual({ city: null });
  });

  it('mesmo se o logout falhar, o cache é limpo e me vira null', async () => {
    const qc = client();
    await expect(
      signOut(qc, {
        forgetDevice: async () => undefined,
        logout: () => Promise.reject(new Error('sem rede')),
        pushApi,
      }),
    ).rejects.toThrow('sem rede');
    expect(qc.getQueryData(['me'])).toBeNull();
    expect(qc.getQueryData(['notifications', 'unread'])).toBeUndefined();
  });
});
