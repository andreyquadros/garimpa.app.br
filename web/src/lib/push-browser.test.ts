// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetDevice, readPushStatus } from './push-browser';

function stubBrowser(o: { registered: boolean; endpoint?: string }) {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const sub = o.endpoint ? { endpoint: o.endpoint, unsubscribe } : null;
  const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) } };
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue(o.registered ? registration : undefined),
      // Sem service worker registrado, `ready` nunca resolve: o logout não pode esperar por ele.
      ready: o.registered ? Promise.resolve(registration) : new Promise(() => undefined),
    },
  });
  const cacheDelete = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('caches', { delete: cacheDelete });
  return { unsubscribe, cacheDelete };
}

describe('forgetDevice (antes de sair da conta)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cancela a inscrição de push e apaga o cache das respostas da API', async () => {
    const { unsubscribe, cacheDelete } = stubBrowser({ registered: true, endpoint: 'https://push.example/1' });
    const api = { subscribePush: vi.fn(), unsubscribePush: vi.fn().mockResolvedValue({}) };
    await forgetDevice(api);
    expect(api.unsubscribePush).toHaveBeenCalledWith('https://push.example/1');
    expect(unsubscribe).toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledWith('api');
  });

  it('sem service worker não trava e ainda apaga o cache', async () => {
    const { cacheDelete } = stubBrowser({ registered: false });
    const api = { subscribePush: vi.fn(), unsubscribePush: vi.fn() };
    await forgetDevice(api);
    expect(api.unsubscribePush).not.toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledWith('api');
  });

  it('falha no push não impede a saída', async () => {
    const { unsubscribe, cacheDelete } = stubBrowser({ registered: true, endpoint: 'https://push.example/1' });
    unsubscribe.mockRejectedValue(new Error('falhou'));
    const api = { subscribePush: vi.fn(), unsubscribePush: vi.fn().mockResolvedValue({}) };
    await expect(forgetDevice(api)).resolves.toBeUndefined();
    expect(cacheDelete).toHaveBeenCalledWith('api');
  });
});

describe('readPushStatus', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sem service worker registrado é indisponivel', async () => {
    stubBrowser({ registered: false });
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.stubGlobal('PushManager', class {});
    expect(await readPushStatus('chave')).toBe('indisponivel');
  });
});
