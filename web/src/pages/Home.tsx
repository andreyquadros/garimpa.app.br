import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { BadgeCheck, ChevronRight, Clock, Flag, LocateFixed, MapPin, RefreshCw, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useDebounced, useGeo, useToast } from '@/lib/hooks';
import type { Find } from '@/lib/types';
import { MapView } from '@/components/MapView';
import { SearchHero } from '@/components/SearchPill';
import { SimilarCard } from '@/components/QuestionCard';
import { Button, Spinner, StatusChip } from '@/components/ui';
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
      <div className="relative h-[46dvh] min-h-[320px]">
        {cfg && (
          <MapView center={center} zoom={14} tiles={cfg.tiles} finds={pins} open={searching ? [] : open.data?.items ?? []} highlight={highlight} me={geo.pos}
            flyTo={fly} onBounds={setBbox} onFind={focus} onOpen={(o) => nav(`/m/${o.id}`)} />
        )}
        <div className="absolute left-3 top-3 z-[500] pointer-events-none">
          <span className="pointer-events-auto inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-surface/95 backdrop-blur shadow-float font-display font-extrabold text-[15px]"><MapPin size={16} className="text-accent" />{cityLabel}</span>
        </div>
        <button type="button" onClick={() => { setGoMe(true); geo.ask(); }} aria-label="Minha localização"
          className={`absolute right-3 bottom-24 z-[500] h-12 w-12 rounded-full grid place-items-center shadow-float border border-line ${geo.state === 'ok' ? 'bg-floresta-700 text-lima-400' : 'bg-surface text-accent'}`}>
          {geo.state === 'asking' ? <Spinner size={18} /> : <LocateFixed size={22} />}
        </button>
        <div className="absolute inset-x-0 bottom-0 z-[500] px-4 pb-3 pointer-events-none bg-gradient-to-t from-bg via-bg/75 to-transparent pt-16 [text-shadow:0_1px_14px_var(--bg),0_0_4px_var(--bg)]">
          <div className="pointer-events-auto"><SearchHero value={text} onChange={setText} loading={search.isFetching} compact={searching} /></div>
          {!searching && <p className="text-center text-xs font-semibold text-ink-2 mt-2 pointer-events-auto">Perto de você: casa & cozinha · ferramentas · farmácias</p>}
        </div>
      </div>

      <section className="relative -mt-3 rounded-t-sheet bg-bg px-4 pt-3 shadow-[0_-8px_24px_rgb(16_61_50_/_0.06)]">
        <span className="block mx-auto h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
        <AnimatePresence mode="wait">
          {!searching ? (
            <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display font-extrabold text-2xl leading-tight">Já encontraram por aqui.</h2>
                  <p className="text-ink-2 mt-0.5">Reaproveite descobertas da comunidade.</p>
                </div>
                <Link to="/missoes?tab=resolvida" className="shrink-0 inline-flex items-center gap-0.5 font-bold text-accent text-sm pb-1">Ver todas <ChevronRight size={16} /></Link>
              </div>
              <ul className="mt-4 space-y-2">
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
              <p className="eyebrow mt-4">Busca local</p>
              <h2 className="font-display font-extrabold text-2xl leading-tight">Perto. E já encontrado.</h2>
              {search.isPending && <div className="flex items-center gap-3 text-ink-2 text-sm mt-4"><Anim name="search-radar" size={56} />Procurando descobertas…</div>}
              {similar.length > 0 && (
                <div className="mt-4 rounded-card bg-lima-100 dark:bg-floresta-600 border border-esmeralda-100 dark:border-floresta-600 p-4 flex gap-3">
                  <RefreshCw size={22} className="text-accent shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-extrabold">Você não precisa começar do zero.</p>
                    <p className="text-sm text-ink-2">{similar.length === 1 ? 'Uma missão parecida já encontrou pistas.' : `${similar.length} missões parecidas já encontraram pistas.`}</p>
                    <div className="mt-3 space-y-2">{similar.slice(0, 3).map((s) => <SimilarCard key={s.id} s={s} />)}</div>
                  </div>
                </div>
              )}
              {pins.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-baseline justify-between"><h3 className="font-display font-extrabold text-lg">{pins.length === 1 ? '1 pista para sua busca' : `${pins.length} pistas para sua busca`}</h3><span className="text-xs text-ink-2">toque para ver no mapa</span></div>
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

/** Linha de descoberta: estado (Confirmado, Reconfirmar, Patrocinado), lugar, última evidência. */
function FindRow({ f, hi, onFocus }: { f: Find; hi: boolean; onFocus: () => void }) {
  const stale = isStale(f);
  return (
    <li className={`rounded-card bg-surface border overflow-hidden ${hi ? 'border-lima-400 ring-2 ring-lima-400/50' : 'border-line'}`}>
      <div className="flex items-stretch">
        <button type="button" onClick={onFocus} className="flex-1 min-w-0 text-left p-3.5 flex items-start gap-3">
          <span className={`h-14 w-14 shrink-0 grid place-items-center rounded-2xl ${f.partnerTier ? 'bg-ouro-100 text-gold-ink' : stale ? 'bg-surface-2 text-ink-2' : 'bg-esmeralda-100 text-esmeralda-800'}`}><Store size={24} /></span>
          <span className="flex-1 min-w-0">
            {f.partnerTier ? <StatusChip tone="warn" icon={<Store size={12} />}>Patrocinado</StatusChip> : stale ? <StatusChip tone="wait" icon={<Clock size={12} />}>Reconfirmar</StatusChip> : <StatusChip tone="ok" icon={<BadgeCheck size={12} />}>Confirmado</StatusChip>}
            <span className="block font-display font-extrabold text-[17px] leading-snug mt-1.5 truncate">{f.name}</span>
            <span className="block text-sm text-ink-2 truncate">{f.titles.slice(0, 2).join(' · ')}</span>
            <span className="mt-1.5 flex items-center gap-1 text-xs text-ink-2"><Clock size={12} />Evidência {timeAgo(f.lastFindAt)} · {stale ? 'precisa reconfirmar' : 'estoque pode mudar'}</span>
          </span>
        </button>
        <Link to={`/lugar/${f.placeId}`} aria-label={`Abrir ${f.name}`} className="shrink-0 w-12 grid place-items-center text-accent border-l border-line"><ChevronRight size={20} /></Link>
      </div>
      {f.finds > 1 && <p className="px-3.5 py-1.5 border-t border-line text-xs font-bold text-green-ink bg-surface-2/60">{f.finds} descobertas registradas aqui</p>}
    </li>
  );
}
