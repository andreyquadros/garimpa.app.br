import webpush from 'web-push';

export type PushPayload = { id: string; title: string; body: string; url: string; topic: string | null };
export type PushTransport = {
  send(
    sub: { endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
    opts: { ttl: number; topic: string | null },
  ): Promise<{ statusCode: number }>;
};

/**
 * O cabeçalho Topic do Web Push aceita só [A-Za-z0-9_-] e até 32 caracteres. `missao-<uuid>` não cabe,
 * então vira `m` + o uuid sem hífens cortado em 31: continua único por missão e substitui o aviso anterior.
 */
export function normalizeTopic(topic: string | null): string | undefined {
  if (!topic) return undefined;
  const m = /^missao-([0-9a-f-]{36})$/i.exec(topic);
  const out = m ? `m${m[1]!.replace(/-/g, '')}`.slice(0, 32) : topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return out || undefined;
}

export function webPushTransport(vapid: { publicKey: string; privateKey: string; subject: string }): PushTransport {
  return {
    async send(sub, payload, opts) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          {
            vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
            TTL: opts.ttl,
            topic: normalizeTopic(opts.topic),
            contentEncoding: 'aes128gcm',
            // Serviço de push lento não pode travar o lote (que segura linhas bloqueadas no banco).
            timeout: 10_000,
          },
        );
        return { statusCode: res.statusCode };
      } catch (e) {
        // Erro HTTP do serviço de push traz statusCode; erro de rede (DNS, timeout, TLS) conta como 0.
        const statusCode = (e as { statusCode?: unknown }).statusCode;
        return { statusCode: typeof statusCode === 'number' ? statusCode : 0 };
      }
    },
  };
}
