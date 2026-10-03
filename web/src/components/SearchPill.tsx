import { ArrowRight, Search, X } from 'lucide-react';
import { Spinner } from './ui';

/** Busca central das telas de referência: eyebrow, manchete e campo com botão Lima. */
export function SearchHero({ value, onChange, onSubmit, loading, autoFocus, compact = false, placeholder = 'Garrafa com tampa hermética' }:
  { value: string; onChange: (v: string) => void; onSubmit?: () => void; loading?: boolean; autoFocus?: boolean; compact?: boolean; placeholder?: string }) {
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} className="w-full">
      {!compact && (
        <div className="px-1 mb-3 text-center">
          <h1 className="font-display font-extrabold text-[2rem] leading-[1.05] text-brand-ink text-balance">O que você precisa encontrar?</h1>
        </div>
      )}
      <div className="flex items-center gap-2 h-14 rounded-full bg-surface shadow-float border border-line pl-4 pr-1.5">
        <Search size={20} className="text-esmeralda-600 shrink-0" aria-hidden="true" />
        <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} enterKeyHint="search" autoComplete="off"
          aria-label="Buscar produto na cidade" placeholder={placeholder}
          className="flex-1 min-w-0 h-12 bg-transparent outline-none text-base font-semibold placeholder:text-ink-2/70" />
        {loading ? <Spinner size={18} className="text-esmeralda-600 mr-3" /> : value ? (
          <button type="button" onClick={() => onChange('')} aria-label="Limpar busca" className="h-10 w-10 grid place-items-center rounded-full hover:bg-surface-2"><X size={18} /></button>
        ) : null}
        <button type="submit" aria-label="Buscar" className="h-11 w-11 shrink-0 rounded-full bg-lima-400 text-floresta-900 grid place-items-center shadow-lima"><ArrowRight size={20} strokeWidth={2.5} /></button>
      </div>
    </form>
  );
}

export function SearchPill(props: { value: string; onChange: (v: string) => void; onSubmit?: () => void; loading?: boolean; autoFocus?: boolean }) {
  return <SearchHero {...props} compact />;
}
