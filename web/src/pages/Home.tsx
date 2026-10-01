import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { LocateFixed, MapPin, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useDebounced, useGeo, useMe, useToast } from '@/lib/hooks';
import type { Find } from '@/lib/types';
import { MapView } from '@/components/MapView';
import { SearchPill } from '@/components/SearchPill';
import { SimilarCard } from '@/components/QuestionCard';
import { Avatar, Logo, PepitaPill, Spinner } from '@/components/ui';
import { timeAgo } from '@/lib/format';

export function Home() {
  const { data: cfg } = useConfig();
  const { data: me } = useMe();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text.trim(), 350);
  const [bbox, setBbox] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [fly, setFly] = useState<[number, number] | null>(null);
  const geo = useGeo();
  const { push: notify } = useToast();
  // "Minha localização": a posição chega num callback assíncrono, então guardamos a intenção e voamos quando ela existir.
  const [goMe, setGoMe] = useState(false);

  useEffect(() => { setParams(q ? { q } : {}, { replace: true }); }, [q, setParams]);
  useEffect(() => {
    if (!goMe) return;
    if (geo.pos) { setFly([geo.pos.lat, geo.pos.lng]); setGoMe(false); return; }
    if (geo.state === 'denied' || geo.state === 'unavailable') {
      notify({ text: geo.state === 'denied' ? 'Localização negada no navegador.' : 'Localização indisponível neste aparelho.', tone: 'erro' });
      setGoMe(false);
    }
  }, [goMe, geo.pos, geo.state, notify]);

  const search = useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.length >= 2 });
  const finds = useQuery({ queryKey: ['mapFinds', bbox, q], queryFn: () => api.mapFinds(bbox!, q || undefined), enabled: !!bbox, placeholderData: (p) => p });
  const open = useQuery({ queryKey: ['mapOpen', bbox], queryFn: () => api.mapOpen(bbox!), enabled: !!bbox && !q, placeholderData: (p) => p });

  const pins: Find[] = useMemo(() => {
    if (q && search.data) {
      const byId = new Map<string, Find>();
      for (const f of search.data.finds) byId.set(f.placeId, f);
      for (const f of finds.data?.items ?? []) byId.set(f.placeId, f);
      return [...byId.values()];
    }
    return finds.data?.items ?? [];
  }, [q, search.data, finds.data]);

  const center: [number, number] = cfg?.city ? [cfg.city.lat, cfg.city.lng] : [-9.9075, -63.0415];
  const nothing = q.length >= 2 && search.isSuccess && pins.length === 0 && search.data.similar.length === 0;

  return (
    <div className="relative h-dvh">
      {cfg && (
        <MapView center={center} zoom={14} tiles={cfg.tiles} finds={pins} open={q ? [] : open.data?.items ?? []} highlight={highlight} me={geo.pos}
          flyTo={fly} onBounds={setBbox} onFind={(f) => { setHighlight(f.placeId); setFly([f.lat, f.lng]); }} onOpen={(o) => nav(`/g/${o.id}`)} />
      )}

      <div className="absolute inset-x-0 top-0 z-[500] safe-top px-3 pt-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Link to="/perfil" aria-label="Garimpa" className="h-11 w-11 grid place-items-center rounded-full bg-surface shadow-float border border-line"><Logo size={26} /></Link>
          <div className="flex-1 min-w-0"><SearchPill value={text} onChange={setText} loading={search.isFetching} /></div>
          {me ? (
            <Link to="/perfil" className="h-11 pl-1 pr-2.5 rounded-full bg-surface shadow-float border border-line flex items-center gap-1.5 shrink-0">
              <Avatar name={me.user.name} url={me.user.avatarUrl} size={34} />
              <PepitaPill value={me.user.credits} pending={me.user.creditsPending} size="sm" />
            </Link>
          ) : (
            <Link to="/entrar" className="h-11 px-3 rounded-full bg-rio-700 text-white font-display font-semibold shadow-float grid place-items-center">Entrar</Link>
          )}
        </div>

        <AnimatePresence>
          {q.length >= 2 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="pointer-events-auto mt-2 max-h-[50dvh] overflow-y-auto rounded-3xl bg-surface/95 backdrop-blur shadow-float border border-line p-3 space-y-3">
              {search.isPending && <div className="flex items-center gap-2 text-ink-2 text-sm px-1"><Spinner size={16} />Garimpando…</div>}
              {pins.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-ink-2 px-1 mb-1.5">Tem em {pins.length} {pins.length === 1 ? 'lugar' : 'lugares'}</p>
                  <ul className="space-y-1">
                    {pins.slice(0, 6).map((f) => (
                      <li key={f.placeId} className={`flex items-center rounded-2xl ${highlight === f.placeId ? 'bg-pepita-200/60' : 'hover:bg-surface-2'}`}>
                        <button type="button" onClick={() => { setHighlight(f.placeId); setFly([f.lat, f.lng]); }} className="flex-1 min-w-0 text-left px-3 py-2 flex items-center gap-3">
                          <span className="h-9 w-9 rounded-full bg-pepita-400 text-rio-900 grid place-items-center font-display font-bold">{f.finds}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold truncate">{f.name}</span>
                            <span className="block text-xs text-ink-2 truncate">{f.titles.slice(0, 2).join(' · ')} · {timeAgo(f.lastFindAt)}</span>
                          </span>
                        </button>
                        <Link to={`/lugar/${f.placeId}`} className="shrink-0 h-11 px-3 grid place-items-center text-xs font-bold text-accent">abrir</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {search.data && search.data.similar.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-ink-2 px-1 mb-1.5">Já garimparam isso</p>
                  <div className="space-y-2">{search.data.similar.slice(0, 3).map((s) => <SimilarCard key={s.id} s={s} />)}</div>
                </div>
              )}
              {nothing && (
                <div className="text-center py-3 px-2">
                  <Sparkles className="mx-auto text-pepita-500" />
                  <p className="font-display text-lg mt-1">Ninguém garimpou isso ainda</p>
                  <p className="text-sm text-ink-2">Seja a primeira pessoa a perguntar. Quem achar ganha pepitas, você ganha XP.</p>
                  <Link to={`/perguntar?title=${encodeURIComponent(text.trim())}`} className="mt-3 inline-flex h-11 px-5 items-center rounded-full bg-pepita-400 text-rio-900 font-display font-semibold shadow-pepita">Perguntar onde tem</Link>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute right-3 bottom-28 z-[500] flex flex-col gap-2">
        <button type="button" onClick={() => { setGoMe(true); geo.ask(); }} aria-label="Minha localização"
          className={`h-12 w-12 rounded-full grid place-items-center shadow-float border border-line ${geo.state === 'ok' ? 'bg-rio-700 text-white' : 'bg-surface text-accent'}`}>
          {geo.state === 'asking' ? <Spinner size={18} /> : <LocateFixed size={22} />}
        </button>
      </div>

      {!q && (finds.data?.items.length ?? 0) > 0 && (
        <div className="absolute inset-x-0 bottom-24 z-[500] pointer-events-none">
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 pointer-events-auto snap-x">
            {(finds.data?.items ?? []).slice(0, 12).map((f) => (
              <button key={f.placeId} type="button" onClick={() => { setHighlight(f.placeId); setFly([f.lat, f.lng]); }}
                className={`snap-start shrink-0 w-56 text-left rounded-2xl p-3 shadow-float border ${highlight === f.placeId ? 'bg-pepita-200 border-pepita-400' : 'bg-surface border-line'}`}>
                <p className="font-display leading-tight truncate flex items-center gap-1"><MapPin size={14} className="text-accent" />{f.name}</p>
                <p className="text-xs text-ink-2 mt-1 line-clamp-2">{f.titles.slice(0, 3).join(' · ')}</p>
                <p className={`text-xs font-bold mt-1 ${highlight === f.placeId ? 'text-pepita-700' : 'text-gold-ink'}`}>{f.finds} {f.finds === 1 ? 'achado' : 'achados'}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
