import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const asset = (p: string) => `${base}/brand/${p}`;

/** Símbolo "p" na pepita de ouro (SVG do pacote de identidade). `light` para fundos escuros. */
export function Symbol({ size = 32, light = false, className = '' }: { size?: number; light?: boolean; className?: string }) {
  return <img src={asset(light ? 'id/symbol-light.svg' : 'id/symbol.svg')} width={size} height={size} alt="" aria-hidden="true" className={`shrink-0 ${className}`} draggable={false} />;
}

/** Marca horizontal: símbolo + "pepita social" em Manrope. `tone` acompanha o fundo. */
export function Wordmark({ size = 28, tone = 'ink', className = '' }: { size?: number; tone?: 'ink' | 'light'; className?: string }) {
  const color = tone === 'light' ? 'text-creme' : 'text-floresta-700';
  const soft = tone === 'light' ? 'text-lima-400' : 'text-esmeralda-600';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Pepita Social">
      <Symbol size={size * 1.15} light={tone === 'light'} />
      <span className={`font-display font-extrabold leading-none ${color}`} style={{ fontSize: size, letterSpacing: '-0.03em' }}>
        pepita<span className={`font-semibold ${soft}`}>social</span>
      </span>
    </span>
  );
}

export type PepiPose = 'explorador' | 'comemorando';

/** Pepi, a pepita que ajuda. Flutua de leve em repouso; `celebrate` dá o pulo da conquista. */
export function Pepi({ pose = 'explorador', size = 160, celebrate = false, className = '', style }: { pose?: PepiPose; size?: number; celebrate?: boolean; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  const src = asset(`pepi/${pose}${size <= 256 ? '-256' : ''}.webp`);
  return (
    <motion.img
      src={src} width={size} height={size} alt={pose === 'comemorando' ? 'Pepi comemorando' : 'Pepi, a pepita exploradora'} draggable={false}
      className={`select-none ${className}`} style={{ width: size, height: size, ...style }}
      initial={celebrate ? { scale: 0.4, rotate: -12, opacity: 0 } : false}
      animate={reduce ? { opacity: 1 } : celebrate ? { scale: [0.4, 1.12, 1], rotate: [-12, 4, 0], opacity: 1, y: [0, -8, 0] } : { y: [0, -6, 0] }}
      transition={celebrate ? { duration: 0.9, times: [0, 0.6, 1], ease: 'easeOut' } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export type AnimName = 'pin-pulse' | 'search-radar' | 'gratitude-pop' | 'xp-rise';

/** Animações do pacote (SVG com CSS animado; WebP como reserva). Rodam em loop sem JavaScript. */
export function Anim({ name, size = 96, className = '', label }: { name: AnimName; size?: number; className?: string; label?: string }) {
  const reduce = useReducedMotion();
  return (
    <picture className={`inline-block ${className}`} style={{ width: size, height: size }}>
      {!reduce && <source srcSet={asset(`anim/${name}.svg`)} type="image/svg+xml" />}
      <img src={asset(`anim/${name}.webp`)} width={size} height={size} alt={label ?? ''} aria-hidden={label ? undefined : 'true'} draggable={false} style={{ width: size, height: size }} />
    </picture>
  );
}

const RANK_FILE: Record<number, string> = { 1: 'rank-explorer', 2: 'rank-finder', 3: 'rank-guide', 4: 'rank-guardian', 5: 'rank-legend' };

/** Insígnia da patente (1 a 5). */
export function RankBadge({ level, size = 72, className = '', dim = false }: { level: number; size?: number; className?: string; dim?: boolean }) {
  const file = RANK_FILE[Math.min(5, Math.max(1, level))]!;
  return <img src={asset(`conquistas/${file}.svg`)} width={size} height={size * 1.35} alt="" aria-hidden="true" draggable={false} className={`${dim ? 'opacity-40 grayscale' : ''} ${className}`} style={{ width: size, height: size * 1.35 }} />;
}

/** Pepita de ouro (ícone de moeda) e estrela de XP, do pacote. */
export function NuggetIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <img src={asset('conquistas/nugget.svg')} width={size} height={size} alt="" aria-hidden="true" className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }} draggable={false} />;
}
export function XpStar({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <img src={asset('conquistas/xp-star.svg')} width={size} height={size} alt="" aria-hidden="true" className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }} draggable={false} />;
}

/** Ilustrações de estado do pacote: sem resultados, offline, em análise. */
export function StateArt({ kind, className = '' }: { kind: 'no-results' | 'offline' | 'pending'; className?: string }) {
  return <img src={asset(`estados/${kind}.svg`)} alt="" aria-hidden="true" className={`mx-auto w-full max-w-[260px] ${className}`} draggable={false} />;
}
