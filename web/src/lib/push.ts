export type PushStatus = 'indisponivel' | 'instalar-no-iphone' | 'negado' | 'ativo' | 'inativo';

export type PushEnv = {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | 'unsupported';
  isIos: boolean;
  isStandalone: boolean;
  subscribed: boolean;
  serverKey: string | null;
};

export type PushApi = {
  subscribePush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<unknown>;
  unsubscribePush(endpoint: string): Promise<unknown>;
};

const PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

// No iPhone o push só funciona com o app instalado na tela inicial; antes disso o navegador nem oferece a API.
export function isIosSafariNotInstalled(userAgent: string, standalone: boolean): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) && !standalone;
}

export function getPushStatus(env: PushEnv): PushStatus {
  if (!env.hasServiceWorker || !env.hasPushManager || !env.serverKey) return 'indisponivel';
  if (env.isIos && !env.isStandalone) return 'instalar-no-iphone';
  if (env.permission === 'denied') return 'negado';
  if (env.subscribed && env.permission === 'granted') return 'ativo';
  return 'inativo';
}

// Quem dispensou o convite não é incomodado de novo por 30 dias.
export function shouldShowPrompt(dismissedAt: number | null, now: number): boolean {
  return dismissedAt === null || now - dismissedAt >= PROMPT_COOLDOWN_MS;
}

// A chave VAPID pública vem em base64 url-safe; o PushManager exige bytes.
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const READY_TIMEOUT_MS = 5000;

// Sem service worker registrado (ex.: `pnpm dev`), `serviceWorker.ready` nunca resolve e a tela ficaria presa.
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function enablePush(api: PushApi, serverKey: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'negado';
  if (permission !== 'granted') return 'inativo';
  const registration = await readyRegistration();
  if (!registration) return 'indisponivel';
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(serverKey),
  });
  const json = subscription.toJSON();
  await api.subscribePush({
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  });
  return 'ativo';
}

export async function disablePush(api: PushApi): Promise<void> {
  const registration = await readyRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  // Sem rede o aviso no servidor fica órfão (e expira no primeiro envio), mas o aparelho para de receber já.
  await api.unsubscribePush(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}
