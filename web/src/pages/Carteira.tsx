import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Clock, Heart, HelpCircle, Info, Lock, LogOut, Moon, Share2, Sun } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useMe, useShare, useTheme, useToast } from '@/lib/hooks';
import { KIND_LABEL, timeAgo } from '@/lib/format';
import { Avatar, Button, Headline, Sheet, Spinner } from '@/components/ui';
import { asset, NuggetIcon, Pepi, XpStar } from '@/components/brand';

/** Carteira: pepitas de agradecimento, fundo de recompensas e histórico. */
export function Carteira() {
  const { data: me, isPending } = useMe();
  const { data: cfg } = useConfig();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const share = useShare();
  const { theme, setTheme } = useTheme();
  const [how, setHow] = useState(false);
  const historyRef = useRef<HTMLElement>(null);
  const ledger = useQuery({ queryKey: ['ledger'], queryFn: api.ledger, enabled: !!me });

  if (isPending) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!me) {
    return (
      <div className="flex-1 grid place-items-center px-6 pb-28">
        <div className="text-center">
          <img src={asset('conquistas/nugget-stack.svg')} alt="" aria-hidden="true" className="mx-auto w-40" draggable={false} />
          <p className="eyebrow mt-4">Sua carteira</p>
          <h1 className="font-display font-extrabold text-3xl mt-1 text-balance">A ajuda volta em reconhecimento.</h1>
          <p className="text-ink-2 mt-2 text-balance">Entre para guardar as pepitas que a comunidade manda quando a sua pista faz alguém encontrar.</p>
          <Link to="/entrar?next=/carteira" className="block mt-6"><Button variant="primary" size="lg" className="w-full" arrow>Entrar com Google</Button></Link>
        </div>
      </div>
    );
  }

  const { user, stats } = me;
  const eco = cfg?.economy;
  const items = ledger.data?.items ?? [];
  const thanks = items.filter((l) => l.credits !== 0);
  const vestDate = stats.proximaLiberacao ? new Date(stats.proximaLiberacao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null;

  async function logout() {
    await api.logout();
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'config' });
    qc.setQueryData(['me'], null);
    nav('/');
  }
  async function invite() {
    const r = await share('Vem descobrir onde tem em Ariquemes comigo no Pepita Social', location.origin);
    if (r === 'copied') toast.push({ text: 'Link copiado. Manda no grupo!' });
  }

  return (
    <div className="pb-32 px-4">
      <Headline eyebrow="Sua carteira" title={<>A ajuda volta<br />em reconhecimento.</>} className="mt-3"
        right={<button type="button" onClick={invite} aria-label="Convidar amigos" className="h-11 w-11 grid place-items-center rounded-full bg-surface border border-line text-ink-2"><Share2 size={18} /></button>} />

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5 relative overflow-hidden rounded-card bg-floresta-700 text-creme p-5 shadow-float dark:bg-floresta-600">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display font-bold text-sage-200">Pepitas de agradecimento</p>
            <p data-testid="credits" className="font-display font-extrabold text-[3.6rem] leading-none mt-3 tabular">{user.credits.toLocaleString('pt-BR')}</p>
            {user.creditsPending > 0 ? <p className="text-sm text-lima-400 font-bold mt-3 inline-flex items-center gap-1.5"><Clock size={14} />+{user.creditsPending} em carência{vestDate ? `, liberam ${vestDate}` : ''}</p> : <p className="text-sage-200 mt-3">Pepitas chegam quando a sua pista faz alguém encontrar.</p>}
          </div>
          <motion.img src={asset('conquistas/nugget.svg')} alt="" aria-hidden="true" draggable={false} className="w-24 shrink-0 -mr-1 mt-2"
            animate={{ y: [0, -6, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }} />
        </div>
        <p className="mt-4 pt-4 border-t border-creme/15 text-sm text-sage-200 inline-flex items-center gap-2"><Lock size={14} />Resgate abre na fase 2, com as lojas parceiras.</p>
      </motion.section>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setHow(true)} className="h-14 rounded-full bg-surface border border-line font-display font-extrabold inline-flex items-center justify-center gap-2"><HelpCircle size={20} className="text-accent" />Como funcionam</button>
        <button type="button" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="h-14 rounded-full bg-surface border border-line font-display font-extrabold inline-flex items-center justify-center gap-2"><Clock size={20} className="text-accent" />Meu histórico</button>
      </div>

      <section className="mt-4 flex items-start gap-3 px-1">
        <span className="mt-0.5 h-8 w-8 shrink-0 grid place-items-center rounded-full bg-surface-2 text-accent"><Info size={16} /></span>
        <p className="text-sm text-ink-2 leading-snug"><b className="text-ink">Fundo de recompensas: R$ 0,00.</b> Ele passa a receber quando as lojas parceiras entrarem. Primeiro, uma comunidade útil; depois, parceiros; então, fundo e regras.</p>
      </section>

      <section ref={historyRef} className="mt-7 scroll-mt-20">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-extrabold text-xl">Últimos agradecimentos</h2>
          {thanks.length > 0 && <span className="text-sm text-ink-2">{thanks.length}</span>}
        </div>
        <ul className="mt-3 space-y-2">
          {thanks.slice(0, 12).map((l) => (
            <li key={l.id} className="flex items-center gap-3">
              <span className={`h-12 w-12 shrink-0 grid place-items-center rounded-2xl ${l.credits > 0 ? 'bg-esmeralda-100 text-esmeralda-800' : 'bg-brasa-100 text-brasa-700'}`}><Heart size={20} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold truncate">{KIND_LABEL[l.kind] ?? l.kind}</span>
                <span className="block text-sm text-ink-2">{timeAgo(l.createdAt)}{l.state === 'carencia' ? ' · em carência' : l.state === 'estornado' ? ' · estornado' : ''}</span>
              </span>
              <span className={`font-display font-extrabold text-lg tabular ${l.credits > 0 ? 'text-green-ink' : 'text-brasa-ink'}`}>{l.credits > 0 ? '+' : ''}{l.credits}</span>
            </li>
          ))}
          {ledger.isSuccess && thanks.length === 0 && (
            <li className="rounded-card bg-surface border border-line p-4 flex items-center gap-3">
              <Pepi pose="explorador" size={72} />
              <span className="text-sm text-ink-2">Nada ainda. Envie uma evidência numa missão aberta: quando aceitarem, as pepitas chegam aqui.</span>
            </li>
          )}
        </ul>
        {items.some((l) => l.xp !== 0) && (
          <details className="mt-4 group">
            <summary className="cursor-pointer text-sm font-bold text-accent list-none">Ver todo o histórico de XP</summary>
            <ul className="mt-2 space-y-1.5">
              {items.filter((l) => l.xp !== 0).slice(0, 30).map((l) => (
                <li key={l.id} className="rounded-2xl bg-surface border border-line px-3 py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{KIND_LABEL[l.kind] ?? l.kind}</span><span className="block text-xs text-ink-2">{timeAgo(l.createdAt)}</span></span>
                  <span className={`font-display font-extrabold inline-flex items-center gap-1 ${l.xp > 0 ? 'text-green-ink' : 'text-brasa-ink'}`}><XpStar size={14} />{l.xp > 0 ? '+' : ''}{l.xp}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>


      <section className="mt-7">
        <h2 className="font-display font-extrabold text-xl">Conta</h2>
        <div className="mt-3 rounded-card bg-surface border border-line divide-y divide-line">
          <div className="px-4 py-3 flex items-center gap-3">
            <Avatar name={user.name} url={user.avatarUrl} size={40} lime />
            <span className="flex-1 min-w-0"><span className="block font-bold truncate">{user.name}</span><span className="block text-xs text-ink-2">@{user.handle}</span></span>
          </div>
          <div className="px-4 py-3 flex items-center gap-3 text-sm"><span className="flex-1 font-bold">Tema</span>
            {(['auto', 'light', 'dark'] as const).map((t) => <button key={t} type="button" onClick={() => setTheme(t)} aria-label={`Tema ${t}`} className={`h-8 px-3 rounded-full text-xs font-bold ${theme === t ? 'bg-brand text-on-brand' : 'bg-surface-2'}`}>{t === 'auto' ? 'Auto' : t === 'light' ? <Sun size={14} /> : <Moon size={14} />}</button>)}
          </div>
          <button type="button" onClick={logout} className="w-full px-4 py-3 flex items-center gap-3 text-sm font-bold text-brasa-ink"><LogOut size={16} />Sair</button>
        </div>
        <p className="text-xs text-ink-2 mt-3">Pepita Social é um piloto da Incubadora de Software do IFRO em Ariquemes. Pepitas não são dinheiro nem têm cotação fixa; XP nunca vira dinheiro.</p>
      </section>

      <Sheet open={how} onClose={() => setHow(false)} title="Como funcionam as pepitas" tall>
        {eco && (
          <div className="text-sm space-y-4">
            <p className="text-ink-2">XP mede a sua jornada e sobe de patente. Pepitas são o agradecimento da comunidade. São contas separadas.</p>
            <table className="w-full">
              <thead><tr className="text-left text-xs text-ink-2"><th className="py-1">Ação</th><th className="text-right">XP</th><th className="text-right">Pepitas</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[
                  ['Abrir uma missão', eco.xp.pergunta, 0], ['"Também preciso" numa missão', eco.xp.tambem_quero, 0], ['Evidência forte', eco.xp.resposta_com_evidencia, 0],
                  ['Sua evidência é aceita', eco.xp.resposta_aceita, eco.pepitas.resposta_aceita], ['Primeira descoberta no lugar', eco.xp.primeiro_achado, eco.pepitas.primeiro_achado],
                  ['Duas pessoas confirmam', eco.xp.resposta_confirmada, eco.pepitas.resposta_confirmada], ['Confirmar uma descoberta', eco.xp.confirmar, 0],
                  ['Sua confirmação é validada', eco.xp.confirmacao_validada, eco.pepitas.confirmacao_validada], ['Aceitar uma evidência', eco.xp.aceitar_resposta, 0],
                ].map(([l, x, p]) => <tr key={l as string}><td className="py-1.5">{l as string}</td><td className="text-right font-bold">+{x as number}</td><td className="text-right font-bold text-gold-ink">{(p as number) > 0 ? <span className="inline-flex items-center gap-1"><NuggetIcon size={12} />+{p as number}</span> : '–'}</td></tr>)}
              </tbody>
            </table>
            <ul className="space-y-1.5 text-ink-2">
              <li>Pepitas entram em carência de {eco.carencia_dias} dias (antifraude) e depois ficam disponíveis.</li>
              <li>Segunda descoberta no mesmo lugar vale 25%: a evidência vira confirmação.</li>
              <li>Quem abre a missão tem {eco.pepitas.gorjeta_por_pergunta} pepitas de agradecimento para distribuir, sem custo.</li>
              <li>Na fase 2, {eco.conversao.pepitas_por_real} pepitas valem R$ 1, pagas pelo fundo das lojas parceiras ({Math.round(eco.conversao.percentual_cofre * 100)}% do que elas pagam). Mínimo para resgate: {eco.conversao.minimo_resgate_pepitas.toLocaleString('pt-BR')}.</li>
              <li>Limites por dia: {eco.limites_dia.perguntas} missões, {eco.limites_dia.respostas} evidências, {eco.limites_dia.confirmacoes} confirmações.</li>
            </ul>
            <div>
              <p className="font-bold mb-1">Patentes</p>
              <ol className="space-y-1">{cfg?.levels.map((l) => <li key={l.level} className={`flex gap-2 ${l.level === me.level.level ? 'font-bold text-green-ink' : ''}`}><span className="w-16 shrink-0 text-ink-2 tabular">{l.xp.toLocaleString('pt-BR')} XP</span><span>{l.name}</span><span className="text-ink-2 font-normal">· {l.perk}</span></li>)}</ol>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
