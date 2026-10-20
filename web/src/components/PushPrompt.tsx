import { BellRing, Share } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/hooks';
import { enablePush, type PushStatus, shouldShowPrompt } from '@/lib/push';
import { usePushKey, usePushStatus } from '@/lib/push-browser';
import { Button } from './ui';

export const PUSH_PROMPT_KEY = 'garimpa.push.dispensado';

function readDismissedAt(): number | null {
  try {
    const v = Number(localStorage.getItem(PUSH_PROMPT_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** No iPhone o push só existe com o app instalado na tela inicial (Safari 16.4+). */
export function IphoneInstallHint({ className = '' }: { className?: string }) {
  return (
    <p className={className}>
      No iPhone, os avisos só funcionam com o app instalado: toque em{' '}
      <Share size={14} className="inline -mt-0.5" aria-label="Compartilhar" /> e depois em{' '}
      <b>Adicionar à Tela de Início</b>. Abra o Pepita Social pelo ícone novo e ative os avisos.
    </p>
  );
}

/**
 * Convite para ligar os avisos no celular. Aparece só logo depois de a pessoa publicar uma missão ou enviar uma
 * evidência: é quando o aviso faz sentido para ela (pedir a permissão sem contexto costuma levar a um "bloquear"
 * definitivo).
 */
export function PushPrompt({
  status,
  onEnable,
  className = '',
}: {
  status: PushStatus | null;
  onEnable: () => Promise<void> | void;
  className?: string;
}) {
  const [hidden, setHidden] = useState(() => !shouldShowPrompt(readDismissedAt(), Date.now()));
  const [busy, setBusy] = useState(false);
  if (hidden || (status !== 'inativo' && status !== 'instalar-no-iphone')) return null;

  function dismiss() {
    try {
      localStorage.setItem(PUSH_PROMPT_KEY, String(Date.now()));
    } catch {
      // Sem storage o convite volta na próxima vez; não é motivo para erro.
    }
    setHidden(true);
  }
  async function enable() {
    setBusy(true);
    try {
      await onEnable();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Avisos no celular"
      className={`rounded-card bg-surface border border-line p-4 text-left shadow-float ${className}`}
    >
      <div className="flex gap-3">
        <span className="h-10 w-10 shrink-0 grid place-items-center rounded-full bg-lima-100 text-floresta-900">
          <BellRing size={20} aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-extrabold">Quer ser avisado quando responderem?</p>
          {status === 'inativo' ? (
            <p className="text-sm text-ink-2 mt-0.5">
              Avisamos no celular quando chegar uma pista, quando confirmarem a sua ou quando pepitas forem liberadas.
            </p>
          ) : (
            <IphoneInstallHint className="text-sm text-ink-2 mt-0.5" />
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Agora não
        </Button>
        {status === 'inativo' && (
          <Button variant="primary" size="sm" loading={busy} onClick={enable}>
            Ativar avisos
          </Button>
        )}
      </div>
    </section>
  );
}

/** PushPrompt ligado ao servidor e ao navegador: sem chave VAPID no servidor, nada aparece. */
export function OfferPush({ className = '' }: { className?: string }) {
  const key = usePushKey();
  const serverKey = key.isError ? null : key.data;
  const { status, setStatus } = usePushStatus(serverKey);
  const toast = useToast();
  if (!serverKey) return null;

  async function onEnable() {
    try {
      const next = await enablePush(api, serverKey!);
      setStatus(next);
      if (next === 'ativo') toast.push({ text: 'Pronto: os avisos chegam neste aparelho.' });
      else if (next === 'negado')
        toast.push({ text: 'Avisos bloqueados. Dá para liberar nas configurações do navegador.', tone: 'info' });
    } catch {
      toast.push({ text: 'Não deu para ativar os avisos agora.', tone: 'erro' });
    }
  }
  return <PushPrompt status={status} onEnable={onEnable} className={className} />;
}
