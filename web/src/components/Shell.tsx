import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Compass, Flag, FlaskConical, Sparkles, Wallet } from 'lucide-react';
import { useMe, useToast } from '@/lib/hooks';
import { Sheet, Button, Avatar, XpChip } from './ui';
import { Anim, Pepi, RankBadge, Wordmark } from './brand';
import { celebrate } from '@/lib/reward';

const tabs = [
  { to: '/', label: 'Explorar', icon: Compass, end: true },
  { to: '/missoes', label: 'Missões', icon: Flag },
  { to: '/jornada', label: 'Jornada', icon: Sparkles },
  { to: '/carteira', label: 'Carteira', icon: Wallet },
];

export function Shell() {
  const { pathname } = useLocation();
  const { data: me } = useMe();
  const bare = pathname === '/entrar';
  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col relative bg-bg">
      {!bare && <TopBar />}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      {!bare && (
        <nav className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-lg bg-surface/95 backdrop-blur border-t border-line safe-bottom" aria-label="Principal">
          <div className="grid grid-cols-4 h-[4.25rem]">
            {tabs.map((t) => <Tab key={t.to} {...t} />)}
          </div>
        </nav>
      )}
      <Toasts />
      {import.meta.env.VITE_DEMO === '1' && <DemoBadge />}
      {me && <LevelUpWatcher xp={me.user.xp} level={me.level.level} name={me.level.name} perk={me.level.perk} userId={me.user.id} />}
    </div>
  );
}

/** Cabeçalho fixo das telas: marca à esquerda, XP e avatar à direita (como nas telas de referência). */
function TopBar() {
  const { data: me } = useMe();
  return (
    <header className="sticky top-0 z-30 bg-bg/92 backdrop-blur safe-top">
      <div className="h-14 px-4 flex items-center gap-2">
        <Link to="/" aria-label="Pepita Social, início" className="mr-auto"><Wordmark size={24} /></Link>
        {me ? (
          <>
            <Link to="/jornada" aria-label="Sua jornada"><XpChip xp={me.user.xp} size="sm" /></Link>
            <Link to="/carteira" aria-label="Sua carteira" className="relative">
              <Avatar name={me.user.name} url={me.user.avatarUrl} size={38} />
              <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-lima-400 border-2 border-bg" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <Link to="/entrar" className="h-9 px-4 rounded-full bg-brand text-on-brand font-display font-bold text-sm grid place-items-center">Entrar</Link>
        )}
      </div>
    </header>
  );
}

function Tab({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Compass; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className="relative grid place-items-center text-ink-2 aria-[current=page]:text-brand-ink">
      {({ isActive }) => (
        <span className="flex flex-col items-center gap-1 text-[12px] font-bold">
          <span className="relative h-9 w-14 grid place-items-center">
            {isActive && <motion.span layoutId="tab-bg" className="absolute inset-0 rounded-full bg-lima-400" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
            <Icon size={22} className={`relative ${isActive ? 'text-floresta-900' : ''}`} strokeWidth={isActive ? 2.4 : 1.9} />
          </span>
          {label}
        </span>
      )}
    </NavLink>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 w-[min(92vw,26rem)] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button key={t.id} onClick={() => dismiss(t.id)} initial={{ y: 30, opacity: 0, scale: 0.92 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 10, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className={`pointer-events-auto text-left rounded-2xl pl-3 pr-4 py-2.5 shadow-float border flex items-center gap-3 ${t.tone === 'erro' ? 'bg-brasa-100 border-brasa-500/40 text-brasa-700' : 'bg-floresta-700 border-floresta-600 text-creme dark:bg-floresta-600 dark:border-line'}`}>
            {t.pepitas ? <Anim name="gratitude-pop" size={44} /> : t.xp ? <Anim name="xp-rise" size={44} /> : null}
            <span className="flex-1 min-w-0">
              {(t.xp || t.pepitas) ? (
                <span className="flex items-center gap-2 font-display font-extrabold">
                  {t.pepitas ? <span className="text-ouro-400">+{t.pepitas} pepitas</span> : null}
                  {t.xp ? <span className="text-lima-400">+{t.xp} XP</span> : null}
                </span>
              ) : null}
              <span className="block text-sm font-semibold leading-snug">{t.text}</span>
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Cerimônia de subida de patente: Pepi comemora, a insígnia nova aparece. Uma vez por nível, por usuário. */
function LevelUpWatcher({ xp, level, name, perk, userId }: { xp: number; level: number; name: string; perk: string; userId: string }) {
  const key = `garimpa.level.${userId}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    const prev = Number(localStorage.getItem(key) ?? '0');
    if (prev && level > prev) { setShow(true); celebrate('nivel'); }
    localStorage.setItem(key, String(level));
  }, [level, key]);
  return (
    <Sheet open={show} onClose={() => setShow(false)}>
      <div className="text-center pt-2 pb-3">
        <div className="relative mx-auto w-fit">
          <span className="absolute inset-0 -m-6 rounded-full bg-lima-100 dark:bg-floresta-600" aria-hidden="true" />
          <Pepi pose="comemorando" size={180} celebrate className="relative" />
        </div>
        <p className="eyebrow mt-5">Nova patente</p>
        <div className="flex items-center justify-center gap-3 mt-2">
          <RankBadge level={level} size={48} />
          <h2 className="font-display font-extrabold text-3xl">{name}</h2>
        </div>
        <p className="mt-3 text-balance">{perk}</p>
        <p className="text-sm text-ink-2 mt-1">{xp.toLocaleString('pt-BR')} XP acumulados</p>
        <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => setShow(false)}>Continuar ajudando</Button>
      </div>
    </Sheet>
  );
}

/** Selo do modo demonstração (só existe no build do demo): explica o que é e oferece reiniciar ou avançar o relógio. */
function DemoBadge() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  async function simulate() {
    setBusy(true);
    try {
      const demo = await import('@/lib/demo/state');
      const r = demo.simulateDays(7);
      await qc.invalidateQueries();
      toast.push({ text: r.vested > 0 ? `Sete dias depois: ${r.vested === 1 ? '1 lançamento saiu' : `${r.vested} lançamentos saíram`} da carência.` : 'Sete dias depois. Nada estava em carência.', tone: 'info' });
      setOpen(false);
    } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    const demo = await import('@/lib/demo/state');
    demo.resetDemo();
    qc.clear();
    location.reload();
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Modo demonstração: saiba mais"
        className="fixed left-1/2 -translate-x-1/2 z-[510] h-5 px-2.5 rounded-b-lg bg-ouro-400 text-floresta-900 text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <FlaskConical size={11} strokeWidth={2.75} />Demonstração
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Modo demonstração">
        <div className="text-sm space-y-3">
          <p>Tudo aqui roda dentro do navegador: a API, o banco e as regras de pontos são uma cópia fiel do Pepita Social, mas <b>os dados ficam só neste aparelho</b> e somem se você limpar os dados do site.</p>
          <p>Entre como <b>marina</b>, <b>joao</b>, <b>tais</b>, <b>rafael</b>, <b>lucas</b> ou <b>dona neide</b> para usar as contas de exemplo; qualquer outro nome cria uma conta nova. Como todas dividem este aparelho, a checagem de conluio fica desligada.</p>
          <p className="text-ink-2">Fotos enviadas não saem do navegador e não são guardadas: ao recarregar, viram uma imagem de exemplo. Sem EXIF, a evidência pontua só pela sua localização.</p>
        </div>
        <div className="mt-5 grid gap-2">
          <Button variant="gold" loading={busy} onClick={simulate}>Simular 7 dias</Button>
          <Button variant="ghost" disabled={busy} onClick={reset}>Reiniciar demonstração</Button>
          <p className="text-xs text-ink-2 text-center">Simular 7 dias libera as pepitas em carência e mantém a sua sequência de dias.</p>
        </div>
      </Sheet>
    </>
  );
}
