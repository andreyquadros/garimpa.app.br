import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowLeft, Heart, Share2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useGeo, useInvalidate, useMe, useShare, useToast } from '@/lib/hooks';
import type { Answer, Find } from '@/lib/types';
import { categoryOf, timeAgo } from '@/lib/format';
import { MapView } from '@/components/MapView';
import { AnswerTicket } from '@/components/AnswerTicket';
import { Avatar, Button, EmptyState, PepitaPill, Sheet, Spinner, StatusChip } from '@/components/ui';
import { NuggetIcon, Pepi } from '@/components/brand';
import { CategoryIcon } from '@/components/CategoryIcon';
import { celebrate } from '@/lib/reward';

const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'warn' | 'muted' }> = {
  aberta: { label: 'Procurando', tone: 'warn' }, respondida: { label: 'Tem pista', tone: 'wait' }, resolvida: { label: 'Encontrado', tone: 'ok' }, fechada: { label: 'Fechada', tone: 'muted' },
};

/** Missão: o pedido, o mapa das pistas e os tickets de evidência. */
export function QuestionPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { data: cfg } = useConfig();
  const { data: me } = useMe();
  const toast = useToast();
  const invalidate = useInvalidate();
  const share = useShare();
  const geo = useGeo();
  const q = useQuery({ queryKey: ['question', id], queryFn: () => api.question(id) });
  const [tipFor, setTipFor] = useState<Answer | null>(null);
  const [flagFor, setFlagFor] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.isPending) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (q.isError || !q.data) return <EmptyState art="no-results" title="Missão não encontrada" action={<Link to="/missoes"><Button>Ver missões</Button></Link>} />;
  const { question, answers, canAccept } = q.data;
  const cat = categoryOf(question.category);
  const st = STATUS[question.status] ?? STATUS['aberta']!;
  const mine = me?.user.id === question.authorId;
  const pins: Find[] = answers.filter((a) => a.status !== 'rejeitada').map((a) => ({ placeId: a.placeId, name: a.placeName, kind: a.placeKind, lat: a.placeLat, lng: a.placeLng, address: a.placeAddress, partnerTier: a.partnerTier, finds: a.confirms + (a.status === 'aceita' ? 1 : 0) || 1, titles: [question.title], lastFindAt: a.createdAt }));
  const needLogin = () => { toast.push({ text: 'Entre para participar.', tone: 'info' }); nav(`/entrar?next=${encodeURIComponent(pathname)}`); };
  const reward = (cfg?.economy.pepitas.resposta_aceita ?? 50) + question.bounty;

  async function follow() {
    if (!me) return needLogin();
    try { const r = await api.follow(id); toast.push(r.following ? { text: 'Você também precisa. A missão ganhou prioridade.', xp: 2 } : { text: 'Deixou de acompanhar.' }); invalidate(['question', 'questions', 'me']); }
    catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }
  async function confirm(a: Answer, vote: 1 | -1) {
    if (!me) return needLogin();
    if (geo.state === 'idle') geo.ask();
    try {
      const r = await api.confirm(a.id, { vote, lat: geo.pos?.lat, lng: geo.pos?.lng });
      invalidate(['question', 'me']);
      if (r.status === 'confirmada' && a.status !== 'confirmada') { celebrate(); toast.push({ text: 'Descoberta confirmada pela comunidade. Quem encontrou ganhou pepitas.', xp: r.xp }); }
      else toast.push(vote === 1 ? { text: 'Valeu por confirmar.', xp: r.xp } : { text: 'Anotado. Se mais gente discordar, a evidência sai do ar.', xp: r.xp });
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }
  async function accept(a: Answer) {
    setBusy(true);
    try {
      const r = await api.accept(id, a.id);
      celebrate();
      toast.push({ text: `${a.authorName.split(' ')[0]} ganhou ${r.credits} pepitas. Você ganhou XP por fechar a missão.`, xp: r.xp || 10 });
      invalidate(['question', 'questions', 'me', 'mapFinds']);
      if (question.tipBudgetLeft > 0) setTimeout(() => setTipFor(a), 600);
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
    finally { setBusy(false); }
  }
  async function tip(amount: number, source: 'orcamento' | 'saldo') {
    if (!tipFor) return;
    setBusy(true);
    try {
      const r = await api.tip(tipFor.id, amount, source);
      toast.push({ text: r.minted ? `Agradecimento de ${amount} pepitas enviado.` : 'Agradecimento registrado (sem cunhar pepitas: mesmo aparelho).', pepitas: r.minted ? amount : undefined });
      invalidate(['question', 'me']);
      setTipFor(null);
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
    finally { setBusy(false); }
  }
  async function flag(reason: string) {
    if (!flagFor) return;
    try { await api.flag({ targetType: 'resposta', targetId: flagFor.id, reason }); toast.push({ text: 'Denúncia enviada. Três denúncias confiáveis escondem a evidência.' }); setFlagFor(null); }
    catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }

  const budget = question.tipBudgetLeft;
  const openForHelp = !mine && question.status !== 'resolvida' && question.status !== 'fechada';
  return (
    <div className="pb-40 px-4">
      <header className="pt-3 flex items-center gap-2">
        <button type="button" onClick={() => nav(-1)} aria-label="Voltar" className="h-10 w-10 grid place-items-center rounded-full bg-surface border border-line"><ArrowLeft size={20} /></button>
        <span className="font-display font-bold text-ink-2 flex-1">Missões</span>
        <button type="button" onClick={async () => { const r = await share(`Onde encontro ${question.title} em Ariquemes?`); if (r === 'copied') toast.push({ text: 'Link copiado.' }); }} aria-label="Compartilhar" className="h-10 w-10 grid place-items-center rounded-full bg-surface border border-line text-ink-2"><Share2 size={18} /></button>
      </header>

      <section className="mt-5">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 grid place-items-center rounded-lg bg-surface-2 text-accent"><CategoryIcon id={question.category} size={16} /></span>
          <p className="eyebrow flex-1">{cat.label}</p>
          <StatusChip tone={st.tone}>{st.label}</StatusChip>
        </div>
        <h1 className="display text-[1.75rem] mt-2">{question.title}</h1>
        <p className="text-sm text-ink-2 mt-3 flex items-center gap-1.5"><Avatar name={question.authorName} url={question.authorAvatar} size={22} />{mine ? 'Pedido seu' : `Pedido de ${question.authorName.split(' ')[0]}`} · {timeAgo(question.createdAt)}</p>
      </section>
      {question.details && <p className="mt-3 text-[15px] leading-snug">{question.details}</p>}
      {question.photoPath && <img src={/^(data|blob|https?):/.test(question.photoPath) ? question.photoPath : `/u/${question.photoPath}`} alt="Referência enviada por quem abriu a missão" className="mt-3 rounded-card max-h-56 object-cover" />}

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-3">
          <PepitaPill value={reward} />
          <span className="text-sm text-ink-2 leading-tight">para quem encontrar{question.bounty > 0 ? ` · ${question.bounty} de bônus` : ''}</span>
        </div>
        {!mine && question.status !== 'resolvida' && (
          <Button variant={question.iFollow ? 'lime' : 'ghost'} onClick={follow} className="shrink-0" aria-label={question.iFollow ? 'Deixar de acompanhar' : 'Também preciso'}><Users size={18} />{question.followersCount}</Button>
        )}
      </div>

      {cfg && pins.length > 0 && (
        <div className="mt-4 h-40 rounded-card overflow-hidden border border-line">
          <MapView center={[pins[0]!.lat, pins[0]!.lng]} zoom={14} tiles={cfg.tiles} finds={pins} me={geo.pos} highlight={question.acceptedAnswerId ? answers.find((a) => a.id === question.acceptedAnswerId)?.placeId : null} onFind={(f) => nav(`/lugar/${f.placeId}`)} />
        </div>
      )}

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-extrabold text-xl">{answers.length === 0 ? 'Nenhuma pista ainda' : answers.length === 1 ? '1 pista' : `${answers.length} pistas`}</h2>
          {mine && question.status === 'respondida' && <span className="text-xs text-ink-2">toque em "Foi aqui que encontrei" para fechar</span>}
        </div>
        <div className="mt-3 space-y-4">
          {answers.map((a) => (
            <AnswerTicket key={a.id} a={a} meId={me?.user.id ?? null} canAccept={canAccept && !busy} canTip={mine && budget > 0}
              onAccept={accept} onConfirm={confirm} onTip={setTipFor} onFlag={(x) => (me ? setFlagFor(x) : needLogin())} />
          ))}
          {answers.length === 0 && (
            <div className="rounded-card bg-surface border border-line p-4 flex items-center gap-3">
              <Pepi pose="explorador" size={96} />
              <div>
                <p className="font-display font-extrabold">{mine ? 'Espalhe o link' : 'Você sabe onde tem?'}</p>
                <p className="text-sm text-ink-2 mt-0.5">{mine ? 'Compartilhe no grupo do bairro: quem souber responde com evidência e ganha pepitas.' : `Envie uma foto do produto na loja e ganhe ${reward} pepitas quando aceitarem.`}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {openForHelp && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto max-w-lg px-4 pointer-events-none">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pointer-events-auto">
            <Button variant="primary" size="lg" className="w-full" onClick={() => (me ? nav(`/m/${id}/evidencia`) : needLogin())}><NuggetIcon size={20} />Eu sei onde tem!</Button>
          </motion.div>
        </div>
      )}

      <Sheet open={!!tipFor} onClose={() => setTipFor(null)} title="Agradecer com pepitas">
        {tipFor && (
          <div>
            <p className="text-sm text-ink-2">Para <b className="text-ink">{tipFor.authorName}</b>. Você tem <b className="text-ink">{budget}</b> pepitas de agradecimento nesta missão, sem custo para você.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[5, 10, 20].filter((v) => v <= budget).map((v) => (
                <motion.button key={v} whileTap={{ scale: 0.92 }} disabled={busy} onClick={() => tip(v, 'orcamento')} className="h-16 rounded-card bg-ouro-100 border border-ouro-200 text-gold-ink font-display font-extrabold text-xl flex items-center justify-center gap-1.5"><Heart size={18} />{v}</motion.button>
              ))}
              {budget > 0 && budget < 5 && <motion.button whileTap={{ scale: 0.92 }} disabled={busy} onClick={() => tip(budget, 'orcamento')} className="h-16 rounded-card bg-ouro-100 border border-ouro-200 text-gold-ink font-display font-extrabold text-xl flex items-center justify-center gap-1.5"><Heart size={18} />{budget}</motion.button>}
            </div>
            {me && me.user.credits >= 10 && <Button variant="ghost" className="w-full mt-3" disabled={busy} onClick={() => tip(10, 'saldo')}>Agradecer com 10 do meu saldo ({me.user.credits})</Button>}
            <p className="text-xs text-ink-2 mt-3">Agradecimentos entram em carência de {cfg?.economy.carencia_dias ?? 7} dias e não valem entre contas do mesmo aparelho.</p>
          </div>
        )}
      </Sheet>

      <Sheet open={!!flagFor} onClose={() => setFlagFor(null)} title="Denunciar evidência">
        <div className="grid gap-2">
          {[['plagio', 'Copiou a evidência ou a foto de outra pessoa'], ['foto_falsa', 'A foto não é desse lugar'], ['lugar_errado', 'O produto não está nessa loja'], ['spam', 'Propaganda ou spam'], ['ofensivo', 'Conteúdo ofensivo']].map(([r, l]) => (
            <button key={r} type="button" onClick={() => flag(r!)} className="text-left rounded-card border border-line px-4 py-3 hover:bg-surface-2 text-sm font-bold">{l}</button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
