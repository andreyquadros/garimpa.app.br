export const CATEGORIES: Array<{ id: string; label: string; emoji: string }> = [
  { id: 'casa', label: 'Casa', emoji: '🏠' }, { id: 'eletronicos', label: 'Eletrônicos', emoji: '🔌' }, { id: 'ferramentas', label: 'Ferramentas', emoji: '🔧' },
  { id: 'saude', label: 'Saúde', emoji: '💊' }, { id: 'alimentos', label: 'Alimentos', emoji: '🥦' }, { id: 'pets', label: 'Pets', emoji: '🐾' },
  { id: 'roupas', label: 'Roupas', emoji: '👕' }, { id: 'papelaria', label: 'Papelaria', emoji: '✏️' }, { id: 'auto', label: 'Auto', emoji: '🚗' },
  { id: 'bebe', label: 'Bebê', emoji: '🍼' }, { id: 'esporte', label: 'Esporte', emoji: '⚽' }, { id: 'outros', label: 'Outros', emoji: '📦' },
];
export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]!;

export const KINDS: Record<string, string> = { loja: 'Loja', mercado: 'Mercado', farmacia: 'Farmácia', feira: 'Feira', servico: 'Serviço', outro: 'Outro' };

export function brl(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
/**
 * Converte o preço digitado em centavos. Aceita "24,90", "24.90", "24", "1.249,90" e "R$ 24,90";
 * com um único separador ele é decimal (teclados Android no modo decimal só oferecem ponto).
 * "24.999" segue a grafia brasileira (R$ 24.999,00). Devolve undefined para vazio ou inválido (negativo, letras, "1,249.90").
 */
export function parseBrlToCents(input: string): number | undefined {
  const t = input.trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (!t) return undefined;
  let norm: string;
  if (/^\d+([.,]\d{1,2})?$/.test(t)) norm = t.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) norm = t.replace(/\./g, '').replace(',', '.');
  else return undefined;
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}
export function dist(m: number | null | undefined): string {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}
export function timeAgo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const days = Math.floor(s / 86400);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
export const STATUS_LABEL: Record<string, string> = { aberta: 'Procurando', respondida: 'Tem pista', resolvida: 'Achado', fechada: 'Fechada' };
export const ANSWER_STATUS: Record<string, string> = { pendente: 'Aguardando confirmação', aceita: 'Achado aceito', confirmada: 'Confirmado pela comunidade', rejeitada: 'Rejeitada', oculta: 'Oculta' };
export const FLAG_LABEL: Record<string, string> = {
  sem_gps: 'foto sem GPS', sem_data: 'foto sem data', longe_do_local: 'GPS longe da loja', foto_antiga: 'foto antiga', enviada_de_longe: 'enviada longe da loja', foto_reutilizada: 'foto repetida', foto_parecida: 'foto parecida com outra', texto_copiado: 'texto copiado',
};
export const KIND_LABEL: Record<string, string> = {
  pergunta: 'Perguntou', tambem_quero: 'Também quer', resposta_com_evidencia: 'Respondeu com prova', resposta_aceita: 'Achado aceito', resposta_confirmada: 'Achado confirmado',
  confirmar: 'Confirmou um achado', confirmacao_validada: 'Confirmação validada', primeiro_achado: 'Primeiro achado', aceitar_resposta: 'Aceitou uma resposta',
  gorjeta_recebida: 'Gorjeta recebida', gorjeta_enviada: 'Gorjeta enviada', bonus_streak: 'Sequência de dias', badge: 'Conquista', lugar_novo: 'Lugar novo no mapa', ajuste: 'Ajuste', estorno: 'Estorno', devolucao: 'Devolução de estorno',
};
export function pluralize(n: number, one: string, many: string) { return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`; }
