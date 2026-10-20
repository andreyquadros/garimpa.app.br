import type { Sql } from '../db.js';
import type { PushTransport } from './transport.js';

const BATCH = 50;
const TTL_SECONDS = 24 * 60 * 60;
/** Espera (em minutos) antes da próxima tentativa, pelo número da falha; a 5ª falha desiste. */
const BACKOFF_MIN = [1, 5, 30, 120];

type Row = {
  id: string;
  userId: string;
  title: string;
  body: string;
  url: string;
  topic: string | null;
  pushAttempts: number;
  banned: boolean;
};
type Sub = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };

/**
 * Envia UM lote de notificações pendentes. Tudo numa transação com `for update skip locked`: dois remetentes
 * (processos ou chamadas simultâneas) nunca pegam a mesma linha, e o estado só muda junto com o envio.
 */
export async function sendPendingPush(
  sql: Sql,
  transport: PushTransport,
  now: Date = new Date(),
): Promise<{ processed: number }> {
  return sql.begin(async (tx) => {
    const rows = await tx<Row[]>`
      select n.id, n.user_id, n.title, n.body, n.url, n.topic, n.push_attempts, (u.banned_at is not null) as banned
      from notifications n join users u on u.id = n.user_id
      where n.push_state = 'pendente' and n.push_next_at <= ${now}
      order by n.push_next_at limit ${BATCH}
      for update of n skip locked`;
    if (!rows.length) return { processed: 0 };

    const userIds = [...new Set(rows.filter((r) => !r.banned).map((r) => r.userId))];
    const subs = userIds.length
      ? await tx<
          Sub[]
        >`select id, user_id, endpoint, p256dh, auth from push_subscriptions where user_id in ${tx(userIds)}`
      : [];
    const byUser = new Map<string, Sub[]>();
    for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);

    for (const n of rows) {
      // Conta removida não recebe nada, nem que ainda tenha aparelho inscrito.
      const mine = n.banned ? [] : (byUser.get(n.userId) ?? []);
      if (!mine.length) {
        await tx`update notifications set push_state = 'sem_assinatura' where id = ${n.id}`;
        continue;
      }
      const payload = { id: n.id, title: n.title, body: n.body, url: n.url, topic: n.topic };
      let delivered = false;
      let failed = false;
      let remaining = mine.length;
      for (const s of mine) {
        const { statusCode } = await transport.send(s, payload, { ttl: TTL_SECONDS, topic: n.topic });
        if (statusCode >= 200 && statusCode < 300) {
          delivered = true;
          await tx`update push_subscriptions set last_success_at = now(), failures = 0 where id = ${s.id}`;
        } else if (statusCode === 404 || statusCode === 410) {
          // O serviço de push disse que a inscrição não existe mais: guardar só geraria novas falhas.
          remaining--;
          await tx`delete from push_subscriptions where id = ${s.id}`;
        } else {
          failed = true;
          await tx`update push_subscriptions set failures = failures + 1 where id = ${s.id}`;
        }
      }
      if (delivered) {
        await tx`update notifications set push_state = 'enviado' where id = ${n.id}`;
      } else if (failed) {
        const attempts = n.pushAttempts + 1;
        if (attempts > BACKOFF_MIN.length) {
          await tx`update notifications set push_state = 'falhou', push_attempts = ${attempts} where id = ${n.id}`;
        } else {
          const next = new Date(now.getTime() + BACKOFF_MIN[attempts - 1]! * 60_000);
          await tx`update notifications set push_attempts = ${attempts}, push_next_at = ${next} where id = ${n.id}`;
        }
      } else if (remaining === 0) {
        await tx`update notifications set push_state = 'sem_assinatura' where id = ${n.id}`;
      }
    }
    return { processed: rows.length };
  });
}
