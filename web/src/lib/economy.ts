/**
 * Constantes da economia compartilhadas com a API (cópia de api/src/economy.ts).
 * Usadas pelo modo demonstração (API falsa no navegador); em produção o front lê /api/config.
 */
export const LEVELS = [
  { level: 1, name: 'Explorador', xp: 0, perk: 'Abre missões, envia evidências e confirma achados.', motto: 'O primeiro passo é descobrir.' },
  { level: 2, name: 'Garimpeiro', xp: 100, perk: 'Confirmações valem mais e agradecimentos saem do próprio saldo.', motto: 'Você já sabe seguir boas pistas.' },
  { level: 3, name: 'Guia local', xp: 350, perk: 'Cadastra lugares novos sem revisão e leva o título no ranking.', motto: 'Sua experiência orienta a cidade.' },
  { level: 4, name: 'Guardião', xp: 900, perk: 'Carência das pepitas cai para 3 dias e revisa denúncias.', motto: 'Ajude a manter pistas confiáveis.' },
  { level: 5, name: 'Lenda local', xp: 1800, perk: 'Missões de parceiros em primeira mão e nome no mapa.', motto: 'Uma referência para a comunidade.' },
] as const;

export function levelFor(xp: number) {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) current = l;
  const next = LEVELS.find((l) => l.xp > current.xp) ?? null;
  const span = next ? next.xp - current.xp : 1;
  const progress = next ? Math.min(1, (xp - current.xp) / span) : 1;
  return { ...current, next, progress, toNext: next ? next.xp - xp : 0 };
}

/** Valores padrão da economia (mesma forma de settings.economia no banco). */
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
  confianca_baixa: 0.4,
  /** A partir deste XP (patente Guardião) a carência cai para `carencia_dias_veterano`. */
  xp_carencia_curta: 900,
  carencia_dias_veterano: 3,
  confirmacoes_para_validar: 2,
  evidencia_forte: 60,
  conversao: { pepitas_por_real: 100, minimo_resgate_pepitas: 2000, percentual_cofre: 0.3, janela: 'mensal' },
  expiracao_meses: 12,
};
export type Economy = typeof DEFAULT_ECONOMY;

/** Conquistas (cópia de db/migrations/0002_economy.sql). */
export const BADGES = [
  { slug: 'fundador', name: 'Fundador', description: 'Entrou no piloto de Ariquemes.', icon: 'flag', xpBonus: 20 },
  { slug: 'primeiro_achado', name: 'Primeiro achado', description: 'Teve a primeira resposta aceita por quem perguntou.', icon: 'gem', xpBonus: 30 },
  { slug: 'olho_de_lince', name: 'Olho de lince', description: 'Cinco primeiros achados em lugares diferentes.', icon: 'eye', xpBonus: 80 },
  { slug: 'bateia', name: 'Bateia', description: 'Confirmou dez achados de outras pessoas indo até o lugar.', icon: 'disc', xpBonus: 50 },
  { slug: 'bom_de_prova', name: 'Bom de prova', description: 'Dez evidências fortes (foto com local e data batendo).', icon: 'camera', xpBonus: 60 },
  { slug: 'maratonista', name: 'Maratonista', description: 'Sete dias seguidos garimpando.', icon: 'flame', xpBonus: 40 },
  { slug: 'mao_aberta', name: 'Mão aberta', description: 'Deu dez gorjetas para quem ajudou.', icon: 'hand', xpBonus: 30 },
  { slug: 'cartografo', name: 'Cartógrafo', description: 'Cadastrou cinco lugares novos no mapa.', icon: 'map', xpBonus: 40 },
  { slug: 'garimpeiro_semana', name: 'Garimpeiro da semana', description: 'Terminou uma semana no topo do ranking.', icon: 'trophy', xpBonus: 100 },
] as const;
