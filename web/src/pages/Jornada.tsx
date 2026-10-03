import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Camera, Disc, Eye, Flag, Flame, Gem, Hand, Lock, Map, Share2, Sparkles, Trophy, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useMe, useShare, useToast } from '@/lib/hooks';
import { LEVELS } from '@/lib/economy';
import type { RankRow } from '@/lib/types';
import { Avatar, Button, Card, EmptyState, Headline, Spinner } from '@/components/ui';
import { Pepi, RankBadge, XpStar } from '@/components/brand';

const BADGES = [
  { slug: 'fundador', name: 'Fundador', description: 'Entrou no piloto de Ariquemes.', icon: Flag },
  { slug: 'primeiro_achado', name: 'Primeira descoberta', description: 'Teve a primeira evidência aceita.', icon: Gem },
  { slug: 'olho_de_lince', name: 'Olho de lince', description: 'Cinco primeiras descobertas em lugares diferentes.', icon: Eye },
  { slug: 'bateia', name: 'Bateia', description: 'Confirmou dez descobertas indo até o lugar.', icon: Disc },
  { slug: 'bom_de_prova', name: 'Boa evidência', description: 'Dez evidências fortes.', icon: Camera },
  { slug: 'maratonista', name: 'Maratonista', description: 'Sete dias seguidos ajudando.', icon: Flame },
  { slug: 'mao_aberta', name: 'Mão aberta', description: 'Agradeceu dez vezes com pepitas.', icon: Hand },
  { slug: 'cartografo', name: 'Cartógrafo', description: 'Cadastrou cinco lugares novos.', icon: Map },
  { slug: 'garimpeiro_semana', name: 'Destaque da semana', description: 'Topo do ranking semanal.', icon: Trophy },
];

/** Jornada: patente, árvore de níveis, conquistas e quem mais ajudou a cidade. */
export function Jornada() {
  const { data: me, isPending } = useMe();
  const share = useShare();
  const toast = useToast();
  const [period, setPeriod] = useState<'semana' | 'geral'>('semana');
  const ranking = useQuery({ queryKey: ['ranking', period], queryFn: () => api.ranking(period) });

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

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5 relative overflow-hidden rounded-card bg-floresta-700 text-creme p-5 shadow-float">
        <span className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-lima-400/20" aria-hidden="true" />
        <span className="absolute -right-6 -top-6 h-36 w-36 rounded-full border border-lima-400/20" aria-hidden="true" />
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} url={user.avatarUrl} size={60} lime />
              <div className="min-w-0">
                <h2 className="font-display font-extrabold text-2xl leading-tight line-clamp-2">{user.name}</h2>
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-floresta-900/50 px-2.5 h-7 text-[11px] font-extrabold uppercase tracking-wider text-lima-400">
                  <Sparkles size={13} />Nível {level.level} · {level.name}
                </span>
              </div>
            </div>
          </div>
          <Pepi pose="explorador" size={96} className="-mr-2 -mt-1 shrink-0" />
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

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[[stats.achados, 'descobertas válidas'], [stats.respostas, 'pistas enviadas'], [stats.confirmacoes, 'confirmações']].map(([v, l], i) => (
          <motion.div key={l as string} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }} className="rounded-card bg-surface border border-line py-3.5 px-2 text-center">
            <p className="font-display font-extrabold text-2xl tabular">{v as number}</p>
            <p className="text-xs text-ink-2 leading-tight mt-0.5">{l as string}</p>
          </motion.div>
        ))}
      </div>
      {user.streakDays > 1 && <p className="mt-3 text-sm font-bold text-gold-ink inline-flex items-center gap-1.5"><Flame size={16} />{user.streakDays} dias seguidos ajudando</p>}

      <section className="mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-extrabold text-xl">Sua árvore de conquistas</h2>
          <span className="text-sm text-ink-2">{LEVELS.length} níveis</span>
        </div>
        <ol className="mt-3 relative">
          <span className="absolute left-[2.1rem] top-6 bottom-6 w-px bg-line" aria-hidden="true" />
          {LEVELS.map((l, i) => {
            const state = l.level === level.level ? 'atual' : l.level < level.level ? 'feito' : 'futuro';
            return (
              <motion.li key={l.level} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }}
                className={`relative flex items-center gap-3 px-2 py-2.5 rounded-card ${state === 'atual' ? 'bg-lima-100 dark:bg-floresta-600' : ''}`}>
                <span className={`relative h-[3.3rem] w-[3.3rem] shrink-0 grid place-items-center rounded-2xl ${state === 'atual' ? 'bg-lima-400' : state === 'feito' ? 'bg-esmeralda-100' : 'bg-surface border border-line'}`}>
                  <RankBadge level={l.level} size={30} dim={state === 'futuro'} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block font-display font-extrabold text-[17px] leading-tight ${state === 'futuro' ? 'text-ink-2' : ''}`}>{l.name}</span>
                  <span className="block text-sm text-ink-2 leading-snug">{l.motto}</span>
                </span>
                <span className={`text-sm font-bold tabular shrink-0 ${state === 'atual' ? 'text-green-ink' : 'text-ink-2'}`}>{l.xp.toLocaleString('pt-BR')} XP{state === 'atual' ? ' · atual' : ''}</span>
              </motion.li>
            );
          })}
        </ol>
        <p className="text-sm text-ink-2 mt-2 px-2">{level.perk}</p>
      </section>

      <Link to="/missoes" className="mt-5 flex items-center gap-3 rounded-card bg-surface border border-line px-4 py-3.5">
        <span className="h-10 w-10 grid place-items-center rounded-full bg-ouro-100 text-gold-ink"><Trophy size={20} /></span>
        <span className="flex-1 min-w-0"><span className="block font-display font-extrabold">Missão da semana</span><span className="block text-sm text-ink-2">Reconfirme uma pista antiga.</span></span>
        <span className="inline-flex items-center gap-1 font-bold text-green-ink text-sm">+15 XP <ArrowRight size={16} /></span>
      </Link>

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
          <div className="flex gap-1 rounded-full bg-surface-2 p-1">
            {(['semana', 'geral'] as const).map((p) => <button key={p} type="button" onClick={() => setPeriod(p)} className={`h-8 px-3 rounded-full font-display font-bold text-xs ${period === p ? 'bg-floresta-700 text-lima-400' : 'text-ink-2'}`}>{p === 'semana' ? 'Semana' : 'Geral'}</button>)}
          </div>
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
