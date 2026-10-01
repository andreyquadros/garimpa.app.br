import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Compass, FlaskConical, List, Plus, Trophy, UserRound } from 'lucide-react';
import { useMe, useToast } from '@/lib/hooks';
import { PepitaIcon, Sheet, Button, LevelRing } from './ui';
import { celebrate } from '@/lib/reward';

const tabs = [
  { to: '/', label: 'Mapa', icon: Compass, end: true },
  { to: '/garimpos', label: 'Garimpos', icon: List },
  { to: '/ranking', label: 'Ranking', icon: Trophy },
  { to: '/perfil', label: 'Perfil', icon: UserRound },
];

export function Shell() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { data: me } = useMe();
  const hideNav = pathname.startsWith('/perguntar') || /\/responder$/.test(pathname) || pathname === '/entrar';
  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col relative bg-bg">
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      {!hideNav && (
        <nav className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-lg" aria-label="Principal">
          <div className="relative mx-3 mb-3 rounded-[1.6rem] bg-surface/92 backdrop-blur shadow-float border border-line grid grid-cols-5 items-end h-16 safe-bottom">
            {tabs.slice(0, 2).map((t) => <Tab key={t.to} {...t} />)}
            <div className="relative -top-5 grid place-items-center">
              <motion.button whileTap={{ scale: 0.92 }} onClick={() => nav('/perguntar')} aria-label="Perguntar onde tem"
                className="h-16 w-16 rounded-full bg-pepita-400 text-rio-900 shadow-pepita grid place-items-center border-4 border-bg">
                <Plus size={30} strokeWidth={2.75} />
              </motion.button>
              <span className="text-[11px] font-semibold text-ink-2 -mt-1">Perguntar</span>
            </div>
            {tabs.slice(2).map((t) => <Tab key={t.to} {...t} />)}
          </div>
        </nav>
      )}
      <Toasts />
      {import.meta.env.VITE_DEMO === '1' && <DemoBadge />}
      {me && <LevelUpWatcher xp={me.user.xp} level={me.level.level} name={me.level.name} perk={me.level.perk} userId={me.user.id} />}
    </div>
  );
}

function Tab({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Compass; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className="relative h-16 grid place-items-center text-ink-2 aria-[current=page]:text-accent">
      {({ isActive }) => (
        <span className="flex flex-col items-center gap-0.5 text-[11px] font-semibold">
          <span className="relative">
            {isActive && <motion.span layoutId="tab-bg" className="absolute -inset-x-3 -inset-y-1.5 rounded-full bg-accent/15" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
            <Icon size={22} className="relative" strokeWidth={isActive ? 2.6 : 2} />
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
          <motion.button key={t.id} onClick={() => dismiss(t.id)} initial={{ y: 30, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 10, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className={`pointer-events-auto text-left rounded-2xl px-4 py-3 shadow-float border flex items-center gap-3 ${t.tone === 'erro' ? 'bg-barro-100 border-barro-500/40 text-barro-700' : 'bg-rio-800 border-rio-700 text-white'}`}>
            {(t.xp || t.pepitas) ? (
              <span className="flex items-center gap-2 shrink-0">
                {t.pepitas ? <motion.span initial={{ rotate: -30, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }} className="flex items-center gap-1 font-display font-bold text-pepita-400"><PepitaIcon size={20} />+{t.pepitas}</motion.span> : null}
                {t.xp ? <span className="font-display font-bold text-rio-100">+{t.xp} XP</span> : null}
              </span>
            ) : null}
            <span className="text-sm font-semibold leading-tight">{t.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Mostra a cerimônia de subida de nível uma vez por nível, por usuário. */
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
      <div className="text-center py-4">
        <motion.div initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="mx-auto w-fit">
          <LevelRing progress={1} level={level} size={112}><span className="font-display font-bold text-4xl">{level}</span></LevelRing>
        </motion.div>
        <p className="text-ink-2 mt-4">Você subiu de nível</p>
        <h2 className="font-display text-3xl mt-1">{name}</h2>
        <p className="mt-2 text-balance">{perk}</p>
        <p className="text-sm text-ink-2 mt-1">{xp.toLocaleString('pt-BR')} XP acumulados</p>
        <Button variant="gold" className="mt-6 w-full" onClick={() => setShow(false)}>Bora garimpar</Button>
      </div>
    </Sheet>
  );
}

/**
 * Selo do modo demonstração: aba no canto superior direito; o toque explica o que é e oferece reiniciar ou avançar o relógio.
 * A condição usa import.meta.env direto (literal em tempo de build) para o bundle normal nem incluir este componente.
 */
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
        className="fixed right-0 z-[510] h-[18px] pl-2 pr-2.5 rounded-bl-xl bg-pepita-400 text-rio-900 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 shadow-pepita"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <FlaskConical size={11} strokeWidth={2.75} />Demonstração
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Modo demonstração">
        <div className="text-sm space-y-3">
          <p>Tudo aqui roda dentro do navegador: a API, o banco e as regras de pontos são uma cópia fiel do Garimpa, mas <b>os dados ficam só neste aparelho</b> e somem se você limpar os dados do site.</p>
          <p>Entre como <b>marina</b>, <b>joao</b>, <b>tais</b>, <b>rafael</b>, <b>lucas</b> ou <b>dona neide</b> para usar as contas de exemplo; qualquer outro nome cria uma conta nova. Como todas dividem este aparelho, a checagem de conluio fica desligada.</p>
          <p className="text-ink-2">Fotos enviadas não saem do navegador e não são guardadas: ao recarregar, viram uma imagem de exemplo. Sem EXIF, a prova pontua só pela sua localização.</p>
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
