-- Garimpa · motor de pontos (XP + pepitas) em funções transacionais.
-- Regras numéricas ficam em settings.economia e são espelhadas em api/src/economy.ts.

insert into settings(key, value) values ('economia', $json$
{
  "xp": {
    "pergunta": 5, "tambem_quero": 2, "resposta_com_evidencia": 15, "resposta_aceita": 50,
    "resposta_confirmada": 20, "confirmar": 3, "confirmacao_validada": 5, "primeiro_achado": 10,
    "aceitar_resposta": 10, "streak_por_dia": 2, "streak_maximo": 14
  },
  "pepitas": {
    "resposta_aceita": 50, "resposta_confirmada": 20, "confirmacao_validada": 5,
    "primeiro_achado": 10, "fracao_segundo_achado": 0.25, "gorjeta_por_pergunta": 20,
    "bounty_tambem_quero": 5, "bounty_maximo": 100
  },
  "limites_dia": {
    "perguntas": 10, "respostas": 20, "confirmacoes": 30, "gorjetas_orcamento": 30,
    "pepitas_cunhadas": 300, "uploads": 40
  },
  "carencia_dias": 7, "carencia_dias_baixa_confianca": 14, "confianca_baixa": 0.4,
  "confirmacoes_para_validar": 2, "evidencia_forte": 60,
  "conversao": { "pepitas_por_real": 100, "minimo_resgate_pepitas": 2000, "percentual_cofre": 0.30, "janela": "mensal" },
  "expiracao_meses": 12
}
$json$::jsonb) on conflict (key) do nothing;

insert into badges(slug, name, description, icon, xp_bonus) values
  ('fundador',        'Fundador',            'Entrou no piloto de Ariquemes.',                              'flag',     20),
  ('primeiro_achado', 'Primeiro achado',     'Teve a primeira resposta aceita por quem perguntou.',          'gem',      30),
  ('olho_de_lince',   'Olho de lince',       'Cinco primeiros achados em lugares diferentes.',               'eye',      80),
  ('bateia',          'Bateia',              'Confirmou dez achados de outras pessoas indo até o lugar.',    'disc',     50),
  ('bom_de_prova',    'Bom de prova',        'Dez evidências fortes (foto com local e data batendo).',       'camera',   60),
  ('maratonista',     'Maratonista',         'Sete dias seguidos garimpando.',                               'flame',    40),
  ('mao_aberta',      'Mão aberta',          'Deu dez gorjetas para quem ajudou.',                           'hand',     30),
  ('cartografo',      'Cartógrafo',          'Cadastrou cinco lugares novos no mapa.',                       'map',      40),
  ('garimpeiro_semana','Garimpeiro da semana','Terminou uma semana no topo do ranking.',                     'trophy',  100)
on conflict (slug) do nothing;

-- Lança XP/pepitas para um usuário. Pepitas positivas entram em carência (7 dias; 14 para confiança baixa).
create or replace function fn_award(
  p_user uuid, p_kind text, p_xp integer, p_credits integer,
  p_ref_type text default null, p_ref_id uuid default null,
  p_meta jsonb default '{}'::jsonb, p_vest_days integer default null
) returns bigint language plpgsql as $$
declare
  v_id bigint; v_trust numeric; v_credits integer; v_days integer; v_state text := 'disponivel'; v_vests timestamptz;
  v_cfg jsonb;
begin
  select trust, credits into v_trust, v_credits from users where id = p_user for update;
  if not found then raise exception 'usuario % inexistente', p_user; end if;
  select value into v_cfg from settings where key = 'economia';
  v_days := coalesce(p_vest_days,
    case when v_trust < coalesce((v_cfg->>'confianca_baixa')::numeric, 0.4)
         then coalesce((v_cfg->>'carencia_dias_baixa_confianca')::int, 14)
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
    credits = case when v_state = 'disponivel' then greatest(0, credits + p_credits) else credits end,
    credits_pending = case when v_state = 'carencia' then credits_pending + p_credits else credits_pending end
  where id = p_user;
  return v_id;
end $$;

-- Libera pepitas cuja carência venceu. Chamada periodicamente pela API.
create or replace function fn_vest_due() returns integer language plpgsql as $$
declare n integer;
begin
  with due as (
    update ledger set state = 'disponivel'
    where state = 'carencia' and vests_at <= now()
    returning user_id, credits
  ), agg as (select user_id, sum(credits)::int as c from due group by user_id)
  update users u set credits = u.credits + a.c, credits_pending = greatest(0, u.credits_pending - a.c)
  from agg a where a.user_id = u.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Estorna um lançamento (fraude confirmada, resposta removida). Gera lançamento espelho e corrige saldos.
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
    credits = case when r.state = 'disponivel' then greatest(0, credits - r.credits) else credits end,
    credits_pending = case when r.state = 'carencia' then greatest(0, credits_pending - r.credits) else credits_pending end
  where id = r.user_id;
  return v_id;
end $$;

-- Limite diário atômico (dia no fuso de Rondônia). Retorna true se a ação cabe no limite.
create or replace function fn_cap_take(p_user uuid, p_kind text, p_max integer, p_amount integer default 1)
returns boolean language plpgsql as $$
declare v integer;
begin
  insert into daily_caps(user_id, day, kind, count)
    values (p_user, (now() at time zone 'America/Porto_Velho')::date, p_kind, p_amount)
  on conflict (user_id, day, kind) do update set count = daily_caps.count + excluded.count
  returning count into v;
  if v > p_max then
    update daily_caps set count = count - p_amount
      where user_id = p_user and day = (now() at time zone 'America/Porto_Velho')::date and kind = p_kind;
    return false;
  end if;
  return true;
end $$;

-- Confiança (0..1): cresce com respostas aceitas/confirmadas e idade da conta, cai com denúncias procedentes.
create or replace function fn_recompute_trust(p_user uuid) returns numeric language plpgsql as $$
declare v_aceitas int; v_confirmadas int; v_flags int; v_age_days int; v_trust numeric;
begin
  select count(*) filter (where status = 'aceita'), count(*) filter (where status = 'confirmada')
    into v_aceitas, v_confirmadas from answers where author_id = p_user;
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

-- Streak diário: chamada no primeiro acesso autenticado do dia.
create or replace function fn_touch_streak(p_user uuid) returns integer language plpgsql as $$
declare v_today date := (now() at time zone 'America/Porto_Velho')::date; v_last date; v_streak int;
begin
  select last_active_on, streak_days into v_last, v_streak from users where id = p_user for update;
  if v_last = v_today then return v_streak; end if;
  v_streak := case when v_last = v_today - 1 then v_streak + 1 else 1 end;
  update users set last_active_on = v_today, streak_days = v_streak where id = p_user;
  return v_streak;
end $$;

-- Distância de Hamming entre dois hashes perceptuais (0 = idênticos; <= 6 = mesma foto).
create or replace function fn_hamming(a bit(64), b bit(64)) returns integer
  language sql immutable parallel safe as $$ select length(replace((a # b)::text, '0', '')) $$;
