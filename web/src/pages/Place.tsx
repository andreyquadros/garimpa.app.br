import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Navigation, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig } from '@/lib/hooks';
import { brl, KINDS, timeAgo } from '@/lib/format';
import { MapView } from '@/components/MapView';
import { Button, EmptyState, Spinner, Stamp } from '@/components/ui';

export function PlacePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { data: cfg } = useConfig();
  const p = useQuery({ queryKey: ['place', id], queryFn: () => api.place(id) });
  if (p.isPending) return <div className="grid place-items-center h-dvh"><Spinner /></div>;
  if (!p.data) return <EmptyState title="Lugar não encontrado" />;
  const { place, finds } = p.data;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  return (
    <div className="pb-28">
      {cfg && (
        <div className="relative h-56">
          <MapView center={[place.lat, place.lng]} zoom={16} tiles={cfg.tiles} finds={[{ placeId: place.id, name: place.name, kind: place.kind, lat: place.lat, lng: place.lng, address: place.address ?? null, partnerTier: place.partnerTier ?? null, finds: finds.length || 1, titles: [], lastFindAt: place.createdAt }]} interactive={false} />
          <button type="button" onClick={() => nav(-1)} aria-label="Voltar" className="absolute left-3 top-3 z-[500] safe-top h-10 w-10 grid place-items-center rounded-full bg-surface shadow-float"><ArrowLeft /></button>
        </div>
      )}
      <section className="px-4 -mt-6 relative z-[500]">
        <div className="rounded-3xl bg-surface shadow-float border border-line p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl leading-tight">{place.name}</h1>
              <p className="text-sm text-ink-2 flex items-center gap-1 mt-0.5"><MapPin size={14} />{KINDS[place.kind] ?? place.kind}{place.address ? ` · ${place.address}` : ''}</p>
            </div>
            {place.partnerTier && <span className="inline-flex items-center gap-1 rounded-full bg-pepita-200 text-pepita-700 text-xs font-bold px-2 h-7"><Star size={12} />Parceira</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <a href={maps} target="_blank" rel="noreferrer" className="flex-1"><Button variant="primary" className="w-full"><Navigation size={18} />Como chegar</Button></a>
            {place.whatsapp && <a href={`https://wa.me/${place.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><Button variant="soft">WhatsApp</Button></a>}
          </div>
        </div>
      </section>
      <section className="px-4 mt-5">
        <h2 className="font-display text-xl">{finds.length === 0 ? 'Nenhum achado registrado' : `${finds.length} ${finds.length === 1 ? 'achado' : 'achados'} aqui`}</h2>
        <ul className="mt-3 space-y-2">
          {finds.map((f) => (
            <li key={f.answerId}>
              <Link to={`/g/${f.questionId}`} className="flex gap-3 rounded-2xl bg-surface p-3">
                {f.photo ? <img src={f.photo} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <span className="h-16 w-16 rounded-xl bg-surface-2" />}
                <span className="flex-1 min-w-0">
                  <span className="block font-display leading-tight">{f.title}</span>
                  <span className="block text-xs text-ink-2 mt-0.5">{f.authorName} · {timeAgo(f.createdAt)}{f.priceCents != null ? ` · ${brl(f.priceCents)}` : ''}</span>
                  <span className="mt-1 inline-block">{f.status === 'aceita' ? <Stamp tone="gold" className="text-xs">Achado</Stamp> : f.status === 'confirmada' ? <Stamp tone="green" className="text-xs">Confirmado</Stamp> : <span className="text-xs text-ink-2">aguardando confirmação · {f.confirms} 👍</span>}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
