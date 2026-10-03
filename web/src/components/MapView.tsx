import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Find, OpenPin } from '@/lib/types';
import type { Geo } from '@/lib/hooks';

export type Tiles = { url: string; fallbackUrl: string; minZoom: number; maxZoom: number };

const STALE_DAYS = 30;
/** Pino do pacote visual por estado: confirmado, revalidar (achado antigo), em análise (missão aberta) e patrocinado. */
const findIcon = (f: Find, hi: boolean) => {
  const stale = f.lastFindAt && (Date.now() - new Date(f.lastFindAt).getTime()) / 86400000 > STALE_DAYS;
  const kind = f.partnerTier ? 'pin-sponsored' : stale ? 'pin-stale' : 'pin-confirmed';
  const count = f.finds > 1 ? `<span class="pin-count">${f.finds}</span>` : '';
  const ring = hi ? '<span class="pin-ring"></span>' : '';
  return L.divIcon({ className: '', html: `<div class="pin ${kind} ${hi ? 'pin-hi' : ''}">${count}${ring}</div>`, iconSize: [44, 49], iconAnchor: [22, 47] });
};
const openIcon = L.divIcon({ className: '', html: '<div class="pin pin-pending"></div>', iconSize: [44, 49], iconAnchor: [22, 47] });
const meIcon = L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
const clusterIcon = (n: number, kind: 'find' | 'open') => {
  const size = n >= 10 ? 48 : 40;
  return L.divIcon({ className: '', html: `<div class="cluster cluster-${kind}" style="width:${size}px;height:${size}px">${n}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
};

/** Raio (px) dentro do qual pinos viram um agrupamento; acima deste zoom não agrupamos mais. */
const CLUSTER_PX = 60;
const CLUSTER_MAX_ZOOM = 17;

type Pt = { lat: number; lng: number };
type Cluster<T extends Pt> = { items: T[]; lat: number; lng: number };

/** Agrupa pontos próximos na tela (distância em pixels no zoom atual), em uma passada gulosa por grade. */
function clusterByProximity<T extends Pt>(map: L.Map, items: T[], keep?: (t: T) => boolean): Cluster<T>[] {
  const zoom = map.getZoom();
  if (zoom >= CLUSTER_MAX_ZOOM) return items.map((t) => ({ items: [t], lat: t.lat, lng: t.lng }));
  const pts = items.map((t) => ({ t, p: map.project([t.lat, t.lng], zoom) }));
  const cells = new Map<string, Array<{ t: T; p: L.Point }>>();
  for (const x of pts) {
    const k = `${Math.floor(x.p.x / CLUSTER_PX)}:${Math.floor(x.p.y / CLUSTER_PX)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(x);
  }
  const used = new Set<T>();
  const out: Cluster<T>[] = [];
  for (const x of pts) {
    if (used.has(x.t)) continue;
    if (keep?.(x.t)) { used.add(x.t); out.push({ items: [x.t], lat: x.t.lat, lng: x.t.lng }); continue; }
    const cx = Math.floor(x.p.x / CLUSTER_PX), cy = Math.floor(x.p.y / CLUSTER_PX);
    const members: T[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const y of cells.get(`${cx + i}:${cy + j}`) ?? []) {
        if (used.has(y.t) || keep?.(y.t)) continue;
        if (x.p.distanceTo(y.p) <= CLUSTER_PX) { used.add(y.t); members.push(y.t); }
      }
    }
    out.push(centroid(members));
  }
  // Segunda passada: grupos vizinhos cujo centro ainda cai dentro do raio viram um só (evita pino espiando atrás do grupo).
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i]!, b = out[j]!;
      if (a.items.length === 1 && keep?.(a.items[0]!)) continue;
      if (b.items.length === 1 && keep?.(b.items[0]!)) continue;
      if (map.project([a.lat, a.lng], zoom).distanceTo(map.project([b.lat, b.lng], zoom)) <= CLUSTER_PX) {
        out.splice(j, 1); out[i] = centroid([...a.items, ...b.items]); merged = true; break;
      }
    }
  }
  return out;
}
function centroid<T extends Pt>(members: T[]): Cluster<T> {
  return { items: members, lat: members.reduce((a, m) => a + m.lat, 0) / members.length, lng: members.reduce((a, m) => a + m.lng, 0) / members.length };
}

type Item = ({ kind: 'find'; f: Find } | { kind: 'open'; q: OpenPin }) & Pt;

/** Pinos com agrupamento por proximidade (descobertas e missões abertas juntas, para não se sobreporem);
 *  o pino realçado nunca entra num grupo. Tocar no grupo aproxima até separar. */
function Pins({ finds, open, highlight, onFind, onOpen }: { finds: Find[]; open: OpenPin[]; highlight?: string | null; onFind?: (f: Find) => void; onOpen?: (q: OpenPin) => void }) {
  const map = useMap();
  const [tick, setTick] = useState(0);
  useMapEvents({ zoomend: () => setTick((t) => t + 1), moveend: () => setTick((t) => t + 1) });
  const items = useMemo<Item[]>(() => [
    ...open.map((q) => ({ kind: 'open' as const, q, lat: q.lat, lng: q.lng })),
    ...finds.map((f) => ({ kind: 'find' as const, f, lat: f.lat, lng: f.lng })),
  ], [finds, open]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => clusterByProximity(map, items, (i) => i.kind === 'find' && i.f.placeId === highlight), [map, items, highlight, tick]);
  const zoomInto = (c: Cluster<Pt>) => {
    const b = L.latLngBounds(c.items.map((i) => [i.lat, i.lng] as [number, number]));
    if (b.getNorthEast().equals(b.getSouthWest())) map.flyTo([c.lat, c.lng], Math.min(map.getZoom() + 2, CLUSTER_MAX_ZOOM + 1), { duration: 0.6 });
    else map.flyToBounds(b, { padding: [56, 56], maxZoom: CLUSTER_MAX_ZOOM + 1, duration: 0.6 });
  };
  return (
    <>
      {groups.map((c) => {
        if (c.items.length === 1) {
          const i = c.items[0]!;
          return i.kind === 'open'
            ? <Marker key={`o-${i.q.id}`} position={[i.lat, i.lng]} icon={openIcon} eventHandlers={{ click: () => onOpen?.(i.q) }} />
            : <Marker key={`f-${i.f.placeId}`} position={[i.lat, i.lng]} icon={findIcon(i.f, highlight === i.f.placeId)} zIndexOffset={highlight === i.f.placeId ? 1000 : 0} eventHandlers={{ click: () => onFind?.(i.f) }} />;
        }
        const hasFind = c.items.some((i) => i.kind === 'find');
        const n = c.items.reduce((t, i) => t + (i.kind === 'find' ? Math.max(1, i.f.finds) : 1), 0);
        const key = c.items.map((i) => (i.kind === 'find' ? i.f.placeId : i.q.id)).join('.');
        return <Marker key={`c-${key}`} position={[c.lat, c.lng]} icon={clusterIcon(n, hasFind ? 'find' : 'open')} zIndexOffset={500} eventHandlers={{ click: () => zoomInto(c) }} />;
      })}
    </>
  );
}

function Events({ onBounds, onMove }: { onBounds?: (bbox: string) => void; onMove?: (c: [number, number]) => void }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });
  const emit = () => {
    const b = map.getBounds();
    onBounds?.(`${b.getWest().toFixed(5)},${b.getSouth().toFixed(5)},${b.getEast().toFixed(5)},${b.getNorth().toFixed(5)}`);
    const c = map.getCenter();
    onMove?.([c.lat, c.lng]);
  };
  useEffect(() => { emit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return null;
}

function FlyTo({ to, zoom }: { to: [number, number] | null | undefined; zoom?: number }) {
  const map = useMap();
  useEffect(() => { if (to) map.flyTo(to, zoom ?? Math.max(map.getZoom(), 16), { duration: 0.8 }); }, [to?.[0], to?.[1], map, zoom, to]);
  return null;
}

function Tiles({ tiles }: { tiles: Tiles }) {
  const [fallback, setFallback] = useState(false);
  const errors = useRef(0);
  return (
    <TileLayer key={fallback ? 'fb' : 'main'} url={fallback ? tiles.fallbackUrl : tiles.url}
      minZoom={fallback ? 3 : tiles.minZoom} maxZoom={tiles.maxZoom} attribution="© OpenStreetMap"
      eventHandlers={{ tileerror: () => { if (!fallback && ++errors.current >= 4) setFallback(true); } }} />
  );
}

export function MapView(props: {
  center: [number, number]; zoom?: number; tiles: Tiles; className?: string;
  finds?: Find[]; open?: OpenPin[]; highlight?: string | null; me?: Geo | null; flyTo?: [number, number] | null; flyZoom?: number;
  onBounds?: (bbox: string) => void; onMove?: (c: [number, number]) => void; onFind?: (f: Find) => void; onOpen?: (q: OpenPin) => void;
  children?: ReactNode; interactive?: boolean;
}) {
  const { center, zoom = 14, tiles, finds = [], open = [], highlight, me, interactive = true } = props;
  return (
    <MapContainer center={center} zoom={zoom} zoomControl={false} attributionControl className={props.className ?? 'h-full w-full isolate'}
      dragging={interactive} scrollWheelZoom={interactive} doubleClickZoom={interactive} touchZoom={interactive} keyboard={interactive}>
      <Tiles tiles={tiles} />
      <Events onBounds={props.onBounds} onMove={props.onMove} />
      <FlyTo to={props.flyTo} zoom={props.flyZoom} />
      <Pins finds={finds} open={open} highlight={highlight} onFind={props.onFind} onOpen={props.onOpen} />
      {me && <Marker position={[me.lat, me.lng]} icon={meIcon} interactive={false} />}
      {props.children}
    </MapContainer>
  );
}
