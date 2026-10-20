import type { Sql, Tx } from '../db.js';

export type Kind =
  | 'nova_evidencia'
  | 'evidencia_confirmada'
  | 'evidencia_aceita'
  | 'gorjeta_recebida'
  | 'pepitas_liberadas';

export type NewNotification = {
  userId: string;
  kind: Kind;
  title: string;
  body: string;
  url: string;
  topic: string | null;
  refType: string;
  refId: string | null;
};

/** Grava avisos em lote, na transação da rota. Conta removida (banned_at) não recebe aviso. */
export async function notify(tx: Sql | Tx, rows: NewNotification[]): Promise<void> {
  if (rows.length === 0) return;
  await tx`
    insert into notifications (user_id, kind, title, body, url, topic, ref_type, ref_id)
    select r.user_id, r.kind, r.title, r.body, r.url, r.topic, r.ref_type, r.ref_id
    from unnest(
      ${rows.map((r) => r.userId)}::uuid[], ${rows.map((r) => r.kind)}::text[], ${rows.map((r) => r.title)}::text[],
      ${rows.map((r) => r.body)}::text[], ${rows.map((r) => r.url)}::text[], ${rows.map((r) => r.topic)}::text[],
      ${rows.map((r) => r.refType)}::text[], ${rows.map((r) => r.refId)}::uuid[]
    ) as r(user_id, kind, title, body, url, topic, ref_type, ref_id)
    join users u on u.id = r.user_id
    where u.banned_at is null`;
}
