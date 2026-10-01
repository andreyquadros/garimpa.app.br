import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { AnimatePresence, animate, motion } from 'motion/react';
import { X } from 'lucide-react';

export function PepitaIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M12 2.5l6.5 3.8 2.2 7-4.4 6.3H7.7L3.3 13.3l2.2-7z" fill="#F2B705" stroke="#8A6200" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12 2.5l6.5 3.8-5.2 1.9-3.8-3z" fill="#FBE7A1" />
      <path d="M7.7 19.6l4.3-6.6 4.3 6.6z" fill="#D99E00" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M32 4c-12.2 0-22 9.6-22 21.5C10 41 32 60 32 60s22-19 22-34.5C54 13.6 44.2 4 32 4z" fill="#0F4C4C" />
      <path d="M32 16l9 5.5 3 9.5-6 8.5H26l-6-8.5 3-9.5z" fill="#F2B705" />
      <path d="M32 16l9 5.5-7 2.5-5-4z" fill="#FBE7A1" />
      <path d="M26 39.5l6-9 6 9z" fill="#D99E00" />
    </svg>
  );
}

type Variant = 'primary' | 'gold' | 'ghost' | 'danger' | 'soft';
const variants: Record<Variant, string> = {
  primary: 'bg-rio-700 text-white hover:bg-rio-800 shadow-float',
  gold: 'bg-pepita-400 text-rio-900 hover:bg-pepita-500 shadow-pepita',
  ghost: 'bg-transparent text-ink hover:bg-surface-2 border border-line',
  soft: 'bg-surface-2 text-ink hover:bg-rio-100',
  danger: 'bg-barro-100 text-barro-700 hover:bg-barro-500 hover:text-white',
};
export function Button({ variant = 'primary', size = 'md', loading, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const sz = size === 'sm' ? 'h-9 px-3 text-sm' : size === 'lg' ? 'h-14 px-6 text-lg' : 'h-12 px-5 text-base';
  return (
    <motion.button whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold tracking-wide disabled:opacity-50 disabled:pointer-events-none transition-colors ${sz} ${variants[variant]} ${className}`}
      disabled={loading || rest.disabled} {...(rest as object)}>
      {loading ? <Spinner size={18} /> : children}
    </motion.button>
  );
}

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-[3px] border-current border-t-transparent ${className}`} style={{ width: size, height: size }} aria-label="carregando" />;
}

export function Chip({ active, children, onClick, className = '' }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 rounded-full px-3 h-8 text-sm font-semibold transition-colors ${active ? 'bg-rio-700 text-white' : 'bg-surface-2 text-ink-2 hover:bg-rio-100'} ${className}`}>
      {children}
    </button>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  const hue = Array.from(name).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return url
    ? <img src={url} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
    : <span className="rounded-full grid place-items-center font-display font-bold text-white shrink-0" style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 45% 38%)` }} aria-hidden="true">{initials}</span>;
}

export function Field({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-ink-2 mb-1">{label}</span>
      <input {...rest} className={`w-full h-12 rounded-2xl border bg-surface px-4 text-base outline-none focus:border-rio-400 ${error ? 'border-barro-500' : 'border-line'} ${rest.className ?? ''}`} />
      {error ? <span className="block text-sm text-barro-700 mt-1">{error}</span> : hint ? <span className="block text-sm text-ink-2 mt-1">{hint}</span> : null}
    </label>
  );
}
export function TextArea({ label, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-ink-2 mb-1">{label}</span>
      <textarea {...rest} className={`w-full min-h-24 rounded-2xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-rio-400 ${rest.className ?? ''}`} />
      {hint && <span className="block text-sm text-ink-2 mt-1">{hint}</span>}
    </label>
  );
}

/** Folha inferior: todo detalhe e ação secundária abre aqui, no alcance do polegar. */
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
          <motion.div className="fixed inset-0 z-40 bg-rio-900/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-sheet bg-surface shadow-float overflow-y-auto safe-bottom ${tall ? 'max-h-[92dvh]' : 'max-h-[80dvh]'}`}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
            <div className="sticky top-0 bg-surface/95 backdrop-blur pt-2 pb-1 px-5 flex items-center gap-3">
              <span className="mx-auto h-1.5 w-10 rounded-full bg-line absolute left-1/2 -translate-x-1/2 top-2" />
              {title && <h2 className="font-display text-xl mt-3 flex-1">{title}</h2>}
              <button type="button" onClick={onClose} aria-label="Fechar" className="mt-3 ml-auto h-9 w-9 grid place-items-center rounded-full hover:bg-surface-2"><X size={20} /></button>
            </div>
            <div className="px-5 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Carimbo: aparece com um "baque" quando algo é aceito ou confirmado. */
export function Stamp({ children, tone = 'gold', className = '' }: { children: ReactNode; tone?: 'gold' | 'green' | 'barro' | 'ink'; className?: string }) {
  const color = { gold: 'text-gold-ink', green: 'text-green-ink', barro: 'text-barro-ink', ink: 'text-ink-2' }[tone];
  return (
    <motion.span initial={{ scale: 1.8, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      className={`stamp inline-block text-sm ${color} ${className}`}>{children}</motion.span>
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
  return <span className={className}>{display.toLocaleString('pt-BR')}</span>;
}

export function PepitaPill({ value, pending, size = 'md' }: { value: number; pending?: number; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-pepita-200/70 text-pepita-700 font-display font-bold ${size === 'sm' ? 'h-7 px-2 text-sm' : 'h-9 px-3 text-base'}`} title={pending ? `${pending} em carência` : undefined}>
      <PepitaIcon size={size === 'sm' ? 14 : 18} />
      <AnimatedNumber value={value} />
      {pending ? <span className="text-xs font-semibold opacity-70">+{pending}</span> : null}
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
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke="#F2B705" strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0.02, progress)) }} transition={{ duration: 1.1, ease: 'easeOut' }} />
      </svg>
      {children ?? <span className="font-display font-bold text-xl">{level}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="text-center px-6 py-10">
      {icon && <div className="mx-auto mb-3 w-14 h-14 grid place-items-center rounded-full bg-surface-2 text-accent">{icon}</div>}
      <h3 className="font-display text-xl">{title}</h3>
      {text && <p className="text-ink-2 mt-1 text-balance">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-display text-lg">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
