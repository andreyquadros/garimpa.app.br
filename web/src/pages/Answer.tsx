import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, BadgeCheck, Camera, Check, Clock, Eye, MapPin, Plus, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useDebounced, useGeo, useInvalidate, useMe, useToast } from '@/lib/hooks';
import type { PlaceLite, UploadResult } from '@/lib/types';
import { dist, KINDS, parseBrlToCents } from '@/lib/format';
import { MapView } from '@/components/MapView';
import { checksFromUpload, EvidenceChecklist } from '@/components/EvidenceChecklist';
import { Button, Chip, Field, Spinner, TextArea } from '@/components/ui';
import { Anim, NuggetIcon, Pepi } from '@/components/brand';
import { CategoryIcon } from '@/components/CategoryIcon';
import { celebrate } from '@/lib/reward';

type Step = 'prova' | 'lugar' | 'detalhes' | 'pronto';

/** Colaborar: "Uma pista sua. Uma descoberta de todos." Evidência primeiro, depois o lugar, depois os detalhes. */
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
  const [step, setStep] = useState<Step>('prova');
  const [place, setPlace] = useState<PlaceLite | null>(null);
  const [newPlace, setNewPlace] = useState<{ name: string; kind: string; address: string; lat: number; lng: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const dq = useDebounced(placeQuery.trim(), 300);
  const places = useQuery({ queryKey: ['places', dq, geo.pos?.lat, geo.pos?.lng], queryFn: () => api.places({ q: dq || undefined, lat: geo.pos?.lat, lng: geo.pos?.lng }), enabled: step === 'lugar' });
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [own, setOwn] = useState(false);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  const [priceError, setPriceError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ xp: number; strong: boolean; isFirst: boolean; evidenceScore: number } | null>(null);

  useEffect(() => { if (!isPending && !me) nav(`/entrar?next=${encodeURIComponent(pathname)}`, { replace: true }); }, [me, isPending, nav, pathname]);
  useEffect(() => { if (geo.state === 'idle') geo.ask(); }, [geo]);

  const city: [number, number] = cfg?.city ? [cfg.city.lat, cfg.city.lng] : [-9.9075, -63.0415];
  const chosenName = place?.name ?? newPlace?.name ?? '';
  const question = q.data?.question;
  const reward = (cfg?.economy.pepitas.resposta_aceita ?? 50) + (question?.bounty ?? 0);

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
  const priceCents = parseBrlToCents(price);
  const priceInvalid = price.trim() !== '' && priceCents === undefined;
  async function submit() {
    if (priceInvalid) { setPriceError('Preço inválido. Use algo como 24,90.'); return; }
    setBusy(true);
    try {
      const r = await api.createAnswer(id, {
        placeId: place?.id, newPlace: newPlace ? { name: newPlace.name, kind: newPlace.kind, address: newPlace.address || undefined, lat: newPlace.lat, lng: newPlace.lng } : undefined,
        note: note.trim() || undefined, priceCents, evidenceIds: uploads.map((u) => u.id),
      });
      invalidate(['question', 'questions', 'me', 'mapFinds']);
      setResult(r);
      setStep('pronto');
      celebrate();
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
    finally { setBusy(false); }
  }

  const order: Step[] = ['prova', 'lugar', 'detalhes'];
  const idx = order.indexOf(step);
  const slide = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

  if (step === 'pronto' && result) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col px-4 pb-32 text-center">
        <p className="eyebrow mt-6">{result.strong ? 'Evidência enviada' : 'Evidência em análise'}</p>
        <div className="relative mx-auto mt-4 w-fit">
          <span className="absolute inset-0 -m-8 rounded-full bg-lima-100 dark:bg-floresta-600" aria-hidden="true" />
          <Pepi pose="comemorando" size={220} celebrate className="relative" />
          <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 400, damping: 18 }}
            className="absolute left-1/2 -translate-x-1/2 -bottom-9 inline-flex items-center gap-1.5 rounded-2xl bg-floresta-700 text-lima-400 font-display font-extrabold text-2xl px-5 h-13 shadow-float dark:bg-floresta-600">+{result.xp} <span className="text-base text-creme">XP</span></motion.span>
        </div>
        <h1 className="display text-[2rem] mt-14">{result.isFirst ? 'Boa! Você abriu caminho.' : 'Boa! Sua pista reforça a descoberta.'}</h1>
        <p className="text-ink-2 mt-3 text-balance">{result.isFirst ? 'Você foi a primeira pessoa a apontar esse lugar. ' : 'Esse lugar já tinha sido apontado; a sua entra como confirmação. '}{result.strong ? `Quando aceitarem ou confirmarem, as pepitas caem na sua carteira (${cfg?.economy.carencia_dias ?? 7} dias de carência).` : 'A evidência ficou fraca: peça para alguém confirmar no local para render pepitas.'}</p>
        <p className={`mt-5 inline-flex items-center justify-center gap-1.5 text-sm font-bold ${result.strong ? 'text-green-ink' : 'text-gold-ink'}`}>{result.strong ? <BadgeCheck size={18} /> : <AlertTriangle size={18} />}{result.strong ? 'Evidência forte' : 'Evidência fraca: peça uma confirmação no local'}</p>
        <Link to={`/m/${id}`} className="block mt-8"><Button variant="primary" size="lg" className="w-full"><Sparkles size={18} />Voltar à missão</Button></Link>
        <Link to="/jornada" className="block mt-3 font-display font-extrabold text-accent">Ver minha jornada</Link>
        <p className="text-xs text-ink-2 mt-5">XP evolui seu nível. Pepitas reconhecem sua ajuda. São contas separadas.</p>
      </motion.div>
    );
  }

  return (
    <div className="flex-1 flex flex-col px-4 pb-32">
      <header className="pt-3 flex items-center gap-2">
        <button type="button" onClick={() => (idx > 0 ? setStep(order[idx - 1]!) : nav(-1))} aria-label="Voltar" className="h-10 w-10 grid place-items-center rounded-full bg-surface border border-line"><ArrowLeft size={20} /></button>
        <span className="font-display font-bold text-ink-2">Missões</span>
      </header>
      <p className="eyebrow mt-4">Colaborar</p>
      <h1 className="font-display font-extrabold text-[1.75rem] leading-[1.08]">Uma pista sua.<br />Uma descoberta de todos.</h1>
      <div className="mt-4 flex gap-2" aria-label={`Passo ${idx + 1} de 3`}>
        {order.map((s, i) => <span key={s} className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><motion.span className="block h-full bg-esmeralda-600" initial={false} animate={{ width: i <= idx ? '100%' : '0%' }} transition={{ duration: 0.4 }} /></span>)}
      </div>

      {question && (
        <div className="mt-4 rounded-card bg-surface-2 p-3.5 flex items-center gap-3">
          <span className="h-12 w-12 shrink-0 grid place-items-center rounded-xl bg-surface text-accent"><CategoryIcon id={question.category} size={20} /></span>
          <div className="min-w-0">
            <p className="eyebrow !text-[0.62rem]">Missão da comunidade</p>
            <p className="font-display font-extrabold leading-tight truncate">{question.title}</p>
            <p className="text-sm text-ink-2 truncate">Pedido de {question.authorName.split(' ')[0]} · {cfg?.city?.name ?? 'Ariquemes'}</p>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 'prova' && (
          <motion.section key="prova" {...slide} className="mt-4 flex-1">
            <label className={`flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-6 cursor-pointer text-center ${uploads.length ? 'border-line bg-surface' : 'border-esmeralda-100 bg-lima-100/60 dark:bg-floresta-600'}`}>
              {uploading ? <Anim name="search-radar" size={64} /> : <span className="h-14 w-14 rounded-2xl bg-surface text-accent grid place-items-center shadow-card"><Camera size={28} /></span>}
              <span className="font-display font-extrabold text-lg mt-1">{uploads.length ? 'Adicionar outra foto' : 'Uma foto sua vale uma boa pista.'}</span>
              <span className="text-sm text-ink-2">Mostre o produto na loja ou um comprovante.</span>
              <span className="text-sm font-bold text-accent mt-1">Anexar evidência · até 4 fotos</span>
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={uploading || uploads.length >= 4} onChange={(e) => onFiles(e.target.files)} />
            </label>
            <div className="mt-4 space-y-3">
              {uploads.map((u, i) => (
                <motion.div key={u.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                  <img src={u.url} alt={`Evidência ${i + 1}`} className="h-28 w-24 rounded-2xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0"><EvidenceChecklist checks={checksFromUpload(u)} /></div>
                </motion.div>
              ))}
            </div>
            <div className="mt-5">
              <p className="font-display font-extrabold">Uma descoberta que dá para confiar.</p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
                <li className="flex gap-2"><ShieldCheck size={18} className="text-accent shrink-0" />Duplicatas e imagens reutilizadas passam por análise.</li>
                <li className="flex gap-2"><Eye size={18} className="text-accent shrink-0" />Oculte CPF, nomes, QR codes e dados de pagamento.</li>
                <li className="flex gap-2"><Clock size={18} className="text-accent shrink-0" />Tire a foto agora: a pista é de hoje.</li>
              </ul>
            </div>
            <label className="mt-4 flex items-start gap-3 cursor-pointer">
              <span className={`mt-0.5 h-6 w-6 shrink-0 rounded-md grid place-items-center border-2 ${own ? 'bg-esmeralda-600 border-esmeralda-600 text-white' : 'border-line bg-surface'}`}>{own && <Check size={16} strokeWidth={3} />}</span>
              <input type="checkbox" className="sr-only" checked={own} onChange={(e) => setOwn(e.target.checked)} />
              <span className="text-sm text-ink-2 leading-snug">Esta evidência é minha e removi dados pessoais. Os pontos só são liberados após validação.</span>
            </label>
            <Button size="lg" className="w-full mt-5" disabled={uploads.length === 0 || uploading || !own} onClick={() => setStep('lugar')} arrow>Continuar</Button>
          </motion.section>
        )}

        {step === 'lugar' && (
          <motion.section key="lugar" {...slide} className="mt-5 flex-1">
            <h2 className="font-display font-extrabold text-xl">Qual loja tem o produto?</h2>
            {!picking ? (
              <>
                <div className="mt-3 flex items-center gap-2 h-14 rounded-2xl bg-surface border border-line px-4">
                  <Search size={18} className="text-accent" /><input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="Nome da loja ou mercado" autoFocus className="flex-1 bg-transparent outline-none font-semibold" />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {places.isPending && <li className="py-4 grid place-items-center"><Spinner /></li>}
                  {(places.data?.items ?? []).map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => { setPlace(p); setNewPlace(null); setStep('detalhes'); }} className="w-full text-left rounded-card bg-surface border border-line px-4 py-3 flex items-center gap-3 hover:bg-surface-2">
                        <span className="h-10 w-10 rounded-full bg-esmeralda-100 text-esmeralda-800 grid place-items-center"><MapPin size={18} /></span>
                        <span className="flex-1 min-w-0"><span className="block font-bold truncate">{p.name}</span><span className="block text-xs text-ink-2 truncate">{KINDS[p.kind] ?? p.kind}{p.address ? ` · ${p.address}` : ''}{p.distanceM != null ? ` · ${dist(p.distanceM)}` : ''}{p.finds ? ` · ${p.finds} descobertas` : ''}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => { setPicking(true); setNewPlace({ name: placeQuery, kind: 'loja', address: '', lat: geo.pos?.lat ?? city[0], lng: geo.pos?.lng ?? city[1] }); }}
                  className="mt-3 w-full rounded-card border-2 border-dashed border-line px-4 py-3 flex items-center gap-3 text-accent font-bold hover:bg-surface-2">
                  <span className="h-10 w-10 rounded-full bg-lima-100 dark:bg-floresta-600 grid place-items-center"><Plus /></span>Não achei: marcar lugar novo no mapa
                </button>
              </>
            ) : newPlace && cfg && (
              <div className="mt-3">
                <div className="relative h-64 rounded-card overflow-hidden border border-line">
                  <MapView center={[newPlace.lat, newPlace.lng]} zoom={16} tiles={cfg.tiles} me={geo.pos} onMove={(c) => setNewPlace((p) => (p ? { ...p, lat: c[0], lng: c[1] } : p))} />
                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full z-[500]"><div className="pin pin-pending" /></div>
                  <p className="absolute left-2 right-2 bottom-2 z-[500] text-center text-xs font-bold bg-surface/90 rounded-full py-1.5">Arraste o mapa até a entrada da loja</p>
                </div>
                <div className="mt-3 space-y-3">
                  <Field label="Nome do lugar" value={newPlace.name} onChange={(e) => setNewPlace({ ...newPlace, name: e.target.value })} placeholder="Casa & Cozinha" />
                  <Field label="Endereço ou referência (opcional)" value={newPlace.address} onChange={(e) => setNewPlace({ ...newPlace, address: e.target.value })} placeholder="Av. Jamari, Setor 01" />
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">{Object.entries(KINDS).map(([k, l]) => <Chip key={k} active={newPlace.kind === k} onClick={() => setNewPlace({ ...newPlace, kind: k })}>{l}</Chip>)}</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="ghost" onClick={() => setPicking(false)}>Voltar</Button>
                  <Button className="flex-1" disabled={newPlace.name.trim().length < 2} onClick={() => { setPlace(null); setStep('detalhes'); }}>Usar este lugar</Button>
                </div>
              </div>
            )}
          </motion.section>
        )}

        {step === 'detalhes' && (
          <motion.section key="detalhes" {...slide} className="mt-5 flex-1 space-y-4">
            <div>
              <h2 className="font-display font-extrabold text-xl">Ajude quem vai lá</h2>
              <p className="text-sm text-ink-2 mt-0.5">Em <b className="text-ink">{chosenName}</b>. Detalhes poupam tempo de quem procura.</p>
            </div>
            <TextArea label="Onde fica dentro da loja? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} placeholder="Corredor dos potes, prateleira de baixo. Perguntei no caixa." />
            <Field label="Preço que você viu (opcional)" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setPriceError(undefined); }} placeholder="24,90" error={priceError} />
            <div className="rounded-card bg-lima-100 dark:bg-floresta-600 p-3.5 text-sm">
              <p className="font-bold inline-flex items-center gap-1.5"><Sparkles size={16} className="text-accent" />Até +{(cfg?.economy.xp.resposta_com_evidencia ?? 15) + (cfg?.economy.xp.resposta_aceita ?? 50)} XP por descoberta validada</p>
              <ul className="mt-1 text-ink-2 space-y-0.5">
                <li>XP agora pela evidência; mais XP quando aceitarem.</li>
                <li className="inline-flex items-center gap-1"><NuggetIcon size={12} />{reward} pepitas se quem pediu aceitar; {cfg?.economy.pepitas.resposta_confirmada ?? 20} se duas pessoas confirmarem no local.</li>
                <li>Primeira descoberta no lugar leva tudo; as seguintes, 25% como confirmação.</li>
              </ul>
            </div>
            <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={priceInvalid} onClick={submit}><ShieldCheck size={18} />Enviar para validação</Button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
