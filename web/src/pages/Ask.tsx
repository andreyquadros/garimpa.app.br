import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Camera, MapPin } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useDebounced, useGeo, useInvalidate, useMe, useToast } from '@/lib/hooks';
import { CATEGORIES } from '@/lib/format';
import type { Similar } from '@/lib/types';
import { SimilarCard } from '@/components/QuestionCard';
import { Button, Chip, Field, Sheet, TextArea } from '@/components/ui';

export function Ask() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: me, isPending } = useMe();
  const toast = useToast();
  const invalidate = useInvalidate();
  const geo = useGeo();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(params.get('title') ?? '');
  const [category, setCategory] = useState('outros');
  const [details, setDetails] = useState('');
  const [useLocation, setUseLocation] = useState(true);
  const [photoId, setPhotoId] = useState<string | undefined>();
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [dupes, setDupes] = useState<Similar[] | null>(null);
  const dq = useDebounced(title.trim(), 400);
  const similar = useQuery({ queryKey: ['search', dq], queryFn: () => api.search(dq), enabled: dq.length >= 3 });

  useEffect(() => { if (!isPending && !me) nav(`/entrar?next=${encodeURIComponent(`/perguntar?title=${title}`)}`, { replace: true }); }, [me, isPending, nav, title]);
  useEffect(() => { if (useLocation && geo.state === 'idle') geo.ask(); }, [useLocation, geo]);

  async function want(id: string) {
    try { await api.follow(id); toast.push({ text: 'Marcado! Você vai ver quando acharem.', xp: 2 }); nav(`/g/${id}`); }
    catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
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
      toast.push({ text: 'Pergunta no ar. Avisamos quando acharem.', xp: 5 });
      nav(`/g/${r.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.data as { similar?: Similar[] })?.similar) setDupes((e.data as { similar: Similar[] }).similar);
      else toast.push({ text: (e as Error).message, tone: 'erro' });
    } finally { setBusy(false); }
  }

  const steps = ['O quê?', 'Detalhes', 'Publicar'];
  const canNext = title.trim().length >= 3;
  return (
    <div className="min-h-dvh flex flex-col pb-6">
      <header className="safe-top px-4 pt-3 flex items-center gap-2">
        <button type="button" onClick={() => (step > 0 ? setStep(step - 1) : nav(-1))} aria-label="Voltar" className="h-10 w-10 grid place-items-center rounded-full hover:bg-surface-2"><ArrowLeft /></button>
        <div className="flex-1">
          <div className="flex gap-1.5">
            {steps.map((s, i) => <span key={s} className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><motion.span className="block h-full bg-pepita-400" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.4 }} /></span>)}
          </div>
          <p className="text-xs font-semibold text-ink-2 mt-1">Passo {step + 1} de 3 · {steps[step]}</p>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.section key="s0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="px-4 mt-6 flex-1">
            <h1 className="font-display text-3xl leading-tight">Onde encontro…</h1>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="garrafa com tampa hermética"
              className="mt-3 w-full bg-transparent border-b-2 border-line focus:border-pepita-400 outline-none focus-visible:outline-none font-display text-2xl py-2 placeholder:text-ink-2/50 rounded-none" />
            <p className="text-sm text-ink-2 mt-2">Diga o produto como você pediria no balcão. Marca e tamanho ajudam.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>{c.emoji} {c.label}</Chip>)}
            </div>
            <AnimatePresence>
              {similar.data && similar.data.similar.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
                  <h2 className="font-display text-lg">Já garimparam isso</h2>
                  <p className="text-sm text-ink-2 mb-2">Se for a mesma coisa, marque "também quero": a pergunta ganha prioridade e você ganha XP.</p>
                  <div className="space-y-2">{similar.data.similar.slice(0, 3).map((s) => <SimilarCard key={s.id} s={s} onWant={want} />)}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}
        {step === 1 && (
          <motion.section key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="px-4 mt-6 flex-1 space-y-5">
            <h1 className="font-display text-2xl leading-tight">{title}</h1>
            <TextArea label="Detalhes (opcional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000}
              placeholder="Para que serve, tamanho, cor, quanto quer pagar…" hint="Quanto mais claro, mais rápido alguém acha." />
            <div>
              <span className="block text-sm font-semibold text-ink-2 mb-1">Foto de referência (opcional)</span>
              <label className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-3 cursor-pointer hover:bg-surface-2">
                {photoUrl ? <img src={photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <span className="h-16 w-16 rounded-xl bg-surface-2 grid place-items-center text-accent"><Camera /></span>}
                <span className="text-sm">{photoUrl ? 'Trocar foto' : 'Um print ou foto do que você procura'}</span>
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
              </label>
            </div>
            <label className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
              <input type="checkbox" checked={useLocation} onChange={(e) => setUseLocation(e.target.checked)} className="mt-1 h-5 w-5 accent-rio-700" />
              <span className="text-sm"><span className="font-semibold flex items-center gap-1"><MapPin size={14} />Mostrar no mapa perto de mim</span><span className="text-ink-2">Só a região aproximada, para quem está por perto ajudar. {geo.state === 'denied' ? 'Localização negada no navegador.' : ''}</span></span>
            </label>
          </motion.section>
        )}
        {step === 2 && (
          <motion.section key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="px-4 mt-6 flex-1">
            <h1 className="font-display text-2xl leading-tight">Tudo certo?</h1>
            <div className="mt-4 rounded-2xl bg-surface border border-line p-4">
              <p className="text-xs font-bold text-ink-2">Onde encontro</p>
              <p className="font-display text-xl">{title}</p>
              {details && <p className="text-sm mt-2">{details}</p>}
              <p className="text-sm text-ink-2 mt-2">{CATEGORIES.find((c) => c.id === category)?.emoji} {CATEGORIES.find((c) => c.id === category)?.label}{useLocation && geo.pos ? ' · com região no mapa' : ''}</p>
            </div>
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex gap-2"><span>⛏️</span><span>Quem achar com prova ganha <b>50 pepitas</b> quando você aceitar a resposta.</span></li>
              <li className="flex gap-2"><span>🎁</span><span>Você ganha <b>20 pepitas de gorjeta</b> para distribuir entre quem ajudou.</span></li>
              <li className="flex gap-2"><span>✨</span><span>Perguntar vale <b>5 XP</b>; aceitar uma resposta, mais 10.</span></li>
            </ul>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="px-4 mt-6">
        {step < 2
          ? <Button variant="primary" size="lg" className="w-full" disabled={!canNext} onClick={() => setStep(step + 1)}>Continuar</Button>
          : <Button variant="gold" size="lg" className="w-full" loading={busy} onClick={() => publish(false)}>Publicar pergunta</Button>}
      </div>

      <Sheet open={!!dupes} onClose={() => setDupes(null)} title="Já garimparam isso">
        <p className="text-sm text-ink-2 mb-3">Encontramos perguntas muito parecidas. Se uma delas serve, marque "também quero" em vez de abrir outra.</p>
        <div className="space-y-2">{(dupes ?? []).map((s) => <SimilarCard key={s.id} s={s} onWant={want} />)}</div>
        <Button variant="ghost" className="w-full mt-4" loading={busy} onClick={() => publish(true)}>É diferente, perguntar mesmo assim</Button>
        <p className="text-xs text-ink-2 mt-2 text-center">Ainda perdido? <Link to="/garimpos" className="underline">Veja os garimpos abertos</Link>.</p>
      </Sheet>
    </div>
  );
}
