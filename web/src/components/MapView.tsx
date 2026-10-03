import { useEffect, useRef, useState, type ReactNode } from 'react';
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
      {open.map((q) => (
        <Marker key={q.id} position={[q.lat, q.lng]} icon={openIcon} eventHandlers={{ click: () => props.onOpen?.(q) }} />
      ))}
      {finds.map((f) => (
        <Marker key={f.placeId} position={[f.lat, f.lng]} icon={findIcon(f, highlight === f.placeId)} zIndexOffset={highlight === f.placeId ? 1000 : 0}
          eventHandlers={{ click: () => props.onFind?.(f) }} />
      ))}
      {me && <Marker position={[me.lat, me.lng]} icon={meIcon} interactive={false} />}
      {props.children}
    </MapContainer>
  );
}
