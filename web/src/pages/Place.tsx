import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Clock, MapPin, Navigation, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig } from '@/lib/hooks';
import { brl, KINDS, timeAgo } from '@/lib/format';
import { MapView } from '@/components/MapView';
import { Button, EmptyState, Spinner, StatusChip } from '@/components/ui';

/** Lugar: onde fica e tudo que já foi encontrado ali. */
export function PlacePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { data: cfg } = useConfig();
  const p = useQuery({ queryKey: ['place', id], queryFn: () => api.place(id) });
  if (p.isPending) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!p.data) return <EmptyState art="no-results" title="Lugar não encontrado" action={<Link to="/"><Button>Voltar ao mapa</Button></Link>} />;
  const { place, finds } = p.data;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  return (
    <div className="pb-28">
      {cfg && (
        <div className="relative h-56">
          <MapView center={[place.lat, place.lng]} zoom={16} tiles={cfg.tiles} finds={[{ placeId: place.id, name: place.name, kind: place.kind, lat: place.lat, lng: place.lng, address: place.address ?? null, partnerTier: place.partnerTier ?? null, finds: finds.length || 1, titles: [], lastFindAt: finds[0]?.createdAt ?? place.createdAt }]} interactive={false} />
          <button type="button" onClick={() => nav(-1)} aria-label="Voltar" className="absolute left-3 top-3 z-[500] h-10 w-10 grid place-items-center rounded-full bg-surface shadow-float"><ArrowLeft /></button>
        </div>
      )}
      <section className="px-4 -mt-8 relative z-[500]">
        <div className="rounded-card bg-surface shadow-float border border-line p-4">
          <div className="flex items-start gap-3">
            <span className={`h-12 w-12 shrink-0 grid place-items-center rounded-2xl ${place.partnerTier ? 'bg-ouro-100 text-gold-ink' : 'bg-esmeralda-100 text-esmeralda-800'}`}><Store size={24} /></span>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-extrabold text-2xl leading-tight">{place.name}</h1>
              <p className="text-sm text-ink-2 flex items-center gap-1 mt-0.5"><MapPin size={14} />{KINDS[place.kind] ?? place.kind}{place.address ? ` · ${place.address}` : ''}</p>
            </div>
            {place.partnerTier && <StatusChip tone="warn" icon={<Store size={12} />}>Parceira</StatusChip>}
          </div>
          <div className="mt-4 flex gap-2">
            <a href={maps} target="_blank" rel="noreferrer" className="flex-1"><Button variant="primary" className="w-full"><Navigation size={18} />Como chegar</Button></a>
            {place.whatsapp && <a href={`https://wa.me/${place.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><Button variant="soft">WhatsApp</Button></a>}
          </div>
        </div>
      </section>
      <section className="px-4 mt-6">
        <p className="eyebrow">Descobertas</p>
        <h2 className="font-display font-extrabold text-xl">{finds.length === 0 ? 'Nenhuma descoberta registrada' : finds.length === 1 ? 'Uma descoberta aqui' : `${finds.length} descobertas aqui`}</h2>
        <ul className="mt-3 space-y-2">
          {finds.map((f) => (
            <li key={f.answerId}>
              <Link to={`/m/${f.questionId}`} className="flex gap-3 rounded-card bg-surface border border-line p-3">
                {f.photo ? <img src={f.photo} alt="" className="h-20 w-20 rounded-2xl object-cover" /> : <span className="h-20 w-20 rounded-2xl bg-surface-2" />}
                <span className="flex-1 min-w-0">
                  {f.status === 'aceita' ? <StatusChip tone="ok" icon={<BadgeCheck size={12} />}>Encontrado</StatusChip> : f.status === 'confirmada' ? <StatusChip tone="ok" icon={<BadgeCheck size={12} />}>Confirmado</StatusChip> : <StatusChip tone="wait" icon={<Clock size={12} />}>Em análise · {f.confirms} confirmações</StatusChip>}
                  <span className="block font-display font-extrabold leading-tight mt-1.5">{f.title}</span>
                  <span className="block text-xs text-ink-2 mt-0.5">{f.authorName} · {timeAgo(f.createdAt)}{f.priceCents != null ? ` · ${brl(f.priceCents)}` : ''}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-2 mt-4">Estoque pode mudar. Confirme com a loja antes de ir.</p>
      </section>
    </div>
  );
}
