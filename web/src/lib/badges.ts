import { Camera, Disc, Eye, Flag, Flame, Gem, Hand, Map, Trophy } from 'lucide-react';
import { BADGES as DATA } from './economy';

const ICON: Record<string, typeof Flag> = { fundador: Flag, primeiro_achado: Gem, olho_de_lince: Eye, bateia: Disc, bom_de_prova: Camera, maratonista: Flame, mao_aberta: Hand, cartografo: Map, garimpeiro_semana: Trophy };
const NAME: Record<string, string> = { primeiro_achado: 'Primeira descoberta', bom_de_prova: 'Boa evidência', garimpeiro_semana: 'Destaque da semana' };
const TEXT: Record<string, string> = {
  primeiro_achado: 'Teve a primeira evidência aceita.', olho_de_lince: 'Cinco primeiras descobertas em lugares diferentes.', bateia: 'Confirmou dez descobertas indo até o lugar.',
  bom_de_prova: 'Dez evidências fortes.', maratonista: 'Sete dias seguidos ajudando.', mao_aberta: 'Agradeceu dez vezes com pepitas.', cartografo: 'Cadastrou cinco lugares novos.', garimpeiro_semana: 'Topo do ranking semanal.',
};

/** Conquistas com ícone Lucide e textos na voz do app (dados vêm de economy.ts, iguais aos do banco). */
export const BADGES = DATA.map((b) => ({ slug: b.slug, name: NAME[b.slug] ?? b.name, description: TEXT[b.slug] ?? b.description, xpBonus: b.xpBonus, icon: ICON[b.slug] ?? Flag }));
export const badgeBySlug = (slug: string) => BADGES.find((b) => b.slug === slug);
