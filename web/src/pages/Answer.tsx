import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Camera, MapPin, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useDebounced, useGeo, useInvalidate, useMe, useToast } from '@/lib/hooks';
import type { PlaceLite, UploadResult } from '@/lib/types';
import { dist, KINDS } from '@/lib/format';
import { MapView } from '@/components/MapView';
import { checksFromUpload, EvidenceChecklist } from '@/components/EvidenceChecklist';
import { Button, Chip, Field, PepitaIcon, Spinner, Stamp, TextArea } from '@/components/ui';

type Step = 'lugar' | 'prova' | 'detalhes' | 'pronto';

export function AnswerPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { data: cfg } = useConfig();
  const { data: me, isPending } = useMe();
  const toast = useToast();
  const invalidate = useInvalidate();
  const geo = useGeo();
  const q = useQuery({ queryKey: ['question', id], queryFn: () => api.question(id) });
  const [step, setStep] = useState<Step>('lugar');
  const [place, setPlace] = useState<PlaceLite | null>(null);
  const [newPlace, setNewPlace] = useState<{ name: string; kind: string; address: string; lat: number; lng: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const dq = useDebounced(placeQuery.trim(), 300);
  const places = useQuery({ queryKey: ['places', dq, geo.pos?.lat, geo.pos?.lng], queryFn: () => api.places({ q: dq || undefined, lat: geo.pos?.lat, lng: geo.pos?.lng }) });
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ xp: number; strong: boolean; isFirst: boolean; evidenceScore: number } | null>(null);

  useEffect(() => { if (!isPending && !me) nav(`/entrar?next=${encodeURIComponent(pathname)}`, { replace: true }); }, [me, isPending, nav, pathname]);
  useEffect(() => { if (geo.state === 'idle') geo.ask(); }, [geo]);

  const city: [number, number] = cfg?.city ? [cfg.city.lat, cfg.city.lng] : [-9.9075, -63.0415];
  const chosenName = place?.name ?? newPlace?.name ?? '';

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 4 - uploads.length)) {
        const r = await api.upload(f, { lat: geo.pos?.lat, lng: geo.pos?.lng, kind: 'foto_produto' });
        setUploads((u) => [...u, r]);
      }
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
    finally { setUploading(false); }
  }
  async function submit() {
    setBusy(true);
    try {
      const cents = price ? Math.round(Number(price.replace(/\./g, '').replace(',', '.')) * 100) : undefined;
      const r = await api.createAnswer(id, {
        placeId: place?.id, newPlace: newPlace ? { name: newPlace.name, kind: newPlace.kind, address: newPlace.address || undefined, lat: newPlace.lat, lng: newPlace.lng } : undefined,
        note: note.trim() || undefined, priceCents: Number.isFinite(cents) ? cents : undefined, evidenceIds: uploads.map((u) => u.id),
      });
      invalidate(['question', 'questions', 'me', 'mapFinds']);
      setResult(r);
      setStep('pronto');
      toast.push({ text: r.strong ? 'Pista com prova forte enviada.' : 'Pista enviada. Peça para alguém confirmar.', xp: r.xp });
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
    finally { setBusy(false); }
  }

  const order: Step[] = ['lugar', 'prova', 'detalhes'];
  const idx = order.indexOf(step);
  return (
    <div className="min-h-dvh flex flex-col pb-6">
      <header className="safe-top px-4 pt-3 flex items-center gap-2">
        <button type="button" onClick={() => (idx > 0 ? setStep(order[idx - 1]!) : nav(-1))} aria-label="Voltar" className="h-10 w-10 grid place-items-center rounded-full hover:bg-surface-2"><ArrowLeft /></button>
        <div className="flex-1 min-w-0">
          {step !== 'pronto' && <div className="flex gap-1.5">{order.map((s, i) => <span key={s} className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><motion.span className="block h-full bg-pepita-400" initial={false} animate={{ width: i <= idx ? '100%' : '0%' }} /></span>)}</div>}
          <p className="text-xs font-semibold text-ink-2 mt-1 truncate">Onde tem: {q.data?.question.title ?? '…'}</p>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {step === 'lugar' && (
          <motion.section key="lugar" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="px-4 mt-5 flex-1">
            <h1 className="font-display text-2xl leading-tight">Em qual lugar você viu?</h1>
            {!picking ? (
              <>
                <div className="mt-3 flex items-center gap-2 h-12 rounded-full bg-surface border border-line px-4">
                  <Search size={18} className="text-accent" /><input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="Nome da loja ou mercado" className="flex-1 bg-transparent outline-none" />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {places.isPending && <li className="py-4 grid place-items-center"><Spinner /></li>}
                  {(places.data?.items ?? []).map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => { setPlace(p); setNewPlace(null); setStep('prova'); }} className="w-full text-left rounded-2xl bg-surface border border-line px-4 py-3 flex items-center gap-3 hover:bg-surface-2">
                        <span className="h-10 w-10 rounded-full bg-accent/15 text-accent grid place-items-center"><MapPin size={18} /></span>
                        <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{p.name}</span><span className="block text-xs text-ink-2 truncate">{KINDS[p.kind] ?? p.kind}{p.address ? ` · ${p.address}` : ''}{p.distanceM != null ? ` · ${dist(p.distanceM)}` : ''}{p.finds ? ` · ${p.finds} achados` : ''}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => { setPicking(true); setNewPlace({ name: placeQuery, kind: 'loja', address: '', lat: geo.pos?.lat ?? city[0], lng: geo.pos?.lng ?? city[1] }); }}
                  className="mt-3 w-full rounded-2xl border-2 border-dashed border-line px-4 py-3 flex items-center gap-3 text-accent font-semibold hover:bg-surface-2">
                  <span className="h-10 w-10 rounded-full bg-pepita-200 grid place-items-center"><Plus /></span>Não achei: marcar lugar novo no mapa
                </button>
              </>
            ) : newPlace && cfg && (
              <div className="mt-3">
                <div className="relative h-64 rounded-2xl overflow-hidden border border-line">
                  <MapView center={[newPlace.lat, newPlace.lng]} zoom={16} tiles={cfg.tiles} me={geo.pos} onMove={(c) => setNewPlace((p) => (p ? { ...p, lat: c[0], lng: c[1] } : p))} />
                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full z-[500]"><div className="pin"><span>+</span></div></div>
                  <p className="absolute left-2 right-2 bottom-2 z-[500] text-center text-xs font-semibold bg-surface/90 rounded-full py-1">Arraste o mapa até a entrada da loja</p>
                </div>
                <div className="mt-3 space-y-3">
                  <Field label="Nome do lugar" value={newPlace.name} onChange={(e) => setNewPlace({ ...newPlace, name: e.target.value })} placeholder="Casa & Cozinha" />
                  <Field label="Endereço ou referência (opcional)" value={newPlace.address} onChange={(e) => setNewPlace({ ...newPlace, address: e.target.value })} placeholder="Av. Jamari, Setor 01" />
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">{Object.entries(KINDS).map(([k, l]) => <Chip key={k} active={newPlace.kind === k} onClick={() => setNewPlace({ ...newPlace, kind: k })}>{l}</Chip>)}</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="ghost" onClick={() => setPicking(false)}>Voltar</Button>
                  <Button className="flex-1" disabled={newPlace.name.trim().length < 2} onClick={() => { setPlace(null); setStep('prova'); }}>Usar este lugar</Button>
                </div>
              </div>
            )}
          </motion.section>
        )}

        {step === 'prova' && (
          <motion.section key="prova" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="px-4 mt-5 flex-1">
            <h1 className="font-display text-2xl leading-tight">Mostre a prova</h1>
            <p className="text-sm text-ink-2 mt-1">Foto do produto na prateleira de <b className="text-ink">{chosenName}</b>, nota ou recibo. É a prova que vale pepitas.</p>
            <label className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-6 cursor-pointer ${uploads.length ? 'border-line' : 'border-pepita-400 bg-pepita-200/30'}`}>
              {uploading ? <Spinner /> : <span className="h-14 w-14 rounded-full bg-pepita-400 text-rio-900 grid place-items-center"><Camera size={26} /></span>}
              <span className="font-display font-semibold">{uploads.length ? 'Adicionar outra foto' : 'Tirar foto agora'}</span>
              <span className="text-xs text-ink-2 text-center">Pelo app da câmera, com localização ligada, a foto carrega GPS e vale mais.</span>
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={uploading || uploads.length >= 4} onChange={(e) => onFiles(e.target.files)} />
            </label>
            <div className="mt-4 space-y-3">
              {uploads.map((u, i) => (
                <motion.div key={u.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                  <img src={u.url} alt={`Prova ${i + 1}`} className="h-28 w-24 rounded-2xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0"><EvidenceChecklist checks={checksFromUpload(u)} /></div>
                </motion.div>
              ))}
            </div>
            <Button size="lg" className="w-full mt-5" disabled={uploads.length === 0 || uploading} onClick={() => setStep('detalhes')}>Continuar</Button>
          </motion.section>
        )}

        {step === 'detalhes' && (
          <motion.section key="detalhes" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="px-4 mt-5 flex-1 space-y-4">
            <h1 className="font-display text-2xl leading-tight">Ajude quem vai lá</h1>
            <TextArea label="Onde fica dentro da loja? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} placeholder="Corredor dos potes, prateleira de baixo. Perguntei pro Seu Zé do caixa." />
            <Field label="Preço que você viu (opcional)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="24,90" />
            <div className="rounded-2xl bg-surface-2 p-3 text-sm">
              <p className="font-semibold flex items-center gap-1"><PepitaIcon size={16} />O que você ganha</p>
              <ul className="mt-1 text-ink-2 space-y-0.5">
                <li>XP agora pela pista com prova.</li>
                <li>50 pepitas se quem perguntou aceitar; 20 se duas pessoas confirmarem no local.</li>
                <li>Primeiro achado no lugar leva tudo; os seguintes, 25% como confirmação.</li>
              </ul>
            </div>
            <Button variant="gold" size="lg" className="w-full" loading={busy} onClick={submit}>Enviar pista</Button>
          </motion.section>
        )}

        {step === 'pronto' && result && (
          <motion.section key="pronto" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="px-4 mt-10 flex-1 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }} className="mx-auto h-24 w-24 rounded-full bg-pepita-400 grid place-items-center shadow-pepita"><PepitaIcon size={52} /></motion.div>
            <div className="mt-4"><Stamp tone={result.strong ? 'green' : 'gold'} className="text-base">{result.strong ? 'Prova forte' : 'Pista enviada'}</Stamp></div>
            <h1 className="font-display text-3xl mt-3">+{result.xp} XP</h1>
            <p className="text-ink-2 mt-2 text-balance">{result.isFirst ? 'Você foi a primeira pessoa a apontar esse lugar. ' : 'Esse lugar já tinha sido apontado; a sua entra como confirmação. '}{result.strong ? 'Quando aceitarem ou confirmarem, as pepitas caem na sua carteira (7 dias de carência).' : 'A prova ficou fraca: peça para alguém confirmar no local para render pepitas.'}</p>
            <Link to={`/g/${id}`}><Button variant="primary" size="lg" className="w-full mt-8">Voltar à pergunta</Button></Link>
            <Link to="/garimpos" className="block mt-3 text-sm font-semibold text-accent">Ver outros garimpos abertos</Link>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
