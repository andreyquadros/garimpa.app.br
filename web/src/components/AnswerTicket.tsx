import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Check, Flag, MapPin, Navigation, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Answer } from '@/lib/types';
import { brl, dist, FLAG_LABEL, KINDS, timeAgo } from '@/lib/format';
import { Avatar, Button, PepitaIcon, Stamp } from './ui';

export function AnswerTicket({ a, meId, canAccept, canTip, distanceM, onAccept, onConfirm, onTip, onFlag }: {
  a: Answer; meId: string | null; canAccept: boolean; canTip: boolean; distanceM?: number | null;
  onAccept: (a: Answer) => void; onConfirm: (a: Answer, vote: 1 | -1) => void; onTip: (a: Answer) => void; onFlag: (a: Answer) => void;
}) {
  const [big, setBig] = useState<string | null>(null);
  const mine = meId === a.authorId;
  const goodFlags = a.evidences.flatMap((e) => e.flags).filter((f) => f in FLAG_LABEL);
  const strong = a.evidenceScore >= 60;
  return (
    <motion.article layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`ticket overflow-hidden ${a.status === 'aceita' ? 'ring-2 ring-pepita-400' : ''}`}>
      <div className="p-4 pb-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <Link to={`/lugar/${a.placeId}`} className="font-display text-lg leading-tight block">{a.placeName}</Link>
            <p className="text-sm text-ink-2 flex items-center gap-1 mt-0.5">
              <MapPin size={14} />{KINDS[a.placeKind] ?? a.placeKind}{a.placeAddress ? ` · ${a.placeAddress}` : ''}{distanceM != null ? ` · ${dist(distanceM)}` : ''}
            </p>
          </div>
          {a.status === 'aceita' && <Stamp tone="gold">Achado</Stamp>}
          {a.status === 'confirmada' && <Stamp tone="green">Confirmado</Stamp>}
          {a.isFirstForPlace && a.status === 'pendente' && <span className="text-[11px] font-bold text-pepita-700 bg-pepita-200 rounded-full px-2 h-6 grid place-items-center shrink-0">1º achado</span>}
        </div>

        {a.evidences.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {a.evidences.map((e, i) => (
              <button key={e.id} type="button" onClick={() => setBig(big === e.url ? null : e.url)} className={`relative shrink-0 rounded-xl overflow-hidden bg-surface-2 ${i === 0 ? 'w-[72%] aspect-[4/3]' : 'w-[26%] aspect-[4/3]'}`}>
                <img src={e.url} alt={`Prova ${i + 1}: ${a.placeName}`} loading="lazy" className="h-full w-full object-cover" />
                {e.hasGps && <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-rio-900/70 text-white text-[11px] font-semibold px-2 h-6"><Navigation size={11} />GPS{e.distanceExifM != null ? ` ${dist(e.distanceExifM)}` : ''}</span>}
                <span className={`absolute right-1.5 bottom-1.5 rounded-full text-[11px] font-bold px-2 h-6 grid place-items-center ${e.score >= 60 ? 'bg-mata-500 text-white' : 'bg-pepita-200 text-pepita-700'}`}>{e.score}</span>
              </button>
            ))}
          </div>
        )}
        {big && (
          <button type="button" onClick={() => setBig(null)} className="fixed inset-0 z-50 bg-rio-900/90 grid place-items-center p-4" aria-label="Fechar foto">
            <img src={big} alt="" className="max-h-full max-w-full rounded-xl" />
          </button>
        )}

        {(a.note || a.priceCents != null) && (
          <div className="mt-3 flex items-start gap-3">
            {a.note && <p className="flex-1 text-[15px] leading-snug">{a.note}</p>}
            {a.priceCents != null && <span className="shrink-0 font-display font-bold text-lg text-accent">{brl(a.priceCents)}</span>}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className={`rounded-full px-2 h-6 inline-flex items-center gap-1 font-semibold ${strong ? 'bg-mata-100 text-mata-700' : 'bg-surface-2 text-ink-2'}`}>
            {strong ? <Check size={12} strokeWidth={3} /> : null}{strong ? 'Prova forte' : 'Prova fraca'} · {a.evidenceScore}
          </span>
          {Array.from(new Set(goodFlags)).map((f) => <span key={f} className="rounded-full px-2 h-6 inline-flex items-center bg-surface-2 text-ink-2">{FLAG_LABEL[f]}</span>)}
          {a.seenOn && <span className="rounded-full px-2 h-6 inline-flex items-center bg-surface-2 text-ink-2">visto em {new Date(a.seenOn + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
        </div>
      </div>

      <div className="ticket-cut" />

      <div className="px-4 py-3 flex items-center gap-2">
        <Avatar name={a.authorName} url={a.authorAvatar} size={30} />
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-sm font-semibold truncate">{a.authorName}{mine ? ' (você)' : ''}</p>
          <p className="text-xs text-ink-2">{timeAgo(a.createdAt)}{a.tips.length ? ` · ${a.tips.reduce((s, t) => s + t.amount, 0)} pepitas de gorjeta` : ''}</p>
        </div>
        {!mine && (
          <div className="flex items-center gap-1">
            <VoteButton active={a.myVote === 1} count={a.confirms} onClick={() => onConfirm(a, 1)} icon={<ThumbsUp size={16} />} label="Confirmo, tem lá" />
            <VoteButton active={a.myVote === -1} count={a.denies} onClick={() => onConfirm(a, -1)} icon={<ThumbsDown size={16} />} label="Não tem" tone="barro" />
            <button type="button" onClick={() => onFlag(a)} aria-label="Denunciar" className="h-9 w-9 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2"><Flag size={16} /></button>
          </div>
        )}
      </div>

      {(canAccept || (canTip && !mine)) && (
        <div className="px-4 pb-4 flex gap-2">
          {canAccept && <Button variant="gold" className="flex-1" onClick={() => onAccept(a)}><Check size={18} strokeWidth={3} />Foi aqui que achei</Button>}
          {canTip && !mine && <Button variant="soft" className={canAccept ? '' : 'flex-1'} onClick={() => onTip(a)}><PepitaIcon size={18} />Gorjeta</Button>}
        </div>
      )}
    </motion.article>
  );
}

function VoteButton({ active, count, onClick, icon, label, tone = 'green' }: { active: boolean; count: number; onClick: () => void; icon: React.ReactNode; label: string; tone?: 'green' | 'barro' }) {
  const on = tone === 'green' ? 'bg-mata-500 text-white' : 'bg-barro-500 text-white';
  return (
    <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onClick} aria-label={label} aria-pressed={active}
      className={`h-9 px-2.5 rounded-full inline-flex items-center gap-1 text-sm font-bold ${active ? on : 'bg-surface-2 text-ink-2'}`}>
      {icon}{count > 0 ? count : ''}
    </motion.button>
  );
}
