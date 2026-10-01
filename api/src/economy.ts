import type { JSONValue } from 'postgres';
import type { Sql, Tx } from './db.js';

/** Níveis de garimpeiro por XP acumulado (XP nunca vira dinheiro; só pepitas). */
export const LEVELS = [
  { level: 1, name: 'Peneira', xp: 0, perk: 'Pode perguntar, responder e confirmar.' },
  { level: 2, name: 'Bateia', xp: 100, perk: 'Confirmações valem mais e gorjetas liberadas.' },
  { level: 3, name: 'Garimpeiro', xp: 300, perk: 'Cadastra lugares novos no mapa sem revisão.' },
  { level: 4, name: 'Faiscador', xp: 800, perk: 'Carência das pepitas cai para 3 dias.' },
  { level: 5, name: 'Mestre do garimpo', xp: 2000, perk: 'Pode revisar denúncias da comunidade.' },
  { level: 6, name: 'Lenda da jazida', xp: 5000, perk: 'Missões de lojas parceiras em primeira mão.' },
  { level: 7, name: 'Guardião do mapa', xp: 12000, perk: 'Nome no mapa de Ariquemes.' },
] as const;

export function levelFor(xp: number) {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) current = l;
  const next = LEVELS.find((l) => l.xp > current.xp) ?? null;
  const span = next ? next.xp - current.xp : 1;
  const progress = next ? Math.min(1, (xp - current.xp) / span) : 1;
  return { ...current, next, progress, toNext: next ? next.xp - xp : 0 };
}

/** Valores padrão; em produção são lidos de settings.economia (mesma forma). */
export const DEFAULT_ECONOMY = {
  xp: {
    pergunta: 5, tambem_quero: 2, resposta_com_evidencia: 15, resposta_aceita: 50,
    resposta_confirmada: 20, confirmar: 3, confirmacao_validada: 5, primeiro_achado: 10,
    aceitar_resposta: 10, streak_por_dia: 2, streak_maximo: 14,
  },
  pepitas: {
    resposta_aceita: 50, resposta_confirmada: 20, confirmacao_validada: 5, primeiro_achado: 10,
    fracao_segundo_achado: 0.25, gorjeta_por_pergunta: 20, bounty_tambem_quero: 5, bounty_maximo: 100,
  },
  limites_dia: { perguntas: 10, respostas: 20, confirmacoes: 30, gorjetas_orcamento: 30, pepitas_cunhadas: 300, uploads: 40, tambem_quero: 10, lugares: 15 },
  carencia_dias: 7,
  carencia_dias_baixa_confianca: 14,
  /** A partir deste XP (nível Faiscador) a carência cai para `carencia_dias_veterano`. */
  xp_carencia_curta: 800,
  carencia_dias_veterano: 3,
  confianca_baixa: 0.4,
  confirmacoes_para_validar: 2,
  evidencia_forte: 60,
  conversao: { pepitas_por_real: 100, minimo_resgate_pepitas: 2000, percentual_cofre: 0.3, janela: 'mensal' },
  expiracao_meses: 12,
};
export type Economy = typeof DEFAULT_ECONOMY;

export async function loadEconomy(sql: Sql): Promise<Economy> {
  // value::text evita que o transform camelCase do cliente reescreva as chaves do JSON.
  const rows = await sql<{ v: string }[]>`select value::text as v from settings where key = 'economia'`;
  const v = rows[0]?.v ? (JSON.parse(rows[0].v) as Partial<Economy>) : null;
  if (!v) return DEFAULT_ECONOMY;
  // Mescla por seção: uma chave nova no código continua valendo mesmo que settings.economia ainda não a tenha.
  return {
    ...DEFAULT_ECONOMY, ...v,
    xp: { ...DEFAULT_ECONOMY.xp, ...v.xp },
    pepitas: { ...DEFAULT_ECONOMY.pepitas, ...v.pepitas },
    limites_dia: { ...DEFAULT_ECONOMY.limites_dia, ...v.limites_dia },
    conversao: { ...DEFAULT_ECONOMY.conversao, ...v.conversao },
  };
}

export type AwardKind =
  | 'pergunta' | 'tambem_quero' | 'resposta_com_evidencia' | 'resposta_aceita' | 'resposta_confirmada'
  | 'confirmar' | 'confirmacao_validada' | 'primeiro_achado' | 'aceitar_resposta' | 'gorjeta_recebida'
  | 'gorjeta_enviada' | 'bonus_streak' | 'badge' | 'lugar_novo' | 'ajuste' | 'estorno' | 'devolucao';

export async function award(
  db: Sql | Tx,
  userId: string,
  kind: AwardKind,
  xp: number,
  credits: number,
  ref?: { type: string; id: string },
  meta: Record<string, unknown> = {},
  vestDays?: number,
): Promise<number> {
  // O objeto vai direto: o cliente já serializa jsonb. Com JSON.stringify aqui ele seria serializado duas vezes
  // e o meta ficaria gravado como string JSON, invisível para filtros `meta->>'chave'` no SQL.
  const rows = await db<{ fnAward: string }[]>`
    select fn_award(${userId}::uuid, ${kind}, ${Math.round(xp)}, ${Math.round(credits)},
                    ${ref?.type ?? null}, ${ref?.id ?? null}::uuid, ${db.json(meta as JSONValue)},
                    ${vestDays ?? null}::int)`;
  return Number(rows[0]!.fnAward);
}

export async function takeCap(db: Sql | Tx, userId: string, kind: string, max: number, amount = 1): Promise<boolean> {
  const rows = await db<{ fnCapTake: boolean }[]>`select fn_cap_take(${userId}::uuid, ${kind}, ${max}, ${amount})`;
  return rows[0]!.fnCapTake;
}

/**
 * Teto diário de pepitas cunhadas (limites_dia.pepitas_cunhadas), tomado por quem recebe.
 * Só cunhagem passa por aqui (aceite, confirmação, gorjeta do orçamento); gorjeta do saldo é transferência.
 * Devolve false quando o lançamento não cabe no teto: a rota mantém o XP e zera as pepitas (meta teto_diario).
 */
export async function takeMintCap(db: Sql | Tx, userId: string, eco: Economy, credits: number): Promise<boolean> {
  if (credits <= 0) return true;
  return takeCap(db, userId, 'pepitas_cunhadas', eco.limites_dia.pepitas_cunhadas, credits);
}

export async function grantBadge(db: Sql | Tx, userId: string, slug: string): Promise<boolean> {
  const inserted = await db<{ badgeSlug: string }[]>`
    insert into user_badges(user_id, badge_slug) values (${userId}::uuid, ${slug})
    on conflict do nothing returning badge_slug`;
  if (inserted.length === 0) return false;
  const b = await db<{ xpBonus: number }[]>`select xp_bonus from badges where slug = ${slug}`;
  const bonus = b[0]?.xpBonus ?? 0;
  if (bonus > 0) await award(db, userId, 'badge', bonus, 0, { type: 'badge', id: userId }, { badge: slug }, 0);
  return true;
}

/** Streak: XP pequeno por dia consecutivo (teto), sem pepitas — presença não vira dinheiro. */
export async function touchStreak(db: Sql, userId: string, eco: Economy): Promise<number> {
  // last_active_on::text evita comparar Date com string (o que premiaria a sequência a cada chamada).
  const before = await db<{ lastActiveOn: string | null }[]>`select last_active_on::text as last_active_on from users where id = ${userId}::uuid`;
  const rows = await db<{ fnTouchStreak: number }[]>`select fn_touch_streak(${userId}::uuid)`;
  const streak = rows[0]!.fnTouchStreak;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Porto_Velho' });
  if (before[0]?.lastActiveOn !== today && streak > 1) {
    const xp = Math.min(eco.xp.streak_maximo, eco.xp.streak_por_dia * (streak - 1));
    await award(db, userId, 'bonus_streak', xp, 0, undefined, { streak }, 0);
    if (streak >= 7) await grantBadge(db, userId, 'maratonista');
  }
  return streak;
}
