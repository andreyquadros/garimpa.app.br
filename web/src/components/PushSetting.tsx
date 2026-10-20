import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/hooks';
import { disablePush, enablePush, type PushStatus } from '@/lib/push';
import { usePushKey, usePushStatus } from '@/lib/push-browser';
import { IphoneInstallHint } from './PushPrompt';

/** Linha "Avisos no celular" da Carteira: reflete o estado real do push neste aparelho. */
export function PushSetting({
  status,
  onChange,
  busy = false,
}: {
  status: PushStatus | null;
  onChange: (on: boolean) => void;
  busy?: boolean;
}) {
  if (!status) return null;
  const on = status === 'ativo';
  const blocked = status === 'negado' || status === 'indisponivel' || status === 'instalar-no-iphone';
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex items-center gap-3">
        <BellRing size={16} className="text-accent shrink-0" aria-hidden="true" />
        <span id="push-setting-label" className="flex-1 font-bold">
          Avisos no celular
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="push-setting-label"
          disabled={blocked || busy}
          onClick={() => onChange(!on)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-brand' : 'bg-surface-2 border border-line'}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? 'left-6' : 'left-1'}`}
          />
        </button>
      </div>
      {status === 'negado' && (
        <p className="text-xs text-ink-2 mt-2">
          Os avisos estão bloqueados para este site. Para receber de novo, libere as notificações do Pepita Social nas
          configurações do navegador (no cadeado ao lado do endereço, ou em Configurações › Notificações) e volte aqui.
        </p>
      )}
      {status === 'indisponivel' && (
        <p className="text-xs text-ink-2 mt-2">Este navegador não recebe avisos. Os novos aparecem no sininho.</p>
      )}
      {status === 'instalar-no-iphone' && <IphoneInstallHint className="text-xs text-ink-2 mt-2" />}
    </div>
  );
}

/** PushSetting ligado ao servidor e ao navegador: sem chave VAPID no servidor, a opção nem aparece. */
export function PushSettingRow() {
  const key = usePushKey();
  const serverKey = key.isError ? null : key.data;
  const { status, setStatus, refresh } = usePushStatus(serverKey);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!serverKey) return null;

  async function onChange(on: boolean) {
    setBusy(true);
    try {
      if (on) setStatus(await enablePush(api, serverKey!));
      else {
        await disablePush(api);
        refresh();
      }
    } catch {
      toast.push({ text: 'Não deu para mudar os avisos agora.', tone: 'erro' });
      refresh();
    } finally {
      setBusy(false);
    }
  }
  return <PushSetting status={status} onChange={onChange} busy={busy} />;
}
