import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { api } from '@/lib/api';
import { useGeo, useMe } from '@/lib/hooks';
import { CATEGORIES } from '@/lib/format';
import { QuestionCard } from '@/components/QuestionCard';
import { Button, Chip, EmptyState, Headline, Spinner } from '@/components/ui';
import { Pepi } from '@/components/brand';

const TABS = [{ id: 'abertas', label: 'Procurando' }, { id: 'resolvida', label: 'Encontradas' }, { id: 'minhas', label: 'Minhas' }] as const;
type Tab = (typeof TABS)[number]['id'];

/** Missões: o que a cidade está procurando agora. */
export function Feed() {
  const [params] = useSearchParams();
  const initial = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'abertas';
  const [tab, setTab] = useState<Tab>(initial);
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<'recentes' | 'populares' | 'perto'>('recentes');
  const geo = useGeo();
  const { data: me, isPending: meLoading } = useMe();
  // "Minhas" só faz sentido com sessão: sem ela a API ignoraria `mine` e devolveria o feed inteiro.
  const needLogin = tab === 'minhas' && !meLoading && !me;
  const query = useInfiniteQuery({
    queryKey: ['questions', tab, cat, sort, geo.pos?.lat, geo.pos?.lng],
    queryFn: ({ pageParam }) => api.questions({
      status: tab === 'minhas' ? 'todas' : tab, mine: tab === 'minhas' ? 1 : undefined, category: cat ?? undefined, sort,
      lat: sort === 'perto' ? geo.pos?.lat : undefined, lng: sort === 'perto' ? geo.pos?.lng : undefined, offset: pageParam,
    }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: !(tab === 'minhas' && !me),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="pb-32">
      <header className="px-4 pt-3">
        <Headline eyebrow="Missões" title="O que a cidade procura agora."
          right={<Link to="/missoes/nova" aria-label="Abrir uma missão" className="h-11 w-11 grid place-items-center rounded-full bg-lima-400 text-floresta-900 shadow-lima"><Flag size={20} /></Link>} />
        <div className="mt-4 flex gap-1 rounded-full bg-surface-2 p-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex-1 h-9 rounded-full font-display font-bold text-sm transition-colors ${tab === t.id ? 'bg-floresta-700 text-lima-400 shadow-sm' : 'text-ink-2'}`}>{t.label}</button>
          ))}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          <Chip active={!cat} onClick={() => setCat(null)}>Tudo</Chip>
          {CATEGORIES.map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>{c.emoji} {c.label}</Chip>)}
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          {(['recentes', 'populares', 'perto'] as const).map((s) => (
            <button key={s} type="button" onClick={() => { setSort(s); if (s === 'perto' && !geo.pos) geo.ask(); }}
              className={`font-bold ${sort === s ? 'text-accent underline underline-offset-4 decoration-2' : 'text-ink-2'}`}>
              {s === 'recentes' ? 'Recentes' : s === 'populares' ? 'Mais pedidas' : 'Perto de mim'}
            </button>
          ))}
        </div>
      </header>
      <div className="px-4 mt-4 space-y-2">
        {query.isLoading && <div className="grid place-items-center py-10"><Spinner /></div>}
        {needLogin && (
          <EmptyState icon={<Flag />} title="Entre para ver as suas" text='Missões que você abriu ou marcou "também preciso" aparecem aqui.'
            action={<Link to="/entrar?next=/missoes"><Button variant="primary">Entrar</Button></Link>} />
        )}
        {!needLogin && items.map((q) => <QuestionCard key={q.id} q={q} />)}
        {!needLogin && query.isSuccess && items.length === 0 && (
          <div className="text-center px-4 py-6">
            <Pepi pose="explorador" size={160} className="mx-auto" />
            <h3 className="font-display font-extrabold text-xl mt-2">Nada por aqui ainda</h3>
            <p className="text-ink-2 mt-1 text-balance">{tab === 'minhas' ? 'Missões que você abriu ou marcou "também preciso" aparecem aqui.' : 'Que tal abrir uma missão para o que você não encontra?'}</p>
            <Link to="/missoes/nova" className="inline-block mt-4"><Button variant="primary"><Flag size={18} />Abrir uma missão</Button></Link>
          </div>
        )}
        {!needLogin && query.hasNextPage && <Button variant="ghost" className="w-full" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Carregar mais</Button>}
      </div>
      {!needLogin && items.length > 0 && (
        <div className="fixed bottom-24 inset-x-0 z-30 mx-auto max-w-lg px-4 pointer-events-none">
          <Link to="/missoes/nova" className="pointer-events-auto block"><Button variant="primary" size="lg" className="w-full"><Flag size={18} />Abrir uma missão</Button></Link>
        </div>
      )}
    </div>
  );
}
