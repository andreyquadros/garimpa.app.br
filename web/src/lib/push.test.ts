import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  disablePush,
  enablePush,
  getPushStatus,
  isIosSafariNotInstalled,
  type PushEnv,
  shouldShowPrompt,
  urlBase64ToUint8Array,
} from './push';

const base: PushEnv = {
  hasServiceWorker: true,
  hasPushManager: true,
  permission: 'default',
  isIos: false,
  isStandalone: false,
  subscribed: false,
  serverKey: 'abc',
};

describe('getPushStatus', () => {
  it('indisponível sem service worker, PushManager ou chave', () => {
    expect(getPushStatus({ ...base, hasServiceWorker: false })).toBe('indisponivel');
    expect(getPushStatus({ ...base, hasPushManager: false })).toBe('indisponivel');
    expect(getPushStatus({ ...base, serverKey: null })).toBe('indisponivel');
  });
  it('pede instalação no iPhone fora do app instalado', () => {
    expect(getPushStatus({ ...base, isIos: true })).toBe('instalar-no-iphone');
  });
  it('negado quando a permissão foi negada', () => {
    expect(getPushStatus({ ...base, permission: 'denied' })).toBe('negado');
  });
  it('ativo quando inscrito e permitido', () => {
    expect(getPushStatus({ ...base, permission: 'granted', subscribed: true })).toBe('ativo');
  });
  it('inativo nos demais casos', () => {
    expect(getPushStatus(base)).toBe('inativo');
    expect(getPushStatus({ ...base, permission: 'granted' })).toBe('inativo');
    expect(getPushStatus({ ...base, isIos: true, isStandalone: true })).toBe('inativo');
  });
});

describe('isIosSafariNotInstalled', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
  it('iPhone fora do standalone', () => expect(isIosSafariNotInstalled(iphone, false)).toBe(true));
  it('Android', () => expect(isIosSafariNotInstalled(android, false)).toBe(false));
  it('iPhone instalado', () => expect(isIosSafariNotInstalled(iphone, true)).toBe(false));
});

describe('shouldShowPrompt', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 100 * day;
  it('mostra se nunca dispensou', () => expect(shouldShowPrompt(null, now)).toBe(true));
  it('esconde 29 dias depois', () => expect(shouldShowPrompt(now - 29 * day, now)).toBe(false));
  it('mostra 31 dias depois', () => expect(shouldShowPrompt(now - 31 * day, now)).toBe(true));
});

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64 url-safe sem preenchimento', () => {
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
  });
});

describe('enablePush e disablePush', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(permission: NotificationPermission, existing: unknown = null) {
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: 'https://push/1',
      toJSON: () => ({ endpoint: 'https://push/1', keys: { p256dh: 'P', auth: 'A' } }),
    });
    const registration = { pushManager: { subscribe, getSubscription: vi.fn().mockResolvedValue(existing) } };
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue(permission) });
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(registration) } });
    return { subscribe };
  }
  const api = () => ({ subscribePush: vi.fn().mockResolvedValue({}), unsubscribePush: vi.fn().mockResolvedValue({}) });

  it('devolve negado sem inscrever quando a permissão é recusada', async () => {
    const { subscribe } = stub('denied');
    const a = api();
    expect(await enablePush(a, 'AQID')).toBe('negado');
    expect(subscribe).not.toHaveBeenCalled();
    expect(a.subscribePush).not.toHaveBeenCalled();
  });

  it('inscreve e envia as chaves ao servidor', async () => {
    const { subscribe } = stub('granted');
    const a = api();
    expect(await enablePush(a, 'AQID')).toBe('ativo');
    expect(subscribe.mock.calls[0]?.[0]).toMatchObject({ userVisibleOnly: true });
    expect(a.subscribePush).toHaveBeenCalledWith({ endpoint: 'https://push/1', keys: { p256dh: 'P', auth: 'A' } });
  });

  it('sem service worker registrado não trava: enablePush devolve indisponivel e disablePush volta', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('granted') });
      // Sem registro (ex.: `pnpm dev`), `ready` nunca resolve.
      vi.stubGlobal('navigator', { serviceWorker: { ready: new Promise(() => undefined) } });
      const a = api();
      const enabling = enablePush(a, 'AQID');
      const disabling = disablePush(a);
      await vi.advanceTimersByTimeAsync(6000);
      expect(await enabling).toBe('indisponivel');
      await expect(disabling).resolves.toBeUndefined();
      expect(a.subscribePush).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancela no navegador mesmo se o servidor falhar', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    stub('granted', { endpoint: 'https://push/1', unsubscribe });
    const a = api();
    a.unsubscribePush.mockRejectedValue(new Error('rede'));
    await disablePush(a);
    expect(a.unsubscribePush).toHaveBeenCalledWith('https://push/1');
    expect(unsubscribe).toHaveBeenCalled();
  });
});
