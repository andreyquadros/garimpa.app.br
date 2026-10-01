import { Link } from 'react-router';
import { MapPin, MessageCircle, Users } from 'lucide-react';
import type { QuestionListItem, Similar } from '@/lib/types';
import { categoryOf, dist, STATUS_LABEL, timeAgo } from '@/lib/format';
import { PepitaPill } from './ui';

const rail: Record<string, string> = { aberta: 'bg-barro-500', respondida: 'bg-pepita-400', resolvida: 'bg-mata-500', fechada: 'bg-line' };

export function QuestionCard({ q }: { q: QuestionListItem }) {
  const cat = categoryOf(q.category);
  return (
    <Link to={`/g/${q.id}`} className="flex gap-3 rounded-2xl bg-surface pl-0 pr-4 py-3 overflow-hidden active:bg-surface-2">
      <span className={`w-1.5 shrink-0 rounded-r ${rail[q.status] ?? 'bg-line'}`} aria-hidden="true" />
      <span className="text-2xl leading-none mt-0.5" aria-hidden="true">{cat.emoji}</span>
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-[17px] leading-snug">{q.title}</h3>
        <p className="text-sm text-ink-2 mt-0.5">{STATUS_LABEL[q.status]} · {timeAgo(q.createdAt)}{q.distanceM != null ? ` · ${dist(q.distanceM)}` : ''}</p>
        <div className="flex items-center gap-3 text-sm text-ink-2 mt-1.5">
          <span className="inline-flex items-center gap-1"><MessageCircle size={14} />{q.answersCount}</span>
          <span className="inline-flex items-center gap-1"><Users size={14} />{q.followersCount}</span>
          {q.topPlace && <span className="inline-flex items-center gap-1 text-accent font-semibold truncate"><MapPin size={14} />{q.topPlace}</span>}
        </div>
      </div>
      {q.bounty > 0 && <div className="self-start"><PepitaPill value={q.bounty} size="sm" /></div>}
    </Link>
  );
}

export function SimilarCard({ s, onWant }: { s: Similar; onWant?: (id: string) => void }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-3">
      <Link to={`/g/${s.id}`} className="block">
        <h4 className="font-display text-[16px] leading-snug">{s.title}</h4>
        <p className="text-sm text-ink-2 mt-0.5">{STATUS_LABEL[s.status]} · {s.answersCount} {s.answersCount === 1 ? 'pista' : 'pistas'} · {s.followersCount} {s.followersCount === 1 ? 'pessoa quer' : 'pessoas querem'}</p>
      </Link>
      {s.places.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {s.places.slice(0, 3).map((p) => (
            <li key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-xs font-semibold ${p.status === 'aceita' ? 'bg-pepita-200 text-pepita-700' : p.status === 'confirmada' ? 'bg-mata-100 text-mata-700' : 'bg-surface-2 text-ink-2'}`}>
              <MapPin size={12} />{p.name}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Link to={`/g/${s.id}`} className="flex-1 h-10 rounded-full bg-rio-700 text-white grid place-items-center font-display font-semibold text-sm">Ver no mapa</Link>
        {onWant && s.status !== 'resolvida' && <button type="button" onClick={() => onWant(s.id)} className="flex-1 h-10 rounded-full border border-line font-display font-semibold text-sm">Também quero</button>}
      </div>
    </div>
  );
}
