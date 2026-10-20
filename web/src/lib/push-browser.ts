import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { disablePush, getPushStatus, isIosSafariNotInstalled, type PushApi, type PushStatus } from './push';

const LOGOUT_PUSH_TIMEOUT_MS = 3000;

/** Chave VAPID pública do servidor; `null` quando o push está desligado lá (ou a rota não existe, como na demo). */
export function usePushKey() {
  return useQuery({
    queryKey: ['pushKey'],
    queryFn: async () => (await api.pushKey()).publicKey,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

function isStandalone(): boolean {
  const media = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  return media || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function readPushStatus(serverKey: string | null): Promise<PushStatus> {
  const ua = navigator.userAgent;
  const standalone = isStandalone();
  // No iPhone fora da tela inicial o navegador nem expõe o PushManager; sem esta checagem a pessoa veria
  // "indisponível" em vez de aprender a instalar o app.
  if (serverKey && isIosSafariNotInstalled(ua, standalone)) return 'instalar-no-iphone';
  let hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = typeof window !== 'undefined' && 'PushManager' in window;
  let subscribed = false;
  if (hasServiceWorker && hasPushManager && serverKey) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      // Sem registro (ex.: `pnpm dev`) não há como receber push, e `serviceWorker.ready` nunca resolveria.
      if (!registration) hasServiceWorker = false;
      subscribed = !!(await registration?.pushManager.getSubscription());
    } catch {
      subscribed = false;
    }
  }
  return getPushStatus({
    hasServiceWorker,
    hasPushManager,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    isIos: /iPhone|iPad|iPod/.test(ua),
    isStandalone: standalone,
    subscribed,
    serverKey,
  });
}

/** Estado real do push neste aparelho; `null` enquanto lê. */
export function usePushStatus(serverKey: string | null | undefined) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (serverKey === undefined) return;
    let alive = true;
    void tick;
    readPushStatus(serverKey).then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, [serverKey, tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { status, setStatus, refresh };
}

/**
 * Antes de sair da conta: o aparelho para de receber os avisos dessa pessoa e o cache do service worker com as
 * respostas pessoais da API (ex.: `/api/questions` com `iFollow`/`myVote`) é apagado, senão quem usar o aparelho
 * depois veria esses dados sem rede. Nada aqui pode impedir o logout.
 */
export async function forgetDevice(pushApi: PushApi): Promise<void> {
  try {
    // Sem registro, `serviceWorker.ready` nunca resolve; o tempo-limite cobre um service worker que não ativa.
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await Promise.race([disablePush(pushApi), new Promise((resolve) => setTimeout(resolve, LOGOUT_PUSH_TIMEOUT_MS))]);
    }
  } catch {
    // Segue para o logout mesmo assim.
  }
  try {
    if (typeof caches !== 'undefined') await caches.delete('api');
  } catch {
    // Idem.
  }
}
