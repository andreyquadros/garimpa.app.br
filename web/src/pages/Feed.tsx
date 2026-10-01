import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { useGeo, useMe } from '@/lib/hooks';
import { CATEGORIES } from '@/lib/format';
import { QuestionCard } from '@/components/QuestionCard';
import { Button, Chip, EmptyState, Spinner } from '@/components/ui';
import { Link } from 'react-router';

const TABS = [{ id: 'abertas', label: 'Procurando' }, { id: 'resolvida', label: 'Achados' }, { id: 'minhas', label: 'Meus' }] as const;

export function Feed() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('abertas');
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<'recentes' | 'populares' | 'perto'>('recentes');
  const geo = useGeo();
  const { data: me } = useMe();
  const query = useInfiniteQuery({
    queryKey: ['questions', tab, cat, sort, geo.pos?.lat, geo.pos?.lng],
    queryFn: ({ pageParam }) => api.questions({
      status: tab === 'minhas' ? 'todas' : tab, mine: tab === 'minhas' ? 1 : undefined, category: cat ?? undefined, sort,
      lat: sort === 'perto' ? geo.pos?.lat : undefined, lng: sort === 'perto' ? geo.pos?.lng : undefined, offset: pageParam,
    }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="pb-28">
      <header className="safe-top px-4 pt-3">
        <h1 className="font-display text-3xl">Garimpos</h1>
        <p className="text-ink-2 text-sm">O que a cidade está procurando agora.</p>
        <div className="mt-3 flex gap-1 rounded-full bg-surface-2 p-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex-1 h-9 rounded-full font-display font-semibold text-sm transition-colors ${tab === t.id ? 'bg-rio-700 text-white shadow-sm' : 'text-ink-2'}`}>{t.label}</button>
          ))}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          <Chip active={!cat} onClick={() => setCat(null)}>Tudo</Chip>
          {CATEGORIES.map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>{c.emoji} {c.label}</Chip>)}
        </div>
        <div className="mt-2 flex gap-2 text-sm">
          {(['recentes', 'populares', 'perto'] as const).map((s) => (
            <button key={s} type="button" onClick={() => { setSort(s); if (s === 'perto' && !geo.pos) geo.ask(); }}
              className={`font-semibold ${sort === s ? 'text-accent underline underline-offset-4' : 'text-ink-2'}`}>
              {s === 'recentes' ? 'Recentes' : s === 'populares' ? 'Mais pedidos' : 'Perto de mim'}
            </button>
          ))}
        </div>
      </header>
      <div className="px-3 mt-3 space-y-2">
        {query.isPending && <div className="grid place-items-center py-10"><Spinner /></div>}
        {items.map((q) => <QuestionCard key={q.id} q={q} />)}
        {query.isSuccess && items.length === 0 && (
          <EmptyState icon={<Inbox />} title={tab === 'minhas' && !me ? 'Entre para ver os seus' : 'Nada por aqui ainda'}
            text={tab === 'minhas' ? 'Perguntas que você fez ou marcou "também quero" aparecem aqui.' : 'Que tal perguntar o que você não encontra?'}
            action={<Link to={tab === 'minhas' && !me ? '/entrar' : '/perguntar'}><Button variant="gold">{tab === 'minhas' && !me ? 'Entrar' : 'Perguntar onde tem'}</Button></Link>} />
        )}
        {query.hasNextPage && <Button variant="ghost" className="w-full" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Carregar mais</Button>}
      </div>
    </div>
  );
}
