import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, Flag } from 'lucide-react';
import { api } from '@/lib/api';
import { useGeo, useMe } from '@/lib/hooks';
import { CATEGORIES } from '@/lib/format';
import { QuestionCard } from '@/components/QuestionCard';
import { Button, Chip, EmptyState, Reveal, RevealItem, Segmented, Spinner } from '@/components/ui';
import { Pepi } from '@/components/brand';
import { CategoryIcon } from '@/components/CategoryIcon';

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
      <Reveal>
        <header className="px-4 pt-3">
          <RevealItem>
            <p className="eyebrow">Missões</p>
            <h1 className="display text-[2rem] mt-1">O que a cidade procura.</h1>
          </RevealItem>
          <RevealItem className="mt-4"><Segmented id="missoes" value={tab} onChange={setTab} options={TABS.map((t) => ({ id: t.id, label: t.label }))} /></RevealItem>
          <RevealItem className="mt-3 flex items-center gap-2">
            <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto no-scrollbar -ml-4 pl-4 pr-2">
              <Chip active={!cat} onClick={() => setCat(null)}>Tudo</Chip>
              {CATEGORIES.map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}><CategoryIcon id={c.id} size={15} /> {c.label}</Chip>)}
            </div>
            <label className="shrink-0 relative inline-flex items-center h-9 pl-3 pr-8 rounded-full border border-line bg-surface text-sm font-bold text-ink-2">
              <span>{sort === 'recentes' ? 'Recentes' : sort === 'populares' ? 'Mais pedidas' : 'Perto de mim'}</span>
              <ChevronDown size={16} className="absolute right-2.5 pointer-events-none" />
              <select aria-label="Ordenar" value={sort} onChange={(e) => { const s = e.target.value as typeof sort; setSort(s); if (s === 'perto' && !geo.pos) geo.ask(); }} className="absolute inset-0 opacity-0 w-full">
                <option value="recentes">Recentes</option><option value="populares">Mais pedidas</option><option value="perto">Perto de mim</option>
              </select>
            </label>
          </RevealItem>
        </header>
      </Reveal>
      <div className="px-4 mt-4 space-y-2">
        {query.isLoading && <div className="grid place-items-center py-10"><Spinner /></div>}
        {needLogin && (
          <EmptyState icon={<Flag />} title="Entre para ver as suas" text='Missões que você abriu ou marcou "também preciso" aparecem aqui.'
            action={<Link to="/entrar?next=/missoes"><Button variant="primary">Entrar</Button></Link>} />
        )}
        {!needLogin && items.map((q) => <QuestionCard key={q.id} q={q} hideStatus={tab === 'abertas' ? 'aberta' : tab === 'resolvida' ? 'resolvida' : undefined} />)}
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
