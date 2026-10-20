import type { Sql } from '../db.js';
import type { PushTransport } from './transport.js';

const BATCH = 50;
const PARALLEL = 5;
const SEND_TIMEOUT_S = 10;
/**
 * Reserva (lease) das linhas reivindicadas. Pior caso de um worker: BATCH/PARALLEL (10) envios em série, cada um
 * até o timeout do transporte (10 s) = 100 s; o dobro de folga dá 200 s, arredondado para 5 minutos. Reserva curta
 * demais deixaria outro remetente repetir um envio ainda em andamento.
 */
const LEASE_MINUTES = Math.ceil((2 * (BATCH / PARALLEL) * SEND_TIMEOUT_S) / 60 / 5) * 5;
/** Depois de tantas falhas seguidas a inscrição é descartada: aparelho que nunca responde só gasta envios. */
const MAX_SUB_FAILURES = 10;
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
 * Envia UM lote de notificações pendentes. Reivindica e envia em passos separados: a transação curta só trava
 * as linhas e adia `push_next_at` (lease de 5 min), então dois remetentes nunca pegam a mesma linha e nenhum
 * bloqueio fica aberto durante o HTTP (um serviço de push lento não pode travar leitura, logout ou exclusão de
 * conta). Se o processo morrer no meio, o lease vence e a notificação volta para a fila.
 */
export async function sendPendingPush(sql: Sql, transport: PushTransport, now?: Date): Promise<{ processed: number }> {
  // Sem `now`, vencimento, lease e backoff usam o relógio do banco. `push_next_at` nasce no Postgres com
  // microssegundos; comparar com `new Date()` (só milissegundos) fazia o aviso recém-criado parecer futuro
  // dentro do mesmo milissegundo e atrasava o envio um ciclo (e deixava os testes instáveis). O `now`
  // explícito continua existindo para simular o futuro nos testes de backoff.
  const dueNow = now ? sql`${now}::timestamptz` : sql`clock_timestamp()`;
  const rows = await sql.begin(async (tx) => {
    const found = await tx<Row[]>`
      select n.id, n.user_id, n.title, n.body, n.url, n.topic, n.push_attempts, (u.banned_at is not null) as banned
      from notifications n join users u on u.id = n.user_id
      where n.push_state = 'pendente' and n.push_next_at <= ${dueNow}
      order by n.push_next_at limit ${BATCH}
      for update of n skip locked`;
    if (found.length)
      await tx`update notifications set push_next_at = ${dueNow} + ${LEASE_MINUTES} * interval '1 minute'
        where id = any(${found.map((r) => r.id)}::uuid[])`;
    return found;
  });
  if (!rows.length) return { processed: 0 };

  const userIds = [...new Set(rows.filter((r) => !r.banned).map((r) => r.userId))];
  const subs = userIds.length
    ? await sql<
        Sub[]
      >`select id, user_id, endpoint, p256dh, auth from push_subscriptions where user_id in ${sql(userIds)}`
    : [];
  const byUser = new Map<string, Sub[]>();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);

  const sendOne = async (n: Row) => {
    // Conta removida não recebe nada, nem que ainda tenha aparelho inscrito.
    const mine = n.banned ? [] : (byUser.get(n.userId) ?? []);
    if (!mine.length) {
      await sql`update notifications set push_state = 'sem_assinatura' where id = ${n.id} and push_state = 'pendente'`;
      return;
    }
    const payload = { id: n.id, title: n.title, body: n.body, url: n.url, topic: n.topic };
    const results = await Promise.all(
      mine.map(async (s) => ({ s, ...(await transport.send(s, payload, { ttl: TTL_SECONDS, topic: n.topic })) })),
    );
    let delivered = false;
    let failed = false;
    let remaining = mine.length;
    for (const { s, statusCode } of results) {
      if (statusCode >= 200 && statusCode < 300) {
        delivered = true;
        await sql`update push_subscriptions set last_success_at = now(), failures = 0 where id = ${s.id}`;
      } else if (statusCode === 404 || statusCode === 410) {
        // O serviço de push disse que a inscrição não existe mais: guardar só geraria novas falhas.
        remaining--;
        await sql`delete from push_subscriptions where id = ${s.id}`;
      } else {
        failed = true;
        const upd = await sql<{ failures: number }[]>`
          update push_subscriptions set failures = failures + 1 where id = ${s.id} returning failures`;
        if ((upd[0]?.failures ?? 0) >= MAX_SUB_FAILURES) {
          remaining--;
          await sql`delete from push_subscriptions where id = ${s.id}`;
        }
      }
    }
    if (delivered) {
      await sql`update notifications set push_state = 'enviado' where id = ${n.id} and push_state = 'pendente'`;
    } else if (failed) {
      const attempts = n.pushAttempts + 1;
      if (attempts > BACKOFF_MIN.length) {
        await sql`update notifications set push_state = 'falhou', push_attempts = ${attempts}
          where id = ${n.id} and push_state = 'pendente'`;
      } else {
        const minutes = BACKOFF_MIN[attempts - 1]!;
        const next = now
          ? sql`${new Date(now.getTime() + minutes * 60_000)}::timestamptz`
          : sql`clock_timestamp() + ${minutes} * interval '1 minute'`;
        await sql`update notifications set push_attempts = ${attempts}, push_next_at = ${next}
          where id = ${n.id} and push_state = 'pendente'`;
      }
    } else if (remaining === 0) {
      await sql`update notifications set push_state = 'sem_assinatura' where id = ${n.id} and push_state = 'pendente'`;
    }
  };

  // Erro inesperado numa notificação não pode derrubar o lote: o Promise.all devolveria o controle com outros envios
  // ainda no ar (o laço do main.ts abriria outro lote e o desligamento fecharia o banco debaixo deles). A linha fica
  // `pendente` e o vencimento da reserva a recoloca na fila.
  const one = async (n: Row) => {
    try {
      await sendOne(n);
    } catch (e) {
      console.error(
        `push: falha inesperada ao enviar a notificação ${n.id}; ela volta à fila quando a reserva vencer`,
        e,
      );
    }
  };

  // Paralelismo limitado: poucos envios simultâneos para não saturar a rede nem o pool de conexões.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, rows.length) }, async () => {
      while (next < rows.length) await one(rows[next++]!);
    }),
  );
  return { processed: rows.length };
}
