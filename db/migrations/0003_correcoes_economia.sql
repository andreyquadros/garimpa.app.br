-- Garimpa · correções da economia e da moderação (revisão adversarial).
-- As funções abaixo substituem as de 0002_economy.sql (create or replace); os bancos já migrados recebem só este arquivo.
--  1. settings.economia ganha chaves novas sem sobrescrever valores já editados pelo operador.
--  2. fn_award: carência de 3 dias a partir de 800 XP (nível Faiscador); o saldo pode ficar negativo (dívida) após estorno.
--  3. fn_vest_due devolve quantos lançamentos liberou (não quantos usuários tocou).
--  4. fn_reverse não trava o saldo em zero: estorno depois do gasto vira dívida, e o cache fica igual ao livro-razão.
--  5. fn_unreverse: desfaz um estorno (denúncia improcedente) com um lançamento 'devolucao' que herda a carência original.
--  6. fn_recompute_trust ignora aceites e confirmações obtidos em conluio forte (mesmo aparelho).
--  7. Dados: meta do livro-razão volta a ser objeto; resposta rejeitada deixa de ocupar o "primeiro achado" do lugar;
--     posição de perguntas fica aproximada (3 casas).

update settings set
  value = ('{"carencia_dias_veterano": 3, "xp_carencia_curta": 800}'::jsonb || value)
          || jsonb_build_object('limites_dia', '{"tambem_quero": 10, "lugares": 15}'::jsonb || coalesce(value->'limites_dia', '{}'::jsonb)),
  updated_at = now()
where key = 'economia';

-- Lança XP/pepitas. Pepitas positivas entram em carência: 7 dias; 14 para confiança baixa; 3 a partir de 800 XP.
-- Débitos (gorjeta do saldo) são recusados se deixariam o saldo negativo; um saldo negativo só nasce de estorno (dívida).
create or replace function fn_award(
  p_user uuid, p_kind text, p_xp integer, p_credits integer,
  p_ref_type text default null, p_ref_id uuid default null,
  p_meta jsonb default '{}'::jsonb, p_vest_days integer default null
) returns bigint language plpgsql as $$
declare
  v_id bigint; v_trust numeric; v_credits integer; v_xp integer; v_days integer; v_state text := 'disponivel'; v_vests timestamptz;
  v_cfg jsonb;
begin
  select trust, credits, xp into v_trust, v_credits, v_xp from users where id = p_user for update;
  if not found then raise exception 'usuario % inexistente', p_user; end if;
  select value into v_cfg from settings where key = 'economia';
  v_days := coalesce(p_vest_days,
    case when v_trust < coalesce((v_cfg->>'confianca_baixa')::numeric, 0.4)
           then coalesce((v_cfg->>'carencia_dias_baixa_confianca')::int, 14)
         when v_xp >= coalesce((v_cfg->>'xp_carencia_curta')::int, 800)
           then coalesce((v_cfg->>'carencia_dias_veterano')::int, 3)
         else coalesce((v_cfg->>'carencia_dias')::int, 7) end);
  if p_credits < 0 and v_credits + p_credits < 0 then
    raise exception 'saldo insuficiente' using errcode = 'P0001';
  end if;
  if p_credits > 0 and v_days > 0 then
    v_state := 'carencia'; v_vests := now() + make_interval(days => v_days);
  end if;
  insert into ledger(user_id, kind, xp, credits, state, vests_at, ref_type, ref_id, meta)
    values (p_user, p_kind, p_xp, p_credits, v_state, v_vests, p_ref_type, p_ref_id, coalesce(p_meta, '{}'::jsonb))
    returning id into v_id;
  update users set
    xp = greatest(0, xp + p_xp),
    credits = case when v_state = 'disponivel' then credits + p_credits else credits end,
    credits_pending = case when v_state = 'carencia' then credits_pending + p_credits else credits_pending end
  where id = p_user;
  return v_id;
end $$;

-- Libera pepitas cuja carência venceu. Devolve o número de lançamentos liberados.
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
  )
  select count(*) into n from due;
  return n;
end $$;

-- Estorna um lançamento. O saldo pode ficar negativo: quem já gastou o que foi estornado fica devendo
-- e só volta a gastar depois de cobrir a dívida (fn_award recusa débitos que deixariam o saldo negativo).
create or replace function fn_reverse(p_ledger bigint, p_reason text) returns bigint language plpgsql as $$
declare r ledger%rowtype; v_id bigint;
begin
  select * into r from ledger where id = p_ledger for update;
  if not found then raise exception 'lancamento % inexistente', p_ledger; end if;
  if r.state = 'estornado' then return null; end if;
  if exists (select 1 from ledger where reversal_of = p_ledger) then return null; end if;
  insert into ledger(user_id, kind, xp, credits, state, ref_type, ref_id, meta, reversal_of)
    values (r.user_id, 'estorno', -r.xp, -r.credits, 'disponivel', r.ref_type, r.ref_id,
            jsonb_build_object('motivo', p_reason, 'original', r.kind), p_ledger)
    returning id into v_id;
  update ledger set state = 'estornado' where id = p_ledger;
  update users set
    xp = greatest(0, xp - r.xp),
    credits = case when r.state = 'disponivel' then credits - r.credits else credits end,
    credits_pending = case when r.state = 'carencia' then credits_pending - r.credits else credits_pending end
  where id = r.user_id;
  return v_id;
end $$;

-- Desfaz o estorno de um lançamento (p_ledger é o lançamento original, hoje 'estornado').
-- Gera um lançamento 'devolucao' com os mesmos valores, que volta à carência se ela ainda não venceu
-- (mesmo vests_at) ou entra como disponível; o espelho de estorno é marcado 'estornado'.
-- A devolução é um lançamento comum: pode ser estornada de novo se a resposta voltar a cair.
create or replace function fn_unreverse(p_ledger bigint, p_reason text) returns bigint language plpgsql as $$
declare o ledger%rowtype; e ledger%rowtype; v_id bigint; v_state text; v_vests timestamptz;
begin
  select * into o from ledger where id = p_ledger for update;
  if not found then raise exception 'lancamento % inexistente', p_ledger; end if;
  if o.state <> 'estornado' then return null; end if;
  select * into e from ledger where reversal_of = p_ledger and kind = 'estorno' and state <> 'estornado'
    order by id desc limit 1 for update;
  if not found then return null; end if;
  if o.credits > 0 and o.vests_at is not null and o.vests_at > now() then
    v_state := 'carencia'; v_vests := o.vests_at;
  else
    v_state := 'disponivel'; v_vests := null;
  end if;
  insert into ledger(user_id, kind, xp, credits, state, vests_at, ref_type, ref_id, meta)
    values (o.user_id, 'devolucao', o.xp, o.credits, v_state, v_vests, o.ref_type, o.ref_id,
            jsonb_build_object('motivo', p_reason, 'original', o.kind, 'lancamento', o.id, 'estorno', e.id))
    returning id into v_id;
  update ledger set state = 'estornado' where id = e.id;
  update users set
    xp = greatest(0, xp + o.xp),
    credits = case when v_state = 'disponivel' then credits + o.credits else credits end,
    credits_pending = case when v_state = 'carencia' then credits_pending + o.credits else credits_pending end
  where id = o.user_id;
  return v_id;
end $$;

-- Confiança (0..1). Aceites e confirmações em conluio forte (mesmo aparelho) não contam: não provam nada.
create or replace function fn_recompute_trust(p_user uuid) returns numeric language plpgsql as $$
declare v_aceitas int; v_confirmadas int; v_flags int; v_age_days int; v_trust numeric;
begin
  select count(*) filter (where a.status = 'aceita'), count(*) filter (where a.status = 'confirmada')
    into v_aceitas, v_confirmadas
    from answers a
    where a.author_id = p_user
      and not exists (select 1 from ledger l where l.ref_type = 'resposta' and l.ref_id = a.id
                        and l.kind in ('resposta_aceita', 'resposta_confirmada') and l.meta->>'conluio' = 'mesmo_dispositivo');
  select count(*) into v_flags from flags f
    where f.status = 'procede' and (
      (f.target_type = 'usuario' and f.target_id = p_user) or
      (f.target_type = 'resposta' and f.target_id in (select id from answers where author_id = p_user)));
  select extract(day from now() - created_at)::int into v_age_days from users where id = p_user;
  -- Conta nova: 0,45; com uma semana: 0,50; cada resposta aceita soma 0,06 (até 8); denúncia procedente tira 0,20.
  v_trust := 0.45 + 0.06 * least(v_aceitas, 8) + 0.02 * least(v_confirmadas, 10)
             + case when v_age_days >= 7 then 0.05 else 0 end - 0.20 * v_flags;
  v_trust := greatest(0.10, least(1.00, v_trust));
  update users set trust = v_trust where id = p_user;
  return v_trust;
end $$;

-- O meta dos lançamentos feitos pela API estava gravado como string JSON (serialização dupla no cliente):
-- vira objeto de novo, para filtros como meta->>'conluio' funcionarem.
update ledger set meta = (meta #>> '{}')::jsonb where jsonb_typeof(meta) = 'string';

-- Resposta rejeitada por moderação é definitiva: libera o "primeiro achado" do lugar para a próxima resposta válida.
update answers set is_first_for_place = false where status = 'rejeitada' and is_first_for_place;

-- A posição de quem pergunta é pública: guardamos só a região aproximada (3 casas ≈ 110 m).
update questions set lat = round(lat::numeric, 3)::float8, lng = round(lng::numeric, 3)::float8
where lat is not null and lng is not null;
