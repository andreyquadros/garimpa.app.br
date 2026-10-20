-- Notificações: lista no app + fila de envio (Web Push) e as inscrições por aparelho.
-- fn_vest_due passa a avisar quem teve pepitas liberadas, na mesma transação da liberação.

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null check (kind in
                  ('nova_evidencia', 'evidencia_confirmada', 'evidencia_aceita', 'gorjeta_recebida', 'pepitas_liberadas')),
  title         text not null,
  body          text not null,
  url           text not null,
  topic         text,
  ref_type      text,
  ref_id        uuid,
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  push_state    text not null default 'pendente'
                  check (push_state in ('pendente', 'enviado', 'sem_assinatura', 'desativado', 'falhou')),
  push_attempts integer not null default 0,
  push_next_at  timestamptz not null default now()
);

create index notifications_user_created_idx on notifications (user_id, created_at desc);
-- Índice parcial: o remetente só olha o que ainda está na fila.
create index notifications_push_queue_idx on notifications (push_next_at) where push_state = 'pendente';

create table push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failures        integer not null default 0
);

create index push_subscriptions_user_idx on push_subscriptions (user_id);

-- Mesmo comportamento de antes (libera a carência vencida, soma em users.credits, devolve o número de lançamentos),
-- mais um aviso por pessoa com a soma liberada. O texto precisa bater com texts.pepitasLiberadas (api/src/notifications).
-- Conta removida (banned_at) não recebe aviso.
create or replace function fn_vest_due() returns integer language plpgsql as $$
declare n integer;
begin
  with due as (
    update ledger set state = 'disponivel'
    where state = 'carencia' and vests_at <= now()
    returning user_id, credits
  ), agg as (select user_id, sum(credits)::int as c from due group by user_id),
  upd as (
    update users u set credits = u.credits + a.c, credits_pending = greatest(0, u.credits_pending - a.c)
    from agg a where a.user_id = u.id returning u.id
  ), notif as (
    insert into notifications (user_id, kind, title, body, url, topic, ref_type, ref_id)
    select a.user_id, 'pepitas_liberadas', 'Pepitas liberadas', a.c || ' pepitas liberadas na sua carteira',
           '/carteira', 'pepitas', 'ledger', null
    from agg a join users u on u.id = a.user_id
    where a.c > 0 and u.banned_at is null
    returning 1
  )
  select count(*) into n from due;
  return n;
end $$;
