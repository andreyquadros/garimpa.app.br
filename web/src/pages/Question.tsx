import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowLeft, Share2, Users, Hand } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useGeo, useInvalidate, useMe, useShare, useToast } from '@/lib/hooks';
import type { Answer, Find } from '@/lib/types';
import { categoryOf, STATUS_LABEL, timeAgo } from '@/lib/format';
import { MapView } from '@/components/MapView';
import { AnswerTicket } from '@/components/AnswerTicket';
import { Avatar, Button, EmptyState, PepitaIcon, PepitaPill, Sheet, Spinner } from '@/components/ui';
import { celebrate } from '@/lib/reward';

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

  if (q.isPending) return <div className="grid place-items-center h-dvh"><Spinner /></div>;
  if (q.isError || !q.data) return <EmptyState title="Pergunta não encontrada" action={<Link to="/garimpos"><Button>Ver garimpos</Button></Link>} />;
  const { question, answers, canAccept } = q.data;
  const cat = categoryOf(question.category);
  const mine = me?.user.id === question.authorId;
  const pins: Find[] = answers.filter((a) => a.status !== 'rejeitada').map((a) => ({ placeId: a.placeId, name: a.placeName, kind: a.placeKind, lat: a.placeLat, lng: a.placeLng, address: a.placeAddress, partnerTier: a.partnerTier, finds: a.confirms + (a.status === 'aceita' ? 1 : 0) || 1, titles: [question.title], lastFindAt: a.createdAt }));
  const needLogin = () => { toast.push({ text: 'Entre para participar.', tone: 'info' }); nav(`/entrar?next=${encodeURIComponent(pathname)}`); };

  async function follow() {
    if (!me) return needLogin();
    try { const r = await api.follow(id); toast.push(r.following ? { text: 'Você também quer. A pergunta ganhou prioridade.', xp: 2 } : { text: 'Deixou de acompanhar.' }); invalidate(['question', 'questions', 'me']); }
    catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }
  async function confirm(a: Answer, vote: 1 | -1) {
    if (!me) return needLogin();
    if (geo.state === 'idle') geo.ask();
    try {
      const r = await api.confirm(a.id, { vote, lat: geo.pos?.lat, lng: geo.pos?.lng });
      invalidate(['question', 'me']);
      if (r.status === 'confirmada' && a.status !== 'confirmada') { celebrate(); toast.push({ text: 'Achado confirmado pela comunidade. Quem achou ganhou pepitas.', xp: r.xp }); }
      else toast.push(vote === 1 ? { text: 'Valeu por confirmar.', xp: r.xp } : { text: 'Anotado. Se mais gente discordar, a resposta some.', xp: r.xp });
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }
  async function accept(a: Answer) {
    setBusy(true);
    try {
      const r = await api.accept(id, a.id);
      celebrate();
      toast.push({ text: `${a.authorName.split(' ')[0]} ganhou ${r.credits} pepitas. Você ganhou XP por fechar o garimpo.`, xp: 10 });
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
      toast.push({ text: r.minted ? `Gorjeta de ${amount} pepitas enviada.` : 'Gorjeta registrada (sem cunhar pepitas: mesmo aparelho).', pepitas: r.minted ? amount : undefined });
      invalidate(['question', 'me']);
      setTipFor(null);
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
    finally { setBusy(false); }
  }
  async function flag(reason: string) {
    if (!flagFor) return;
    try { await api.flag({ targetType: 'resposta', targetId: flagFor.id, reason }); toast.push({ text: 'Denúncia enviada. Três denúncias confiáveis escondem a resposta.' }); setFlagFor(null); }
    catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }

  const budget = question.tipBudgetLeft;
  return (
    <div className="pb-36">
      <header className="safe-top px-3 pt-2 flex items-center gap-1">
        <button type="button" onClick={() => nav(-1)} aria-label="Voltar" className="h-10 w-10 grid place-items-center rounded-full hover:bg-surface-2"><ArrowLeft /></button>
        <span className="flex-1" />
        <button type="button" onClick={async () => { const r = await share(`Onde encontro ${question.title} em Ariquemes?`); if (r === 'copied') toast.push({ text: 'Link copiado.' }); }} aria-label="Compartilhar" className="h-10 w-10 grid place-items-center rounded-full hover:bg-surface-2"><Share2 size={20} /></button>
      </header>

      <section className="px-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl" aria-hidden="true">{cat.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-ink-2">Onde encontro</p>
            <h1 className="font-display text-2xl leading-tight">{question.title}</h1>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 h-7 grid place-items-center text-xs font-bold ${question.status === 'resolvida' ? 'bg-mata-100 text-mata-700' : question.status === 'aberta' ? 'bg-barro-100 text-barro-700' : 'bg-pepita-200 text-pepita-700'}`}>{STATUS_LABEL[question.status]}</span>
        </div>
        {question.details && <p className="mt-3 text-[15px] leading-snug">{question.details}</p>}
        {question.photoPath && <img src={/^(data|blob|https?):/.test(question.photoPath) ? question.photoPath : `/u/${question.photoPath}`} alt="Referência enviada por quem perguntou" className="mt-3 rounded-2xl max-h-56 object-cover" />}
        <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <Avatar name={question.authorName} url={question.authorAvatar} size={26} />
          <span className="font-semibold text-ink">{question.authorName}</span>
          <span>· {timeAgo(question.createdAt)}</span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 rounded-2xl bg-surface border border-line px-3 py-2 flex items-center gap-3">
            <PepitaPill value={50 + question.bounty} />
            <span className="text-xs text-ink-2 leading-tight">para quem achar{question.bounty > 0 ? `, com ${question.bounty} de bônus de quem também quer` : ''}</span>
          </div>
          {!mine && question.status !== 'resolvida' && (
            <Button variant={question.iFollow ? 'soft' : 'ghost'} onClick={follow} className="shrink-0"><Users size={18} />{question.followersCount}</Button>
          )}
        </div>
      </section>

      {cfg && pins.length > 0 && (
        <div className="mt-4 h-48 mx-4 rounded-2xl overflow-hidden border border-line">
          <MapView center={[pins[0]!.lat, pins[0]!.lng]} zoom={14} tiles={cfg.tiles} finds={pins} me={geo.pos} highlight={question.acceptedAnswerId ? answers.find((a) => a.id === question.acceptedAnswerId)?.placeId : null} onFind={(f) => nav(`/lugar/${f.placeId}`)} />
        </div>
      )}

      <section className="px-4 mt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl">{answers.length === 0 ? 'Nenhuma pista ainda' : answers.length === 1 ? '1 pista' : `${answers.length} pistas`}</h2>
          {mine && question.status === 'respondida' && <span className="text-xs text-ink-2">toque em "Foi aqui que achei" para fechar</span>}
        </div>
        <div className="mt-3 space-y-4">
          {answers.map((a) => (
            <AnswerTicket key={a.id} a={a} meId={me?.user.id ?? null} canAccept={canAccept && !busy} canTip={mine && budget > 0}
              onAccept={accept} onConfirm={confirm} onTip={setTipFor} onFlag={(x) => (me ? setFlagFor(x) : needLogin())} />
          ))}
          {answers.length === 0 && (
            <EmptyState icon={<Hand />} title={mine ? 'Espalhe o link' : 'Você sabe onde tem?'} text={mine ? 'Compartilhe no grupo do bairro: quem souber responde com foto e ganha pepitas.' : 'Responda com uma foto do produto na loja e ganhe 50 pepitas quando aceitarem.'} />
          )}
        </div>
      </section>

      {!mine && question.status !== 'resolvida' && question.status !== 'fechada' && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto max-w-lg px-4 pointer-events-none">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pointer-events-auto">
            <Button variant="gold" size="lg" className="w-full" onClick={() => (me ? nav(`/g/${id}/responder`) : needLogin())}><PepitaIcon size={22} />Eu sei onde tem!</Button>
          </motion.div>
        </div>
      )}

      <Sheet open={!!tipFor} onClose={() => setTipFor(null)} title="Dar gorjeta">
        {tipFor && (
          <div>
            <p className="text-sm text-ink-2">Para <b className="text-ink">{tipFor.authorName}</b>. Você tem <b className="text-ink">{budget}</b> pepitas de gorjeta nesta pergunta, sem custo para você.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[5, 10, 20].filter((v) => v <= budget).map((v) => (
                <motion.button key={v} whileTap={{ scale: 0.92 }} disabled={busy} onClick={() => tip(v, 'orcamento')} className="h-16 rounded-2xl bg-pepita-200 text-pepita-700 font-display font-bold text-xl flex items-center justify-center gap-1"><PepitaIcon size={22} />{v}</motion.button>
              ))}
              {budget > 0 && budget < 5 && <motion.button whileTap={{ scale: 0.92 }} disabled={busy} onClick={() => tip(budget, 'orcamento')} className="h-16 rounded-2xl bg-pepita-200 text-pepita-700 font-display font-bold text-xl flex items-center justify-center gap-1"><PepitaIcon size={22} />{budget}</motion.button>}
            </div>
            {me && me.user.credits >= 10 && <Button variant="ghost" className="w-full mt-3" disabled={busy} onClick={() => tip(10, 'saldo')}>Dar 10 do meu saldo ({me.user.credits})</Button>}
            <p className="text-xs text-ink-2 mt-3">Gorjetas entram em carência de 7 dias e não valem entre contas do mesmo aparelho.</p>
          </div>
        )}
      </Sheet>

      <Sheet open={!!flagFor} onClose={() => setFlagFor(null)} title="Denunciar resposta">
        <div className="grid gap-2">
          {[['plagio', 'Copiou a resposta ou a foto de outra pessoa'], ['foto_falsa', 'A foto não é desse lugar'], ['lugar_errado', 'O produto não está nessa loja'], ['spam', 'Propaganda ou spam'], ['ofensivo', 'Conteúdo ofensivo']].map(([r, l]) => (
            <button key={r} type="button" onClick={() => flag(r!)} className="text-left rounded-2xl border border-line px-4 py-3 hover:bg-surface-2 text-sm font-semibold">{l}</button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
