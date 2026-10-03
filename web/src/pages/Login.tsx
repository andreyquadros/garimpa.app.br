import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { api } from '@/lib/api';
import { useConfig, useToast } from '@/lib/hooks';
import { GoogleButton } from '@/components/GoogleButton';
import { Button, Field } from '@/components/ui';
import { asset, Wordmark } from '@/components/brand';

/** Boas-vindas: ilustração do comércio local, uma frase e o botão do Google. */
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
    try { await api.loginGoogle(credential); toast.push({ text: 'Bem-vindo ao Pepita Social.' }); await done(); }
    catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); }
  }, [done, toast]);
  async function dev() {
    if (busy) return;
    setBusy(true);
    try { await api.loginDev(name.trim()); await done(); } catch (e) { toast.push({ text: (e as Error).message, tone: 'erro' }); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh flex flex-col px-5 pb-8 safe-top bg-bg">
      <header className="h-16 flex items-center justify-between">
        <Wordmark size={26} />
        <span className="h-9 px-4 rounded-full bg-lima-400 text-floresta-900 text-xs font-extrabold uppercase tracking-wider grid place-items-center">{cfg?.city?.name ?? 'Ariquemes'}</span>
      </header>

      <div className="flex-1 flex flex-col justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="relative mx-auto w-full max-w-[340px] aspect-square max-h-[38vh]">
          <span className="absolute inset-[6%] rounded-full bg-lima-100 dark:bg-floresta-600" aria-hidden="true" />
          <motion.img src={asset('ilustracoes/comercio-local.webp')} alt="Ilustração de lojas de bairro com um marcador de mapa" draggable={false}
            className="relative w-full h-full object-contain" animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
        </motion.div>
        <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="mt-6">
          <h1 className="display text-[2.2rem]">O que você procura está mais perto.</h1>
          <p className="text-ink-2 text-lg mt-3 leading-snug">Encontre produtos na sua cidade. Ajude pessoas. Receba pepitas.</p>
        </motion.div>
      </div>

      <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="mt-6">
        {cfg?.googleClientId ? (
          <GoogleButton clientId={cfg.googleClientId} onCredential={onGoogle} />
        ) : cfg?.devLogin ? (
          <form onSubmit={(e) => { e.preventDefault(); dev(); }} className="space-y-3">
            <Field label="Seu nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Marina Castro" autoFocus />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={name.trim().length < 2} arrow>Continuar</Button>
          </form>
        ) : cfg ? <p className="text-sm text-ink-2 text-center">Login indisponível no momento.</p> : <div className="h-14" />}
        <Link to="/" className="block text-center font-display font-extrabold text-accent mt-5">Explorar primeiro</Link>
        <p className="text-center text-xs text-ink-2 mt-4">Sem senha e sem cadastro. Piloto em {cfg?.city?.name ?? 'Ariquemes'}.</p>
      </motion.div>
    </div>
  );
}
