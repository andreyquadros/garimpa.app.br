import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Camera, Disc, Eye, Flag, Flame, Gem, Hand, HelpCircle, Lock, LogOut, Map, Moon, Share2, Sun, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfig, useMe, useShare, useTheme, useToast } from '@/lib/hooks';
import { KIND_LABEL, timeAgo } from '@/lib/format';
import { Avatar, Button, EmptyState, LevelRing, Logo, PepitaIcon, PepitaPill, Section, Sheet } from '@/components/ui';

const BADGES = [
  { slug: 'fundador', name: 'Fundador', description: 'Entrou no piloto de Ariquemes.', icon: Flag },
  { slug: 'primeiro_achado', name: 'Primeiro achado', description: 'Teve a primeira resposta aceita.', icon: Gem },
  { slug: 'olho_de_lince', name: 'Olho de lince', description: 'Cinco primeiros achados em lugares diferentes.', icon: Eye },
  { slug: 'bateia', name: 'Bateia', description: 'Confirmou dez achados indo até o lugar.', icon: Disc },
  { slug: 'bom_de_prova', name: 'Bom de prova', description: 'Dez provas fortes.', icon: Camera },
  { slug: 'maratonista', name: 'Maratonista', description: 'Sete dias seguidos garimpando.', icon: Flame },
  { slug: 'mao_aberta', name: 'Mão aberta', description: 'Deu dez gorjetas.', icon: Hand },
  { slug: 'cartografo', name: 'Cartógrafo', description: 'Cadastrou cinco lugares novos.', icon: Map },
  { slug: 'garimpeiro_semana', name: 'Garimpeiro da semana', description: 'Topo do ranking semanal.', icon: Trophy },
];

export function Profile() {
  const { data: me, isPending } = useMe();
  const { data: cfg } = useConfig();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const share = useShare();
  const { theme, setTheme } = useTheme();
  const [how, setHow] = useState(false);
  const ledger = useQuery({ queryKey: ['ledger'], queryFn: api.ledger, enabled: !!me });

  if (isPending) return null;
  if (!me) {
    return (
      <div className="min-h-dvh grid place-items-center px-6 pb-24">
        <EmptyState icon={<Logo size={34} />} title="Seu perfil de garimpeiro" text="Entre para guardar pepitas, subir de nível e receber gorjetas."
          action={<Link to="/entrar?next=/perfil"><Button variant="gold" size="lg">Entrar com Google</Button></Link>} />
      </div>
    );
  }
  const { user, level, badges, stats } = me;
  const earned = new Set(badges.map((b) => b.slug));
  const eco = cfg?.economy;
  const reais = eco ? (user.credits / eco.conversao.pepitas_por_real).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;

  async function logout() { await api.logout(); qc.setQueryData(['me'], null); qc.invalidateQueries(); nav('/'); }

  return (
    <div className="pb-32">
      <header className="safe-top px-4 pt-4">
        <div className="flex items-center gap-4">
          <LevelRing progress={level.progress} level={level.level} size={88}><Avatar name={user.name} url={user.avatarUrl} size={66} /></LevelRing>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl leading-tight truncate">{user.name}</h1>
            <p className="text-sm text-ink-2">@{user.handle} · {me.rank}º em Ariquemes</p>
            <p className="mt-1 font-display font-semibold text-accent">Nível {level.level} · {level.name}</p>
          </div>
          <button type="button" onClick={async () => { const r = await share('Vem garimpar comigo em Ariquemes', location.origin); if (r === 'copied') toast.push({ text: 'Link copiado. Manda no grupo!' }); }} aria-label="Convidar" className="h-10 w-10 grid place-items-center rounded-full bg-surface-2"><Share2 size={18} /></button>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs font-semibold text-ink-2"><span>{user.xp.toLocaleString('pt-BR')} XP</span><span>{level.next ? `faltam ${level.toNext.toLocaleString('pt-BR')} para ${level.next.name}` : 'nível máximo'}</span></div>
          <div className="h-2.5 rounded-full bg-line mt-1 overflow-hidden"><motion.div className="h-full bg-rio-600 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.max(3, level.progress * 100)}%` }} transition={{ duration: 1 }} /></div>
          <p className="text-xs text-ink-2 mt-1">{level.perk}</p>
        </div>
      </header>

      <section className="mx-4 mt-5 rounded-3xl bg-rio-800 text-white p-4 shadow-float relative overflow-hidden">
        <PepitaIcon size={140} className="absolute -right-6 -bottom-8 opacity-15 rotate-12" />
        <p className="text-xs font-bold text-rio-200">Minhas pepitas</p>
        <div className="flex items-end gap-3 mt-1">
          <span className="font-display font-bold text-4xl flex items-center gap-2"><PepitaIcon size={34} /><span>{user.credits.toLocaleString('pt-BR')}</span></span>
          {user.creditsPending > 0 && <span className="text-sm text-rio-100 mb-1">+{user.creditsPending} em carência{stats.proximaLiberacao ? `, libera ${new Date(stats.proximaLiberacao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` : ''}</span>}
        </div>
        <p className="text-sm text-rio-100 mt-2">{reais ? `Vale ${reais} quando o resgate abrir (fase 2, com lojas parceiras). ` : ''}Mínimo para sacar: {eco?.conversao.minimo_resgate_pepitas.toLocaleString('pt-BR') ?? '2.000'} pepitas.</p>
        <button type="button" onClick={() => setHow(true)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-pepita-200"><HelpCircle size={16} />Como ganhar mais</button>
      </section>

      <div className="mx-4 mt-4 grid grid-cols-4 gap-2 text-center">
        {[['Perguntas', stats.perguntas], ['Pistas', stats.respostas], ['Achados', stats.achados], ['Confirmou', stats.confirmacoes]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl bg-surface py-2"><p className="font-display font-bold text-xl">{v as number}</p><p className="text-[11px] text-ink-2">{l as string}</p></div>
        ))}
      </div>
      {user.streakDays > 1 && <p className="mx-4 mt-3 text-sm font-semibold text-barro-ink flex items-center gap-1"><Flame size={16} />{user.streakDays} dias seguidos garimpando</p>}

      <div className="px-4">
        <Section title="Conquistas" right={<span className="text-xs text-ink-2">{earned.size} de {BADGES.length}</span>}>
          <div className="grid grid-cols-3 gap-2">
            {BADGES.map((b) => {
              const has = earned.has(b.slug);
              const Icon = b.icon;
              return (
                <div key={b.slug} className={`rounded-2xl p-3 text-center ${has ? 'bg-pepita-200/60' : 'bg-surface'}`} title={b.description}>
                  <span className={`mx-auto h-11 w-11 rounded-full grid place-items-center ${has ? 'bg-pepita-400 text-rio-900' : 'bg-surface-2 text-ink-2'}`}>{has ? <Icon size={22} /> : <Lock size={18} />}</span>
                  <p className={`text-xs font-semibold mt-1.5 leading-tight ${has ? '' : 'text-ink-2'}`}>{b.name}</p>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Últimas atividades">
          <ul className="space-y-1.5">
            {(ledger.data?.items ?? []).slice(0, 12).map((l) => (
              <li key={l.id} className="rounded-2xl bg-surface px-3 py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{KIND_LABEL[l.kind] ?? l.kind}</span><span className="block text-xs text-ink-2">{timeAgo(l.createdAt)}{l.state === 'carencia' ? ' · em carência' : l.state === 'estornado' ? ' · estornado' : ''}</span></span>
                {l.xp !== 0 && <span className={`font-display font-bold ${l.xp > 0 ? 'text-accent' : 'text-barro-700'}`}>{l.xp > 0 ? '+' : ''}{l.xp} XP</span>}
                {l.credits !== 0 && <span className={`font-display font-bold inline-flex items-center gap-1 ${l.credits > 0 ? 'text-pepita-700' : 'text-barro-700'}`}><PepitaIcon size={14} />{l.credits > 0 ? '+' : ''}{l.credits}</span>}
              </li>
            ))}
            {ledger.isSuccess && ledger.data.items.length === 0 && <li className="text-sm text-ink-2">Nada ainda. Responda uma pergunta com foto para começar.</li>}
          </ul>
        </Section>

        <Section title="Ajustes">
          <div className="rounded-2xl bg-surface divide-y divide-line">
            <div className="px-4 py-3 flex items-center gap-3 text-sm"><span className="flex-1 font-semibold">Tema</span>
              {(['auto', 'light', 'dark'] as const).map((t) => <button key={t} type="button" onClick={() => setTheme(t)} className={`h-8 px-3 rounded-full text-xs font-bold ${theme === t ? 'bg-rio-700 text-white' : 'bg-surface-2'}`}>{t === 'auto' ? 'Auto' : t === 'light' ? <Sun size={14} /> : <Moon size={14} />}</button>)}
            </div>
            <button type="button" onClick={logout} className="w-full px-4 py-3 flex items-center gap-3 text-sm font-semibold text-barro-ink"><LogOut size={16} />Sair</button>
          </div>
          <p className="text-xs text-ink-2 mt-3">Garimpa é um piloto da Incubadora de Software do IFRO em Ariquemes. Pepitas não são dinheiro até o resgate ser aberto; XP nunca vira dinheiro.</p>
        </Section>
      </div>

      <Sheet open={how} onClose={() => setHow(false)} title="Como ganhar pepitas e XP" tall>
        {eco && (
          <div className="text-sm space-y-4">
            <table className="w-full">
              <thead><tr className="text-left text-xs text-ink-2"><th className="py-1">Ação</th><th className="text-right">XP</th><th className="text-right">Pepitas</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[
                  ['Perguntar', eco.xp.pergunta, 0], ['"Também quero" numa pergunta', eco.xp.tambem_quero, 0], ['Pista com prova forte', eco.xp.resposta_com_evidencia, 0],
                  ['Sua pista é aceita', eco.xp.resposta_aceita, eco.pepitas.resposta_aceita], ['Primeiro achado no lugar', eco.xp.primeiro_achado, eco.pepitas.primeiro_achado],
                  ['Duas pessoas confirmam sua pista', eco.xp.resposta_confirmada, eco.pepitas.resposta_confirmada], ['Confirmar pista de alguém', eco.xp.confirmar, 0],
                  ['Sua confirmação é validada', eco.xp.confirmacao_validada, eco.pepitas.confirmacao_validada], ['Aceitar uma resposta', eco.xp.aceitar_resposta, 0],
                ].map(([l, x, p]) => <tr key={l as string}><td className="py-1.5">{l as string}</td><td className="text-right font-semibold">+{x as number}</td><td className="text-right font-semibold text-pepita-700">{(p as number) > 0 ? `+${p}` : '–'}</td></tr>)}
              </tbody>
            </table>
            <ul className="space-y-1 text-ink-2">
              <li>Pepitas entram em carência de {eco.carencia_dias} dias (antifraude) e depois ficam disponíveis.</li>
              <li>Segundo achado no mesmo lugar vale 25%: a prova vira confirmação.</li>
              <li>Quem perguntou tem {eco.pepitas.gorjeta_por_pergunta} pepitas de gorjeta por pergunta para distribuir.</li>
              <li>Na fase 2, {eco.conversao.pepitas_por_real} pepitas valem R$ 1, pagas pelo Cofre das lojas parceiras ({Math.round(eco.conversao.percentual_cofre * 100)}% do que elas pagam).</li>
              <li>Limites por dia: {eco.limites_dia.perguntas} perguntas, {eco.limites_dia.respostas} pistas, {eco.limites_dia.confirmacoes} confirmações.</li>
            </ul>
            <div>
              <p className="font-semibold mb-1">Níveis</p>
              <ol className="space-y-1">{cfg?.levels.map((l) => <li key={l.level} className={`flex gap-2 ${l.level === level.level ? 'font-bold text-accent' : ''}`}><span className="w-14 shrink-0 text-ink-2">{l.xp.toLocaleString('pt-BR')} XP</span><span>{l.name}</span><span className="text-ink-2 font-normal">· {l.perk}</span></li>)}</ol>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
