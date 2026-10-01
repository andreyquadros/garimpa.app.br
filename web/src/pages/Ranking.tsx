import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Flame, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { Avatar, EmptyState, Spinner } from '@/components/ui';
import type { RankRow } from '@/lib/types';

export function Ranking() {
  const [period, setPeriod] = useState<'semana' | 'geral'>('semana');
  const { data: me } = useMe();
  const r = useQuery({ queryKey: ['ranking', period], queryFn: () => api.ranking(period) });
  const items = r.data?.items ?? [];
  const podium = [items[1], items[0], items[2]];
  const myRow = r.data?.me ?? null;
  return (
    <div className="pb-32">
      <header className="safe-top px-4 pt-3">
        <h1 className="font-display text-3xl">Ranking</h1>
        <p className="text-ink-2 text-sm">Quem mais ajudou Ariquemes a achar as coisas.</p>
        <div className="mt-3 flex gap-1 rounded-full bg-surface-2 p-1">
          {(['semana', 'geral'] as const).map((p) => <button key={p} type="button" onClick={() => setPeriod(p)} className={`flex-1 h-9 rounded-full font-display font-semibold text-sm ${period === p ? 'bg-rio-700 text-white shadow-sm' : 'text-ink-2'}`}>{p === 'semana' ? 'Esta semana' : 'Desde o início'}</button>)}
        </div>
      </header>
      {r.isPending && <div className="grid place-items-center py-10"><Spinner /></div>}
      {r.isSuccess && items.length === 0 && <EmptyState icon={<Trophy />} title="Ninguém pontuou ainda" text="A semana começou agora. Responda uma pergunta e apareça aqui." />}
      {items.length > 0 && (
        <>
          <div className="mt-6 px-4 grid grid-cols-3 items-end gap-2">
            {podium.map((p, i) => p ? (
              <motion.div key={p.id} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.12, type: 'spring', stiffness: 260, damping: 20 }} className="text-center">
                <div className={`mx-auto rounded-full p-1 ${p.pos === 1 ? 'bg-pepita-400 shadow-pepita' : p.pos === 2 ? 'bg-rio-200' : 'bg-barro-100'}`}><Avatar name={p.name} url={p.avatarUrl} size={p.pos === 1 ? 72 : 56} /></div>
                <p className="font-display font-semibold mt-1.5 truncate text-sm">{p.name.split(' ')[0]}</p>
                <p className="text-xs text-ink-2">{p.level.name}</p>
                <div className={`mt-2 rounded-t-2xl grid place-items-center font-display font-bold ${p.pos === 1 ? 'h-24 bg-pepita-400 text-rio-900 text-2xl' : p.pos === 2 ? 'h-16 bg-rio-200 text-rio-900 text-xl' : 'h-12 bg-barro-100 text-barro-700 text-lg'}`}>{p.pontos.toLocaleString('pt-BR')}</div>
              </motion.div>
            ) : <div key={i} />)}
          </div>
          <ol className="mt-4 px-3 space-y-1.5">
            {items.slice(3).map((p) => <Row key={p.id} p={p} me={me?.user.id === p.id} />)}
          </ol>
        </>
      )}
      {myRow && myRow.pos > 3 && (
        <div className="fixed bottom-24 inset-x-0 z-30 mx-auto max-w-lg px-3">
          <div className="rounded-2xl bg-rio-800 text-white shadow-float px-4 py-2 flex items-center gap-3">
            <span className="font-display font-bold text-lg w-8">{myRow.pos}º</span>
            <span className="flex-1 text-sm font-semibold">Você · {myRow.level.name}</span>
            <span className="font-display font-bold">{myRow.pontos.toLocaleString('pt-BR')} XP</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ p, me }: { p: RankRow; me: boolean }) {
  return (
    <li className={`rounded-2xl px-3 py-2 flex items-center gap-3 bg-surface ${me ? 'ring-2 ring-pepita-400' : ''}`}>
      <span className="font-display font-bold text-ink-2 w-7 text-right">{p.pos}</span>
      <Avatar name={p.name} url={p.avatarUrl} size={36} />
      <span className="flex-1 min-w-0">
        <span className="block font-semibold truncate">{p.name}{me ? ' (você)' : ''}</span>
        <span className="block text-xs text-ink-2 flex items-center gap-1">{p.level.name}{p.streakDays >= 3 && <span className="inline-flex items-center gap-0.5 text-barro-ink"><Flame size={12} />{p.streakDays}</span>}</span>
      </span>
      <span className="font-display font-bold">{p.pontos.toLocaleString('pt-BR')}</span>
    </li>
  );
}
