import { Link } from 'react-router';
import { ChevronRight, Clock, MapPin, Users } from 'lucide-react';
import type { QuestionListItem, Similar } from '@/lib/types';
import { categoryOf, dist, timeAgo } from '@/lib/format';
import { PepitaPill, StatusChip } from './ui';

const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'warn' | 'muted' }> = {
  aberta: { label: 'Procurando', tone: 'warn' }, respondida: { label: 'Tem pista', tone: 'wait' }, resolvida: { label: 'Encontrado', tone: 'ok' }, fechada: { label: 'Fechada', tone: 'muted' },
};

/** Cartão de missão da comunidade. */
export function QuestionCard({ q }: { q: QuestionListItem }) {
  const cat = categoryOf(q.category);
  const st = STATUS[q.status] ?? STATUS['aberta']!;
  return (
    <Link to={`/m/${q.id}`} className="block rounded-card bg-surface border border-line p-4 active:bg-surface-2">
      <div className="flex items-start gap-3">
        <span className="h-12 w-12 shrink-0 grid place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="eyebrow !text-[0.62rem]">Missão da comunidade</p>
          <h3 className="font-display font-extrabold text-[17px] leading-snug mt-0.5">{q.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            <StatusChip tone={st.tone}>{st.label}</StatusChip>
            <span className="inline-flex items-center gap-1"><Clock size={13} />{timeAgo(q.createdAt)}</span>
            <span className="inline-flex items-center gap-1"><Users size={13} />{q.followersCount}</span>
            {q.distanceM != null && <span>{dist(q.distanceM)}</span>}
          </div>
          {q.topPlace && <p className="mt-2 text-sm font-semibold text-accent inline-flex items-center gap-1"><MapPin size={14} />{q.topPlace}</p>}
        </div>
        <div className="flex flex-col items-end gap-2 self-stretch justify-between">
          {q.bounty > 0 ? <PepitaPill value={q.bounty} size="sm" /> : <span />}
          <ChevronRight size={18} className="text-ink-2" />
        </div>
      </div>
    </Link>
  );
}

/** Missão parecida: aparece na busca e antes de abrir uma missão nova ("Já encontraram por aqui"). */
export function SimilarCard({ s, onWant }: { s: Similar; onWant?: (id: string) => void }) {
  const st = STATUS[s.status] ?? STATUS['aberta']!;
  return (
    <div className="rounded-card bg-surface border border-line p-3.5">
      <Link to={`/m/${s.id}`} className="block">
        <h4 className="font-display font-extrabold text-[16px] leading-snug">{s.title}</h4>
        <p className="text-sm text-ink-2 mt-1 flex flex-wrap items-center gap-x-2"><StatusChip tone={st.tone}>{st.label}</StatusChip>{s.answersCount} {s.answersCount === 1 ? 'pista' : 'pistas'} · {s.followersCount} {s.followersCount === 1 ? 'pessoa quer' : 'pessoas querem'}</p>
      </Link>
      {s.places.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {s.places.slice(0, 3).map((p) => (
            <li key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-xs font-bold ${p.status === 'aceita' ? 'bg-esmeralda-100 text-esmeralda-800' : p.status === 'confirmada' ? 'bg-lima-100 text-floresta-700' : 'bg-surface-2 text-ink-2'}`}>
              <MapPin size={12} />{p.name}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Link to={`/m/${s.id}`} className="flex-1 h-10 rounded-full bg-floresta-700 text-lima-400 grid place-items-center font-display font-bold text-sm">Ver descoberta</Link>
        {onWant && s.status !== 'resolvida' && <button type="button" onClick={() => onWant(s.id)} className="flex-1 h-10 rounded-full border border-line font-display font-bold text-sm">Também preciso</button>}
      </div>
    </div>
  );
}
