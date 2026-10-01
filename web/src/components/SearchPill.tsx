import { Search, X } from 'lucide-react';
import { Spinner } from './ui';

export function SearchPill({ value, onChange, onSubmit, loading, autoFocus, placeholder = 'O que você tá procurando?' }:
  { value: string; onChange: (v: string) => void; onSubmit?: () => void; loading?: boolean; autoFocus?: boolean; placeholder?: string }) {
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
      className="flex items-center gap-2 h-13 rounded-full bg-surface shadow-float border border-line pl-4 pr-2">
      <Search size={20} className="text-accent shrink-0" aria-hidden="true" />
      <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} enterKeyHint="search" autoComplete="off"
        aria-label="Buscar produto em Ariquemes" placeholder={placeholder}
        className="flex-1 min-w-0 h-12 bg-transparent outline-none text-base placeholder:text-ink-2" />
      {loading ? <Spinner size={18} className="text-accent mr-2" /> : value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Limpar busca" className="h-9 w-9 grid place-items-center rounded-full hover:bg-surface-2"><X size={18} /></button>
      ) : null}
    </form>
  );
}
