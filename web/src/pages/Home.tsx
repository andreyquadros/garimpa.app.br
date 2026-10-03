import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { BadgeCheck, ChevronRight, Clock, Flag, LocateFixed, RefreshCw, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useDebounced, useGeo, useToast } from '@/lib/hooks';
import type { Find } from '@/lib/types';
import { MapView } from '@/components/MapView';
import { SearchHero } from '@/components/SearchPill';
import { SimilarCard } from '@/components/QuestionCard';
import { Button, Spinner } from '@/components/ui';
import { Anim, Pepi } from '@/components/brand';
import { timeAgo } from '@/lib/format';

const STALE_DAYS = 30;
const isStale = (f: Find) => Date.now() - new Date(f.lastFindAt).getTime() > STALE_DAYS * 86400000;

/** Explorar: mapa com busca central e a folha "Já encontraram por aqui". */
export function Home() {
  const { data: cfg } = useConfig();
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

  // URL <-> campo: escrevemos ?q= ao digitar e lemos de volta só quando a mudança veio de fora (link compartilhado, voltar).
  const paramQ = params.get('q') ?? '';
  const lastWritten = useRef(q);
  useEffect(() => { lastWritten.current = q; setParams(q ? { q } : {}, { replace: true }); }, [q, setParams]);
  useEffect(() => { if (paramQ !== lastWritten.current) { lastWritten.current = paramQ; setText(paramQ); } }, [paramQ]);
  useEffect(() => {
    if (!goMe) return;
    if (geo.pos) { setFly([geo.pos.lat, geo.pos.lng]); setGoMe(false); return; }
    if (geo.state === 'denied' || geo.state === 'unavailable') {
      notify({ text: geo.state === 'denied' ? 'Localização negada no navegador.' : 'Localização indisponível neste aparelho.', tone: 'erro' });
      setGoMe(false);
    }
  }, [goMe, geo.pos, geo.state, notify]);

  const searching = q.length >= 2;
  const search = useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: searching });
  const finds = useQuery({ queryKey: ['mapFinds', bbox, q], queryFn: () => api.mapFinds(bbox!, q || undefined), enabled: !!bbox, placeholderData: (p) => p });
  const open = useQuery({ queryKey: ['mapOpen', bbox], queryFn: () => api.mapOpen(bbox!), enabled: !!bbox && !q, placeholderData: (p) => p });

  const pins: Find[] = useMemo(() => {
    if (searching && search.data) {
      const byId = new Map<string, Find>();
      for (const f of search.data.finds) byId.set(f.placeId, f);
      for (const f of finds.data?.items ?? []) byId.set(f.placeId, f);
      return [...byId.values()];
    }
    return finds.data?.items ?? [];
  }, [searching, search.data, finds.data]);

  const center: [number, number] = cfg?.city ? [cfg.city.lat, cfg.city.lng] : [-9.9075, -63.0415];
  const cityLabel = cfg?.city ? `${cfg.city.name}, ${cfg.city.state}` : 'Ariquemes, RO';
  const similar = search.data?.similar ?? [];
  const nothing = searching && search.isSuccess && pins.length === 0 && similar.length === 0;
  const focus = (f: Find) => { setHighlight(f.placeId); setFly([f.lat, f.lng]); };

  return (
    <div className="flex-1 flex flex-col pb-28">
      <div className="relative h-[42dvh] min-h-[300px]">
        {cfg && (
          <MapView center={center} zoom={14} tiles={cfg.tiles} finds={pins} open={searching ? [] : open.data?.items ?? []} highlight={highlight} me={geo.pos}
            flyTo={fly} onBounds={setBbox} onFind={focus} onOpen={(o) => nav(`/m/${o.id}`)} />
        )}
        <div className="absolute inset-x-0 top-0 z-[500] px-3 pt-3 pointer-events-none">
          <div className="pointer-events-auto"><SearchHero value={text} onChange={setText} loading={search.isFetching} compact placeholder={`Buscar em ${cityLabel}`} /></div>
        </div>
        <button type="button" onClick={() => { setGoMe(true); geo.ask(); }} aria-label="Minha localização"
          className={`press absolute right-3 bottom-5 z-[500] h-12 w-12 rounded-full grid place-items-center shadow-float border border-line ${geo.state === 'ok' ? 'bg-brand text-on-brand' : 'bg-surface text-accent'}`}>
          {geo.state === 'asking' ? <Spinner size={18} /> : <LocateFixed size={22} />}
        </button>
      </div>

      <section className="relative -mt-3 rounded-t-sheet bg-bg px-4 pt-3 shadow-[0_-8px_24px_rgb(16_61_50_/_0.06)]">
        <span className="block mx-auto h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
        <AnimatePresence mode="wait">
          {!searching ? (
            <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <h2 className="display text-[1.5rem]">Já encontraram por aqui.</h2>
                <Link to="/missoes?tab=resolvida" className="shrink-0 inline-flex items-center gap-0.5 font-bold text-accent text-sm">Ver todas <ChevronRight size={16} /></Link>
              </div>
              <ul className="mt-3 space-y-2">
                {finds.isPending && !finds.data && <li className="grid place-items-center py-6"><Anim name="search-radar" size={72} /></li>}
                {(finds.data?.items ?? []).slice(0, 8).map((f) => <FindRow key={f.placeId} f={f} hi={highlight === f.placeId} onFocus={() => focus(f)} />)}
                {finds.isSuccess && (finds.data?.items.length ?? 0) === 0 && (
                  <li className="rounded-card bg-surface border border-line p-4 flex items-center gap-3">
                    <Pepi pose="explorador" size={80} />
                    <span className="text-sm text-ink-2">Ninguém registrou uma descoberta nesta área ainda. Mova o mapa ou abra uma missão.</span>
                  </li>
                )}
              </ul>
              <Link to="/missoes" className="mt-4 flex items-center gap-2 py-2">
                <Flag size={18} className="text-accent" /><span className="flex-1 font-bold">Sua descoberta ajuda alguém.</span><span className="font-bold text-accent text-sm inline-flex items-center gap-0.5">Colaborar <ChevronRight size={16} /></span>
              </Link>
            </motion.div>
          ) : (
            <motion.div key="search" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h2 className="display text-[1.5rem] mt-3">Perto. E já encontrado.</h2>
              {search.isPending && <div className="flex items-center gap-3 text-ink-2 text-sm mt-4"><Anim name="search-radar" size={56} />Procurando descobertas…</div>}
              {similar.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-ink-2 inline-flex items-center gap-1.5"><RefreshCw size={14} className="text-accent" />{similar.length === 1 ? 'Uma missão parecida já encontrou pistas.' : `${similar.length} missões parecidas já encontraram pistas.`}</p>
                  <div className="mt-2 space-y-2">{similar.slice(0, 3).map((s) => <SimilarCard key={s.id} s={s} />)}</div>
                </div>
              )}
              {pins.length > 0 && (
                <div className="mt-5">
                  <h3 className="font-display font-extrabold text-lg">{pins.length === 1 ? '1 pista para sua busca' : `${pins.length} pistas para sua busca`}</h3>
                  <ul className="mt-3 space-y-2">{pins.slice(0, 8).map((f) => <FindRow key={f.placeId} f={f} hi={highlight === f.placeId} onFocus={() => focus(f)} />)}</ul>
                </div>
              )}
              {nothing && (
                <div className="mt-5 text-center">
                  <Pepi pose="explorador" size={150} className="mx-auto" />
                  <h3 className="font-display font-extrabold text-xl mt-2">Ninguém encontrou isso ainda</h3>
                  <p className="text-sm text-ink-2 text-balance mt-1">Abra uma missão. Quem souber onde tem responde com evidência e ganha pepitas.</p>
                </div>
              )}
              {search.isSuccess && (
                <Link to={`/missoes/nova?title=${encodeURIComponent(text.trim())}`} className="block mt-5"><Button variant="primary" size="lg" className="w-full"><Flag size={18} />{nothing ? 'Abrir uma missão' : 'Ainda precisa de ajuda? Abra uma missão'}</Button></Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

/** Linha de descoberta: lugar, o que acharam, estado em texto. Toque abre o lugar; passar por cima realça no mapa. */
function FindRow({ f, hi, onFocus }: { f: Find; hi: boolean; onFocus: () => void }) {
  const stale = isStale(f);
  const state = f.partnerTier ? ['Patrocinado', 'text-gold-ink', Store] as const : stale ? ['Reconfirmar', 'text-ink-2', Clock] as const : ['Confirmado', 'text-green-ink', BadgeCheck] as const;
  const Icon = state[2];
  return (
    <li>
      <Link to={`/lugar/${f.placeId}`} onMouseEnter={onFocus} onFocus={onFocus} className={`press flex items-start gap-3 rounded-card bg-surface border p-3.5 ${hi ? 'border-lima-400 ring-2 ring-lima-400/50' : 'border-line'}`}>
        <span className={`h-11 w-11 shrink-0 grid place-items-center rounded-xl ${f.partnerTier ? 'bg-ouro-100 text-gold-ink' : 'bg-surface-2 text-accent'}`}><Store size={20} /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-extrabold text-[17px] leading-snug truncate">{f.name}</span>
          <span className="block text-sm text-ink-2 truncate">{f.titles.slice(0, 2).join(' · ')}</span>
          <span className={`mt-1.5 inline-flex items-center gap-1 text-xs font-bold ${state[1]}`}><Icon size={12} />{state[0]}<span className="font-semibold text-ink-2"> · {timeAgo(f.lastFindAt)}{f.finds > 1 ? ` · ${f.finds} descobertas` : ''}</span></span>
        </span>
      </Link>
    </li>
  );
}
