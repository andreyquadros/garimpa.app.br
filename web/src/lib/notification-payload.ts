// Corpo do Web Push enviado pela API (api/src/push/transport.ts).
export type PushPayload = { id: string; title: string; body: string; url: string; topic: string | null };

const FALLBACK_URL = '/notificacoes';

// O clique abre a URL do payload: só aceitamos caminhos do próprio app, para um aviso adulterado
// não levar a pessoa a outro site ('//host' também seria interpretado como outro site).
export function safeAppUrl(url: unknown): string {
  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) return url;
  return FALLBACK_URL;
}

export function toNotificationOptions(p: PushPayload): {
  title: string;
  options: NotificationOptions & { data: { url: string; id: string } };
} {
  return {
    title: p.title,
    options: {
      body: p.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Mesma tag substitui o aviso anterior do mesmo assunto em vez de empilhar.
      tag: p.topic ?? undefined,
      data: { url: safeAppUrl(p.url), id: p.id },
    },
  };
}
