import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { api } from '@/lib/api';

export const NOTIFICATIONS_KEY = ['notifications'] as const;

function bellLabel(unread: number): string {
  if (unread <= 0) return 'Notificações';
  return `Notificações, ${unread} ${unread === 1 ? 'não lida' : 'não lidas'}`;
}

/** Sininho do cabeçalho com o número de avisos não lidos. */
export function NotificationBell() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'unread'],
    queryFn: async () => (await api.notifications()).unread,
    // Sem push (negado, iPhone sem instalar, servidor sem chave) o número ainda se atualiza sozinho.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // O service worker avisa as abas abertas quando chega um push: o número sobe na hora, sem esperar o intervalo.
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'notificacao')
        qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    };
    sw.addEventListener('message', onMessage);
    return () => sw.removeEventListener('message', onMessage);
  }, [qc]);

  const unread = data ?? 0;
  return (
    <Link
      to="/notificacoes"
      aria-label={bellLabel(unread)}
      className="relative h-10 w-10 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2"
    >
      <Bell size={22} aria-hidden="true" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-brasa-500 text-white text-[11px] font-extrabold grid place-items-center border-2 border-bg tabular"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
