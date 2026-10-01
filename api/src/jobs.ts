import type { Sql } from './db.js';
import { grantBadge } from './economy.js';

/** Tarefas periódicas: libera carências e premia o garimpeiro da semana. Idempotente. */
export async function runTick(sql: Sql): Promise<{ vested: number; weeklyBadge: string | null }> {
  const vested = Number((await sql<{ fnVestDue: number }[]>`select fn_vest_due()`)[0]?.fnVestDue ?? 0);
  const week = (await sql<{ w: string }[]>`select to_char(date_trunc('week', (now() at time zone 'America/Porto_Velho') - interval '7 days'), 'IYYY-IW') as w`)[0]!.w;
  const done = await sql<{ value: string }[]>`select value #>> '{}' as value from settings where key = 'semana_premiada'`;
  let weeklyBadge: string | null = null;
  if (done[0]?.value !== week) {
    const top = await sql<{ userId: string }[]>`
      select user_id from ledger
      where xp > 0 and state <> 'estornado' and created_at >= (date_trunc('week', (now() at time zone 'America/Porto_Velho') - interval '7 days')) at time zone 'America/Porto_Velho'
        and created_at < (date_trunc('week', now() at time zone 'America/Porto_Velho')) at time zone 'America/Porto_Velho'
      group by user_id order by sum(xp) desc limit 1`;
    if (top[0]) { await grantBadge(sql, top[0].userId, 'garimpeiro_semana'); weeklyBadge = top[0].userId; }
    await sql`insert into settings(key, value) values ('semana_premiada', to_jsonb(${week}::text)) on conflict (key) do update set value = excluded.value, updated_at = now()`;
  }
  return { vested, weeklyBadge };
}
