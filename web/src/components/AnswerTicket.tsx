import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Check, Clock, Flag, MapPin, Navigation, RefreshCw, Store, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Answer } from '@/lib/types';
import { brl, dist, FLAG_LABEL, KINDS, timeAgo } from '@/lib/format';
import { Avatar, Button, Stamp, StatusChip } from './ui';
import { NuggetIcon } from './brand';

const STALE_DAYS = 30;

/** Cartão de evidência (guia de componentes): loja, foto, nota, chips de verificação, autor e ações. */
export function AnswerTicket({ a, meId, canAccept, canTip, distanceM, onAccept, onConfirm, onTip, onFlag }: {
  a: Answer; meId: string | null; canAccept: boolean; canTip: boolean; distanceM?: number | null;
  onAccept: (a: Answer) => void; onConfirm: (a: Answer, vote: 1 | -1) => void; onTip: (a: Answer) => void; onFlag: (a: Answer) => void;
}) {
  const [big, setBig] = useState<string | null>(null);
  const mine = meId === a.authorId;
  const goodFlags = Array.from(new Set(a.evidences.flatMap((e) => e.flags).filter((f) => f in FLAG_LABEL)));
  const strong = a.evidenceScore >= 60;
  const stale = (Date.now() - new Date(a.createdAt).getTime()) / 86400000 > STALE_DAYS && a.status !== 'aceita';
  const first = a.evidences[0];
  return (
    <motion.article layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`ticket overflow-hidden ${a.status === 'aceita' ? 'ring-2 ring-ouro-400' : ''}`}>
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 shrink-0 rounded-2xl bg-surface-2 grid place-items-center text-floresta-700 dark:text-creme"><Store size={20} /></span>
          <div className="flex-1 min-w-0">
            <Link to={`/lugar/${a.placeId}`} className="font-display font-extrabold text-[17px] leading-tight block">{a.placeName}</Link>
            <p className="text-sm text-ink-2 flex items-center gap-1 mt-0.5 truncate">
              <MapPin size={13} />{KINDS[a.placeKind] ?? a.placeKind}{a.placeAddress ? ` · ${a.placeAddress}` : ''}{distanceM != null ? ` · ${dist(distanceM)}` : ''}
            </p>
          </div>
          {a.status === 'aceita' ? <Stamp tone="gold">Encontrado</Stamp>
            : a.status === 'confirmada' ? <StatusChip tone="ok" icon={<Check size={12} strokeWidth={3} />}>Confirmado</StatusChip>
            : stale ? <StatusChip tone="warn" icon={<RefreshCw size={12} />}>Revalidar</StatusChip>
            : <StatusChip tone="wait" icon={<Clock size={12} />}>Em análise</StatusChip>}
        </div>

        {first && (
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {a.evidences.map((e, i) => (
              <button key={e.id} type="button" onClick={() => setBig(big === e.url ? null : e.url)} className={`relative shrink-0 rounded-2xl overflow-hidden bg-surface-2 ${i === 0 ? 'w-[74%] aspect-[4/3]' : 'w-[24%] aspect-[4/3]'}`}>
                <img src={e.url} alt={`Evidência ${i + 1}: ${a.placeName}`} loading="lazy" className="h-full w-full object-cover" />
                {e.hasGps && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-floresta-900/75 text-creme text-[11px] font-bold px-2 h-6"><Navigation size={11} />GPS{e.distanceExifM != null ? ` ${dist(e.distanceExifM)}` : ''}</span>}
                <span className={`absolute right-2 bottom-2 rounded-full text-[11px] font-extrabold px-2 h-6 grid place-items-center ${e.score >= 60 ? 'bg-lima-400 text-floresta-900' : 'bg-ouro-100 text-ouro-700'}`}>{e.score}</span>
              </button>
            ))}
          </div>
        )}
        {big && (
          <button type="button" onClick={() => setBig(null)} className="fixed inset-0 z-50 bg-floresta-900/92 grid place-items-center p-4" aria-label="Fechar foto">
            <img src={big} alt="" className="max-h-full max-w-full rounded-2xl" />
          </button>
        )}

        {(a.note || a.priceCents != null) && (
          <div className="mt-3 flex items-start gap-3">
            {a.note && <p className="flex-1 text-[15px] leading-snug">{a.note}</p>}
            {a.priceCents != null && <span className="shrink-0 font-display font-extrabold text-lg text-floresta-700 dark:text-lima-400 tabular">{brl(a.priceCents)}</span>}
          </div>
        )}
        <p className="mt-3 text-xs leading-snug"><span className={`font-bold ${strong ? 'text-green-ink' : 'text-gold-ink'}`}>{strong ? 'Evidência forte' : 'Evidência fraca'} ({a.evidenceScore})</span><span className="text-ink-2">{[a.isFirstForPlace ? '1ª descoberta aqui' : null, ...goodFlags.map((f) => FLAG_LABEL[f]), a.seenOn ? `visto em ${new Date(a.seenOn).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : null].filter(Boolean).map((t) => ` · ${t}`).join('')}</span></p>
      </div>

      <div className="ticket-cut" />

      <div className="px-4 py-3 flex items-center gap-2">
        <Avatar name={a.authorName} url={a.authorAvatar} size={30} />
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-sm font-bold truncate">{a.authorName}{mine ? ' (você)' : ''}</p>
          <p className="text-xs text-ink-2">{timeAgo(a.createdAt)}{a.tips.length ? ` · ${a.tips.reduce((s, t) => s + t.amount, 0)} pepitas de agradecimento` : ''}</p>
        </div>
        {!mine && (
          <div className="flex items-center gap-1">
            <VoteButton active={a.myVote === 1} count={a.confirms} onClick={() => onConfirm(a, 1)} icon={<ThumbsUp size={16} />} label="Confirmo, tem lá" />
            <VoteButton active={a.myVote === -1} count={a.denies} onClick={() => onConfirm(a, -1)} icon={<ThumbsDown size={16} />} label="Não tem" tone="brasa" />
            <button type="button" onClick={() => onFlag(a)} aria-label="Denunciar" className="h-9 w-9 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2"><Flag size={16} /></button>
          </div>
        )}
      </div>

      {(canAccept || (canTip && !mine)) && (
        <div className="px-4 pb-4 flex gap-2">
          {canAccept && <Button variant="primary" className="flex-1" onClick={() => onAccept(a)}><Check size={18} strokeWidth={3} />Foi aqui que encontrei</Button>}
          {canTip && !mine && <Button variant="gold" className={canAccept ? '' : 'flex-1'} onClick={() => onTip(a)}><NuggetIcon size={18} />Agradecer</Button>}
        </div>
      )}
    </motion.article>
  );
}

function VoteButton({ active, count, onClick, icon, label, tone = 'green' }: { active: boolean; count: number; onClick: () => void; icon: React.ReactNode; label: string; tone?: 'green' | 'brasa' }) {
  const on = tone === 'green' ? 'bg-esmeralda-600 text-white' : 'bg-brasa-500 text-white';
  return (
    <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onClick} aria-label={label} aria-pressed={active}
      className={`h-9 px-2.5 rounded-full inline-flex items-center gap-1 text-sm font-bold ${active ? on : 'bg-surface-2 text-ink-2'}`}>
      {icon}{count > 0 ? count : ''}
    </motion.button>
  );
}
