import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Camera, Check, Flag, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useConfig, useDebounced, useGeo, useInvalidate, useMe, useToast } from '@/lib/hooks';
import { CATEGORIES } from '@/lib/format';
import type { Similar } from '@/lib/types';
import { SimilarCard } from '@/components/QuestionCard';
import { Button, Chip, Sheet, TextArea } from '@/components/ui';
import { NuggetIcon } from '@/components/brand';

/** Nova missão: um formulário só, com reuso de missões parecidas antes de publicar. */
export function Ask() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: me, isPending } = useMe();
  const { data: cfg } = useConfig();
  const toast = useToast();
  const invalidate = useInvalidate();
  const geo = useGeo();
  const [title, setTitle] = useState(params.get('title') ?? '');
  const [category, setCategory] = useState('outros');
  const [details, setDetails] = useState('');
  const [useLocation, setUseLocation] = useState(true);
  const [checked, setChecked] = useState(false);
  const [photoId, setPhotoId] = useState<string | undefined>();
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [dupes, setDupes] = useState<Similar[] | null>(null);
  const [reuse, setReuse] = useState(false);
  const dq = useDebounced(title.trim(), 400);
  const similar = useQuery({ queryKey: ['search', dq], queryFn: () => api.search(dq), enabled: dq.length >= 3 });
  const found = similar.data?.similar ?? [];

  useEffect(() => { if (!isPending && !me) nav(`/entrar?next=${encodeURIComponent(`/missoes/nova?title=${title}`)}`, { replace: true }); }, [me, isPending, nav, title]);
  useEffect(() => { if (useLocation && geo.state === 'idle') geo.ask(); }, [useLocation, geo]);

  async function want(id: string) {
    try {
      const r = await api.follow(id, { on: true });
      toast.push(r.already ? { text: 'Você já acompanhava essa missão.' } : { text: 'Marcado! Avisamos quando encontrarem.', xp: 2 });
      invalidate(['question', 'questions', 'me']);
      nav(`/m/${id}`);
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }
  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try { const r = await api.upload(f, { kind: 'outro' }); setPhotoId(r.id); setPhotoUrl(r.url); }
    catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
    finally { setBusy(false); }
  }
  async function publish(force = false) {
    setBusy(true);
    try {
      const r = await api.createQuestion({ title: title.trim(), details: details.trim() || undefined, category, lat: useLocation ? geo.pos?.lat : undefined, lng: useLocation ? geo.pos?.lng : undefined, photoEvidenceId: photoId, force });
      invalidate(['questions', 'me', 'mapOpen']);
      toast.push({ text: 'Missão publicada. Avisamos quando encontrarem.', xp: cfg?.economy.xp.pergunta ?? 5 });
      nav(`/m/${r.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.data as { similar?: Similar[] })?.similar) setDupes((e.data as { similar: Similar[] }).similar);
      else toast.push({ text: (e as Error).message, tone: 'erro' });
    } finally { setBusy(false); }
  }

  const canPublish = title.trim().length >= 3 && (found.length === 0 || checked);
  const cityLabel = cfg?.city ? `${cfg.city.name}, ${cfg.city.state}` : 'Ariquemes, RO';
  return (
    <div className="flex-1 flex flex-col px-4 pb-32">
      <header className="pt-3 flex items-center gap-2">
        <button type="button" onClick={() => nav(-1)} aria-label="Voltar" className="h-10 w-10 grid place-items-center rounded-full bg-surface border border-line"><ArrowLeft size={20} /></button>
        <span className="font-display font-bold text-ink-2">Missões</span>
      </header>
      <p className="eyebrow mt-4">Nova missão</p>
      <h1 className="font-display font-extrabold text-[1.9rem] leading-[1.08]">Abra uma missão local</h1>
      <p className="text-ink-2 mt-2 leading-snug">Descreva o produto. Uma boa pista pode estar mais perto do que você imagina.</p>

      <label className="block mt-6">
        <span className="block font-display font-bold mb-2">O que você está procurando?</span>
        <input autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setChecked(false); }} maxLength={140} placeholder="Garrafa com tampa hermética"
          className="w-full h-14 rounded-2xl border border-line bg-surface px-4 text-base font-bold outline-none focus:border-esmeralda-600 placeholder:font-semibold placeholder:text-ink-2/60" />
      </label>

      <AnimatePresence>
        {found.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-card bg-lima-100 dark:bg-floresta-600 p-4 flex gap-3">
              <RefreshCw size={22} className="text-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-display font-extrabold">{found.length === 1 ? 'Encontramos uma missão parecida.' : `Encontramos ${found.length} missões parecidas.`}</p>
                <p className="text-sm text-ink-2 truncate">{found[0]!.title} · {found[0]!.answersCount === 1 ? '1 pista publicada' : `${found[0]!.answersCount} pistas publicadas`}</p>
                <button type="button" onClick={() => setReuse(true)} className="mt-2 font-bold text-accent text-sm">Reaproveitar descobertas →</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5">
        <span className="block font-display font-bold mb-2">Categoria</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>{c.emoji} {c.label}</Chip>)}
        </div>
      </div>

      <div className="mt-5">
        <TextArea label="O que ajuda a identificar?" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000}
          placeholder="De vidro, aproximadamente 1 litro. Preciso encontrar em uma loja física, ainda hoje." />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div>
          <span className="block font-display font-bold mb-2">Onde?</span>
          <button type="button" onClick={() => setUseLocation((v) => !v)} aria-pressed={useLocation}
            className={`w-full h-14 rounded-2xl border px-4 flex items-center gap-2 font-bold text-left ${useLocation ? 'bg-surface border-line' : 'bg-surface-2 border-line text-ink-2'}`}>
            <MapPin size={18} className="text-accent shrink-0" /><span className="truncate">{useLocation ? (geo.pos ? 'Perto de mim' : cityLabel) : cityLabel}</span>
          </button>
          <p className="text-xs text-ink-2 mt-1">{useLocation ? (geo.state === 'denied' ? 'Localização negada: fica só a cidade.' : 'Mostra só a região aproximada no mapa.') : 'Toque para marcar perto de você.'}</p>
        </div>
        <div>
          <span className="block font-display font-bold mb-2">Foto de referência</span>
          <label className="w-full h-14 rounded-2xl border border-dashed border-line bg-surface px-4 flex items-center gap-2 cursor-pointer hover:bg-surface-2">
            {photoUrl ? <img src={photoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <Camera size={18} className="text-accent shrink-0" />}
            <span className="text-sm font-bold truncate">{photoUrl ? 'Trocar' : 'Opcional'}</span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-card bg-floresta-700 text-creme p-4 flex gap-3 dark:bg-floresta-600">
        <ShieldCheck size={28} className="text-lima-400 shrink-0" />
        <div>
          <p className="font-display font-extrabold">A melhor pista vem com prova.</p>
          <p className="text-sm text-sage-200 mt-0.5">Quem responder manda foto própria, localização da loja e data da descoberta. Quando você aceitar, essa pessoa ganha <span className="inline-flex items-center gap-1 text-ouro-400 font-bold"><NuggetIcon size={12} />{cfg?.economy.pepitas.resposta_aceita ?? 50} pepitas</span>.</p>
        </div>
      </div>

      <AnimatePresence>
        {found.length > 0 && (
          <motion.label initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 flex items-start gap-3 cursor-pointer">
            <span className={`mt-0.5 h-6 w-6 shrink-0 rounded-md grid place-items-center border-2 ${checked ? 'bg-esmeralda-600 border-esmeralda-600 text-white' : 'border-line bg-surface'}`}>{checked && <Check size={16} strokeWidth={3} />}</span>
            <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span className="text-sm text-ink-2 leading-snug">Conferi as pistas anteriores e ainda preciso de ajuda para encontrar este produto.</span>
          </motion.label>
        )}
      </AnimatePresence>

      <div className="mt-6">
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!canPublish} onClick={() => publish(false)}><Flag size={18} />Publicar missão</Button>
        <p className="text-xs text-ink-2 text-center mt-2">Abrir uma missão vale {cfg?.economy.xp.pergunta ?? 5} XP. Você recebe {cfg?.economy.pepitas.gorjeta_por_pergunta ?? 20} pepitas de agradecimento para distribuir.</p>
      </div>

      <Sheet open={reuse} onClose={() => setReuse(false)} title="Reaproveitar descobertas" tall>
        <p className="text-sm text-ink-2 mb-3">Se uma destas missões é o que você procura, toque em "Também preciso": ela ganha prioridade e você ganha XP.</p>
        <div className="space-y-2">{found.slice(0, 5).map((s) => <SimilarCard key={s.id} s={s} onWant={want} />)}</div>
      </Sheet>

      <Sheet open={!!dupes} onClose={() => setDupes(null)} title="Já existe uma missão parecida">
        <p className="text-sm text-ink-2 mb-3">Encontramos missões muito parecidas. Se uma delas serve, marque "também preciso" em vez de abrir outra.</p>
        <div className="space-y-2">{(dupes ?? []).map((s) => <SimilarCard key={s.id} s={s} onWant={want} />)}</div>
        <Button variant="ghost" className="w-full mt-4" loading={busy} onClick={() => publish(true)}>É diferente, publicar mesmo assim</Button>
        <p className="text-xs text-ink-2 mt-2 text-center">Ainda em dúvida? <Link to="/missoes" className="underline">Veja as missões abertas</Link>.</p>
      </Sheet>
    </div>
  );
}
