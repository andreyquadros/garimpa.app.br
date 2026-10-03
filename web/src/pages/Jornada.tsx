import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { BadgeCheck, Camera, Check, Flame, Lock, Share2, Sparkles } from 'lucide-react';
import { BADGES } from '@/lib/badges';
import type { LedgerItem } from '@/lib/types';
import { api } from '@/lib/api';
import { useMe, useShare, useToast } from '@/lib/hooks';
import { LEVELS } from '@/lib/economy';
import type { RankRow } from '@/lib/types';
import { Avatar, Button, Card, EmptyState, Headline, Segmented, Spinner } from '@/components/ui';
import { Pepi, RankBadge, XpStar } from '@/components/brand';

/** Jornada: patente, árvore de níveis, conquistas e quem mais ajudou a cidade. */
export function Jornada() {
  const { data: me, isPending } = useMe();
  const share = useShare();
  const toast = useToast();
  const [period, setPeriod] = useState<'semana' | 'geral'>('semana');
  const ranking = useQuery({ queryKey: ['ranking', period], queryFn: () => api.ranking(period) });
  const ledger = useQuery({ queryKey: ['ledger'], queryFn: api.ledger, enabled: !!me });

  if (isPending) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!me) {
    return (
      <div className="flex-1 grid place-items-center px-6 pb-28">
        <div className="text-center">
          <Pepi pose="explorador" size={200} className="mx-auto" />
          <p className="eyebrow mt-4">Sua jornada</p>
          <h1 className="font-display font-extrabold text-3xl mt-1">Cada ajuda conta.</h1>
          <p className="text-ink-2 mt-2 text-balance">Entre para acompanhar seu XP, subir de patente e aparecer entre quem mais ajuda Ariquemes.</p>
          <Link to="/entrar?next=/jornada" className="block mt-6"><Button variant="primary" size="lg" className="w-full" arrow>Entrar com Google</Button></Link>
          <Link to="/" className="block mt-3 text-sm font-bold text-accent">Explorar primeiro</Link>
        </div>
      </div>
    );
  }

  const { user, level, badges, stats } = me;
  const earned = new Set(badges.map((b) => b.slug));
  const items = ranking.data?.items ?? [];
  const podium = [items[1], items[0], items[2]];
  const myRow = ranking.data?.me ?? null;

  async function invite() {
    const r = await share('Vem descobrir onde tem em Ariquemes comigo no Pepita Social', location.origin);
    if (r === 'copied') toast.push({ text: 'Link copiado. Manda no grupo!' });
  }

  return (
    <div className="pb-32 px-4">
      <Headline eyebrow="Sua jornada" title="Cada ajuda conta." className="mt-3"
        right={<button type="button" onClick={invite} aria-label="Convidar amigos" className="h-11 w-11 grid place-items-center rounded-full bg-surface border border-line text-ink-2"><Share2 size={18} /></button>} />

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5 relative overflow-hidden rounded-card bg-floresta-700 text-creme p-5 shadow-float dark:bg-floresta-600">
        <span className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-lima-400/20" aria-hidden="true" />
        <span className="absolute -right-6 -top-6 h-36 w-36 rounded-full border border-lima-400/20" aria-hidden="true" />
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} url={user.avatarUrl} size={60} lime />
              <div className="min-w-0">
                <h2 className="font-display font-extrabold text-2xl leading-tight line-clamp-2">{user.name}</h2>
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-floresta-900/50 px-2.5 h-7 text-xs font-bold text-lima-400 whitespace-nowrap">
                  <Sparkles size={13} />Nível {level.level} · {level.name}
                </span>
              </div>
            </div>
          </div>
          <Pepi pose="explorador" size={88} className="-mr-2 -mt-2 shrink-0" />
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <p className="font-display font-extrabold text-4xl leading-none tabular">{user.xp.toLocaleString('pt-BR')} <span className="text-base text-lima-400">XP</span></p>
          <p className="text-sm text-sage-200">{level.next ? `Próximo nível: ${level.next.xp.toLocaleString('pt-BR')} XP` : 'Nível máximo'}</p>
        </div>
        <div className="h-2.5 rounded-full bg-floresta-900/60 mt-3 overflow-hidden">
          <motion.div className="h-full bg-lima-400 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.max(3, level.progress * 100)}%` }} transition={{ duration: 1, ease: 'easeOut' }} />
        </div>
        <p className="text-sm text-sage-200 mt-2">{level.next ? `Faltam ${level.toNext.toLocaleString('pt-BR')} XP para ser ${level.next.name}.` : 'Você é referência para a comunidade.'}</p>
      </motion.section>

      <p className="mt-3 text-sm text-ink-2 tabular">
        <b className="text-ink">{stats.achados}</b> {stats.achados === 1 ? 'descoberta válida' : 'descobertas válidas'} · <b className="text-ink">{stats.respostas}</b> {stats.respostas === 1 ? 'pista' : 'pistas'} · <b className="text-ink">{stats.confirmacoes}</b> {stats.confirmacoes === 1 ? 'confirmação' : 'confirmações'}
        {user.streakDays > 1 && <span className="font-bold text-gold-ink inline-flex items-center gap-1 ml-2"><Flame size={14} />{user.streakDays} dias seguidos</span>}
      </p>

      <section className="mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-extrabold text-xl">Sua árvore de conquistas</h2>
          <span className="text-sm text-ink-2">{LEVELS.length} níveis</span>
        </div>
        <LevelPath current={level.level} />
        <p className="text-sm text-ink-2 mt-2 px-2">{level.perk}</p>
      </section>

      <DailyGoals items={ledger.data?.items ?? []} />

      <section className="mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-extrabold text-xl">Conquistas</h2>
          <span className="text-sm text-ink-2">{earned.size} de {BADGES.length}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {BADGES.map((b) => {
            const has = earned.has(b.slug);
            const Icon = b.icon;
            return (
              <div key={b.slug} className={`rounded-card p-3 text-center border ${has ? 'bg-ouro-100 border-ouro-200' : 'bg-surface border-line'}`} title={b.description}>
                <span className={`mx-auto h-11 w-11 rounded-full grid place-items-center ${has ? 'bg-ouro-400 text-floresta-900 shadow-ouro' : 'bg-surface-2 text-ink-2'}`}>{has ? <Icon size={22} /> : <Lock size={18} />}</span>
                <p className={`text-xs font-bold mt-1.5 leading-tight ${has ? 'text-gold-ink' : 'text-ink-2'}`}>{b.name}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display font-extrabold text-xl">Quem mais ajudou</h2>
          <Segmented id="ranking" value={period} onChange={setPeriod} options={[{ id: 'semana', label: 'Semana' }, { id: 'geral', label: 'Geral' }]} className="w-40 [&>button]:h-8 [&>button]:text-xs" />
        </div>
        {ranking.isPending && <div className="grid place-items-center py-8"><Spinner /></div>}
        {ranking.isSuccess && items.length === 0 && <EmptyState art="pending" title="Ninguém pontuou ainda" text="A semana começou agora. Envie uma evidência e apareça aqui." />}
        {items.length > 0 && (
          <>
            <div className="mt-4 grid grid-cols-3 items-end gap-2">
              {podium.map((p, i) => p ? (
                <motion.div key={p.id} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1, type: 'spring', stiffness: 260, damping: 20 }} className="text-center">
                  <div className={`mx-auto w-fit rounded-full p-1 ${p.pos === 1 ? 'bg-ouro-400 shadow-ouro' : p.pos === 2 ? 'bg-lima-400' : 'bg-esmeralda-100'}`}><Avatar name={p.name} url={p.avatarUrl} size={p.pos === 1 ? 64 : 50} /></div>
                  <p className="font-display font-extrabold mt-1.5 truncate text-sm">{p.name.split(' ')[0]}{me.user.id === p.id ? ' (você)' : ''}</p>
                  <p className="text-xs text-ink-2 truncate">{p.level.name}</p>
                  <div className={`mt-2 rounded-t-2xl grid place-items-center font-display font-extrabold tabular ${p.pos === 1 ? 'h-20 bg-ouro-400 text-floresta-900 text-2xl' : p.pos === 2 ? 'h-14 bg-lima-400 text-floresta-900 text-xl' : 'h-11 bg-esmeralda-100 text-esmeralda-800 text-lg'}`}>{p.pontos.toLocaleString('pt-BR')}</div>
                </motion.div>
              ) : <div key={i} />)}
            </div>
            <ol className="mt-2 space-y-1.5">
              {items.slice(3).map((p) => <Row key={p.id} p={p} me={me.user.id === p.id} />)}
            </ol>
            {myRow && myRow.pos > 3 && (
              <Card tone="forest" className="mt-3 px-4 py-2.5 flex items-center gap-3">
                <span className="font-display font-extrabold text-lg w-9">{myRow.pos}º</span>
                <span className="flex-1 text-sm font-bold">Você · {myRow.level.name}</span>
                <span className="font-display font-extrabold inline-flex items-center gap-1"><XpStar size={16} />{myRow.pontos.toLocaleString('pt-BR')}</span>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Row({ p, me }: { p: RankRow; me: boolean }) {
  return (
    <li className={`rounded-card px-3 py-2 flex items-center gap-3 bg-surface border ${me ? 'border-lima-400 ring-2 ring-lima-400/50' : 'border-line'}`}>
      <span className="font-display font-extrabold text-ink-2 w-7 text-right tabular">{p.pos}</span>
      <Avatar name={p.name} url={p.avatarUrl} size={36} />
      <span className="flex-1 min-w-0">
        <span className="block font-bold truncate">{p.name}{me ? ' (você)' : ''}</span>
        <span className="block text-xs text-ink-2 flex items-center gap-1">{p.level.name}{p.streakDays >= 3 && <span className="inline-flex items-center gap-0.5 text-gold-ink"><Flame size={12} />{p.streakDays}</span>}</span>
      </span>
      <span className="font-display font-extrabold tabular">{p.pontos.toLocaleString('pt-BR')}</span>
    </li>
  );
}

/** Trilha de patentes no estilo caminho do Duolingo: nós alternando os lados, ligados por uma linha tracejada; o atual pulsa e tem o Pepi ao lado. */
function LevelPath({ current }: { current: number }) {
  const xs = [22, 64, 32, 70, 46];
  const step = 112; const pad = 64;
  const nodes = LEVELS.map((l, i) => ({ l, x: xs[i] ?? 50, y: pad + i * step }));
  const h = pad * 2 + (LEVELS.length - 1) * step;
  const d = nodes.map((n, i) => (i === 0 ? `M ${n.x} ${n.y}` : `C ${nodes[i - 1]!.x} ${(nodes[i - 1]!.y + n.y) / 2}, ${n.x} ${(nodes[i - 1]!.y + n.y) / 2}, ${n.x} ${n.y}`)).join(' ');
  const doneUntil = nodes.findIndex((n) => n.l.level === current);
  const dDone = nodes.slice(0, doneUntil + 1).map((n, i) => (i === 0 ? `M ${n.x} ${n.y}` : `C ${nodes[i - 1]!.x} ${(nodes[i - 1]!.y + n.y) / 2}, ${n.x} ${(nodes[i - 1]!.y + n.y) / 2}, ${n.x} ${n.y}`)).join(' ');
  return (
    <div className="relative mt-1" style={{ height: h }}>
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} fill="none" stroke="var(--line)" strokeWidth="6" strokeLinecap="round" strokeDasharray="0.1 12" vectorEffect="non-scaling-stroke" />
        <motion.path d={dDone} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 }} />
      </svg>
      {nodes.map((n, i) => {
        const state = n.l.level === current ? 'atual' : n.l.level < current ? 'feito' : 'futuro';
        const left = n.x < 50;
        return (
          <motion.div key={n.l.level} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 320, damping: 20 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${n.x}%`, top: n.y }}>
            <div className="relative">
              {state === 'atual' && <span className="node-ring absolute inset-0 rounded-full bg-lima-400/50" aria-hidden="true" />}
              <span className={`relative h-[4.25rem] w-[4.25rem] rounded-full grid place-items-center border-4 border-bg ${state === 'atual' ? 'bg-lima-400 shadow-lima' : state === 'feito' ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-2'}`}>
                {state === 'feito' ? <Check size={28} strokeWidth={3} /> : state === 'futuro' ? <Lock size={22} /> : <RankBadge level={n.l.level} size={34} />}
              </span>
              {state === 'atual' && <Pepi pose="explorador" size={60} className={`absolute -top-3 ${left ? 'left-[3.9rem]' : 'right-[3.9rem]'}`} />}
            </div>
            <span className={`mt-1.5 text-center leading-tight ${state === 'futuro' ? 'text-ink-2' : ''}`}>
              <span className="block font-display font-extrabold text-sm whitespace-nowrap">{n.l.name}</span>
              <span className="block text-xs text-ink-2 tabular">{n.l.xp.toLocaleString('pt-BR')} XP</span>
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Metas de hoje, calculadas do extrato do dia (renovam à meia-noite). Sem recompensa inventada: o XP vem das próprias ações. */
function DailyGoals({ items }: { items: LedgerItem[] }) {
  const today = new Date().toDateString();
  const todays = items.filter((l) => l.state !== 'estornado' && new Date(l.createdAt).toDateString() === today);
  const count = (kind: string) => todays.filter((l) => l.kind === kind).length;
  const xp = todays.reduce((s, l) => s + Math.max(0, l.xp), 0);
  const goals = [
    { label: 'Envie uma evidência', done: count('resposta_com_evidencia'), target: 1, icon: Camera },
    { label: 'Confirme uma descoberta', done: count('confirmar') + count('confirmacao_validada'), target: 1, icon: BadgeCheck },
    { label: 'Ganhe 20 XP hoje', done: Math.min(xp, 20), target: 20, icon: Sparkles },
  ];
  const all = goals.every((g) => g.done >= g.target);
  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display font-extrabold text-xl">Metas de hoje</h2>
        <span className="text-sm text-ink-2">{all ? 'Tudo feito!' : 'renovam à meia-noite'}</span>
      </div>
      <ul className="mt-3 rounded-card bg-surface border border-line divide-y divide-line">
        {goals.map((g, i) => {
          const ok = g.done >= g.target;
          return (
            <li key={g.label} className="flex items-center gap-3 px-4 py-3">
              <motion.span initial={false} animate={ok ? { scale: [1, 1.2, 1] } : { scale: 1 }} className={`h-10 w-10 shrink-0 grid place-items-center rounded-full ${ok ? 'bg-lima-400 text-floresta-900' : 'bg-surface-2 text-accent'}`}>{ok ? <Check size={20} strokeWidth={3} /> : <g.icon size={18} />}</motion.span>
              <span className="flex-1 min-w-0">
                <span className={`block font-bold text-[15px] ${ok ? 'text-ink-2 line-through decoration-2' : ''}`}>{g.label}</span>
                <span className="mt-1.5 block h-2 rounded-full bg-surface-2 overflow-hidden"><motion.span className={`block h-full rounded-full ${ok ? 'bg-lima-400' : 'bg-accent'}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (g.done / g.target) * 100)}%` }} transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: 'easeOut' }} /></span>
              </span>
              <span className="text-sm font-bold tabular text-ink-2 shrink-0">{Math.min(g.done, g.target)}/{g.target}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
