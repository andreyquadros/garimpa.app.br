import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, X } from 'lucide-react';
import { NuggetIcon, StateArt, Symbol, XpStar } from './brand';

/** Compatibilidade: a pepita do pacote substitui o ícone desenhado à mão. */
export function PepitaIcon({ size = 18, className = '' }: { size?: number; className?: string }) { return <NuggetIcon size={size} className={className} />; }
export function Logo({ size = 28 }: { size?: number }) { return <Symbol size={size} />; }

type Variant = 'primary' | 'secondary' | 'gold' | 'lime' | 'ghost' | 'soft' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:brightness-95 shadow-float',
  secondary: 'bg-surface text-brand-ink border border-line hover:bg-surface-2',
  gold: 'bg-ouro-400 text-floresta-900 hover:bg-ouro-500 shadow-ouro',
  lime: 'bg-lima-400 text-floresta-900 hover:bg-lima-300 shadow-lima',
  ghost: 'bg-transparent text-ink hover:bg-surface-2 border border-line',
  soft: 'bg-accent-soft text-ink hover:bg-floresta-100',
  danger: 'bg-brasa-100 text-brasa-700 hover:bg-brasa-500 hover:text-white',
};
export function Button({ variant = 'primary', size = 'md', loading, arrow, className = '', children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; arrow?: boolean }) {
  const sz = size === 'sm' ? 'h-9 px-3.5 text-sm' : size === 'lg' ? 'h-14 px-6 text-base' : 'h-12 px-5 text-[15px]';
  return (
    <motion.button whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`press inline-flex items-center justify-center gap-2 rounded-full font-display font-bold tracking-tight disabled:opacity-40 disabled:saturate-50 disabled:pointer-events-none ${sz} ${variants[variant]} ${className}`}
      disabled={loading || disabled} {...(rest as object)}>
      {loading ? <Spinner size={18} /> : <>{children}{arrow && <ArrowRight size={18} strokeWidth={2.5} className="ml-auto" />}</>}
    </motion.button>
  );
}

/** Controle segmentado com um indicador que desliza (a seleção vem de algum lugar e vai para outro). */
export function Segmented<T extends string>({ value, onChange, options, id, className = '' }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: ReactNode }>; id: string; className?: string }) {
  return (
    <div role="tablist" className={`segmented ${className}`}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)} className="font-display">
          {value === o.id && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Entrada da tela: o protagonista chega primeiro, o resto segue na ordem de leitura (só na primeira montagem). */
const revealParent = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } } };
const revealChild = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.2, 0.8, 0.2, 1] as const } } };
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} variants={revealParent} initial="hidden" animate="show">{children}</motion.div>;
}
export function RevealItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} variants={revealChild}>{children}</motion.div>;
}

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-[3px] border-current border-t-transparent ${className}`} style={{ width: size, height: size }} aria-label="carregando" />;
}

export function Chip({ active, children, onClick, className = '' }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`press shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-sm font-semibold border ${active ? 'bg-lima-400 text-floresta-900 border-lima-400 dark:bg-lima-400/15 dark:text-lima-400 dark:border-lima-400/40' : 'bg-surface text-ink-2 border-line hover:bg-surface-2'} ${className}`}>
      {children}
    </button>
  );
}

/** Rótulo de estado com forma + ícone + texto, nunca só cor (guia visual). */
export function StatusChip({ tone, icon, children, className = '' }: { tone: 'ok' | 'wait' | 'warn' | 'sponsor' | 'muted'; icon?: ReactNode; children: ReactNode; className?: string }) {
  const t = { ok: 'bg-esmeralda-100 text-esmeralda-800', wait: 'bg-surface-2 text-ink-2', warn: 'bg-ouro-100 text-ouro-700', sponsor: 'bg-brand text-on-brand', muted: 'bg-surface-2 text-ink-2' }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-xs font-bold ${t} ${className}`}>{icon}{children}</span>;
}

export function Avatar({ name, url, size = 36, lime = false }: { name: string; url?: string | null; size?: number; lime?: boolean }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return url
    ? <img src={url} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
    : <span className={`rounded-full grid place-items-center font-display font-extrabold shrink-0 ${lime ? 'bg-lima-400 text-floresta-900' : 'bg-brand text-on-brand'}`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{initials}</span>;
}

export function Field({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-ink mb-1.5">{label}</span>
      <input {...rest} className={`w-full h-13 rounded-2xl border bg-surface px-4 text-base font-semibold outline-none focus:border-esmeralda-600 ${error ? 'border-brasa-500' : 'border-line'} ${rest.className ?? ''}`} />
      {error ? <span className="block text-sm text-brasa-ink mt-1">{error}</span> : hint ? <span className="block text-sm text-ink-2 mt-1">{hint}</span> : null}
    </label>
  );
}
export function TextArea({ label, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-ink mb-1.5">{label}</span>
      <textarea {...rest} className={`w-full min-h-24 rounded-2xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-esmeralda-600 ${rest.className ?? ''}`} />
      {hint && <span className="block text-sm text-ink-2 mt-1">{hint}</span>}
    </label>
  );
}

/** Folha inferior: detalhes e ações secundárias ficam ao alcance do polegar. */
export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-floresta-900/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-sheet bg-surface shadow-float overflow-y-auto safe-bottom ${tall ? 'max-h-[92dvh]' : 'max-h-[82dvh]'}`}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
            <div className="sticky top-0 bg-surface/95 backdrop-blur pt-2 pb-1 px-5 flex items-center gap-3">
              <span className="h-1.5 w-10 rounded-full bg-line absolute left-1/2 -translate-x-1/2 top-2" />
              {title && <h2 className="font-display font-extrabold text-xl mt-3 flex-1">{title}</h2>}
              <button type="button" onClick={onClose} aria-label="Fechar" className="mt-3 ml-auto h-9 w-9 grid place-items-center rounded-full hover:bg-surface-2"><X size={20} /></button>
            </div>
            <div className="px-5 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Selo que "cai" sobre o cartão quando algo é confirmado ou aceito. */
export function Stamp({ children, tone = 'gold', className = '' }: { children: ReactNode; tone?: 'gold' | 'green' | 'brasa' | 'ink'; className?: string }) {
  const color = { gold: 'text-gold-ink', green: 'text-green-ink', brasa: 'text-brasa-ink', ink: 'text-ink-2' }[tone];
  return (
    <motion.span initial={{ scale: 1.6, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      className={`stamp inline-block ${color} ${className}`}>{children}</motion.span>
  );
}

export function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const controls = animate(prev.current, value, { duration: 0.9, ease: 'easeOut', onUpdate: (v) => setDisplay(Math.round(v)) });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return <span className={`tabular ${className}`}>{display.toLocaleString('pt-BR')}</span>;
}

export function PepitaPill({ value, pending, size = 'md' }: { value: number; pending?: number; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-ouro-100 text-ouro-700 font-display font-extrabold ${size === 'sm' ? 'h-7 px-2 text-sm' : 'h-9 px-3 text-base'}`} title={pending ? `${pending} em carência` : undefined}>
      <NuggetIcon size={size === 'sm' ? 14 : 18} />
      <AnimatedNumber value={value} />
      {pending ? <span className="text-xs font-bold opacity-70">+{pending}</span> : null}
    </span>
  );
}

export function XpChip({ xp, size = 'md' }: { xp: number; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface border border-line font-display font-extrabold text-brand-ink ${size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-10 px-3.5 text-base'}`}>
      <XpStar size={size === 'sm' ? 16 : 20} /><AnimatedNumber value={xp} /><span className="text-[11px] font-bold text-ink-2">XP</span>
    </span>
  );
}

export function LevelRing({ progress, level, size = 72, children }: { progress: number; level: number; size?: number; children?: ReactNode }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="6" fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke="#D7F46A" strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0.02, progress)) }} transition={{ duration: 1.1, ease: 'easeOut' }} />
      </svg>
      {children ?? <span className="font-display font-extrabold text-xl">{level}</span>}
    </div>
  );
}

/** Barra de XP no estilo "Progresso de XP" do guia: fundo Floresta, barra Lima. */
export function XpProgress({ xp, level }: { xp: number; level: { name: string; next: { name: string; xp: number } | null; progress: number; toNext: number; xp: number } }) {
  return (
    <div className="rounded-card bg-floresta-700 text-creme p-4 dark:bg-floresta-600">
      <p className="text-sm text-sage-200">Seu próximo nível</p>
      <div className="flex items-end justify-between gap-3">
        <p className="font-display font-extrabold text-2xl leading-tight">{level.next?.name ?? level.name}</p>
        <p className="text-sm font-bold text-lima-400 tabular">{level.next ? `${xp.toLocaleString('pt-BR')} / ${level.next.xp.toLocaleString('pt-BR')} XP` : `${xp.toLocaleString('pt-BR')} XP`}</p>
      </div>
      <div className="h-2.5 rounded-full bg-floresta-900/60 mt-3 overflow-hidden"><motion.div className="h-full bg-lima-400 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.max(3, level.progress * 100)}%` }} transition={{ duration: 1 }} /></div>
      <p className="text-xs text-sage-200 mt-2">{level.next ? `Faltam ${level.toNext.toLocaleString('pt-BR')} XP. Cada ajuda conta.` : 'Nível máximo. Obrigado por guiar a cidade.'}</p>
    </div>
  );
}

export function EmptyState({ art, icon, title, text, action }: { art?: 'no-results' | 'offline' | 'pending'; icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="text-center px-6 py-8">
      {art ? <StateArt kind={art} className="mb-2" /> : icon ? <div className="mx-auto mb-3 w-14 h-14 grid place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div> : null}
      <h3 className="font-display font-extrabold text-xl">{title}</h3>
      {text && <p className="text-ink-2 mt-1 text-balance">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Section({ title, right, children, className = '' }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-7 ${className}`}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display font-extrabold text-xl">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Título de página no padrão das telas: eyebrow verde + manchete pesada. */
export function Headline({ eyebrow, title, right, className = '' }: { eyebrow?: string; title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="flex-1 min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display text-[2rem] mt-1">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = '', tone = 'surface' }: { children: ReactNode; className?: string; tone?: 'surface' | 'soft' | 'forest' | 'gold' }) {
  const t = { surface: 'bg-surface border border-line', soft: 'bg-surface-2', forest: 'bg-floresta-700 text-creme dark:bg-floresta-600', gold: 'bg-ouro-100 text-ouro-700 border border-ouro-200' }[tone];
  return <div className={`rounded-card ${t} ${className}`}>{children}</div>;
}
