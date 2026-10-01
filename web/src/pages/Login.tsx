import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { api } from '@/lib/api';
import { useConfig, useToast } from '@/lib/hooks';
import { GoogleButton } from '@/components/GoogleButton';
import { Button, Field, Logo, PepitaIcon } from '@/components/ui';

export function Login() {
  const { data: cfg } = useConfig();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const done = useCallback(async () => {
    // Troca de conta: descarta tudo que era do usuário anterior (extrato, votos, ranking), menos a configuração.
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'config' });
    await qc.invalidateQueries({ queryKey: ['me'] });
    nav(next, { replace: true });
  }, [qc, nav, next]);
  const onGoogle = useCallback(async (credential: string) => {
    try { await api.loginGoogle(credential); toast.push({ text: 'Bem-vindo ao garimpo.' }); await done(); }
    catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }, [done, toast]);
  async function dev() {
    if (busy) return;
    setBusy(true);
    try { await api.loginDev(name.trim()); await done(); } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh flex flex-col px-6 pb-8 safe-top bg-rio-800 text-white">
      <div className="flex-1 flex flex-col justify-center">
        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-3">
          <Logo size={56} />
          <div><h1 className="font-display text-4xl leading-none">Garimpa</h1><p className="text-rio-200 text-sm mt-1">achados de Ariquemes</p></div>
        </motion.div>
        <h2 className="font-display text-2xl mt-8 leading-tight text-balance">Onde encontro isso na cidade? Alguém sabe. E ganha por contar.</h2>
        <ul className="mt-6 space-y-3 text-rio-100">
          {[
            ['⛏️', 'Pergunte o que você não acha. Se já perguntaram, o mapa mostra na hora.'],
            ['📸', 'Quem sabe onde tem responde com foto no local, nota ou recibo.'],
            ['🪙', 'Pepitas para quem acha, gorjetas de quem pediu. Na fase 2, viram dinheiro de verdade.'],
          ].map(([e, t]) => <li key={t} className="flex gap-3"><span className="text-xl">{e}</span><span className="text-[15px] leading-snug">{t}</span></li>)}
        </ul>
      </div>
      <div className="rounded-3xl bg-surface text-ink p-5 shadow-float">
        {cfg?.googleClientId ? (
          <>
            <p className="text-sm text-ink-2 mb-3 text-center">Sem senha, sem cadastro: entre com a conta do Google.</p>
            <GoogleButton clientId={cfg.googleClientId} onCredential={onGoogle} />
          </>
        ) : cfg?.devLogin ? (
          <form onSubmit={(e) => { e.preventDefault(); dev(); }} className="space-y-3">
            <p className="text-xs font-bold text-pepita-700 bg-pepita-200 rounded-full px-3 h-7 inline-flex items-center">Ambiente de desenvolvimento</p>
            <Field label="Seu nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Marina Castro" autoFocus />
            <Button type="submit" variant="gold" size="lg" className="w-full" loading={busy} disabled={name.trim().length < 2}><PepitaIcon size={20} />Entrar e garimpar</Button>
            <p className="text-xs text-ink-2">Em produção este formulário some e só o botão do Google aparece (GOOGLE_CLIENT_ID).</p>
          </form>
        ) : <p className="text-sm text-ink-2 text-center">Login indisponível no momento.</p>}
        <Link to="/" className="block text-center text-sm font-semibold text-accent mt-4">Só olhar o mapa por enquanto</Link>
      </div>
    </div>
  );
}
