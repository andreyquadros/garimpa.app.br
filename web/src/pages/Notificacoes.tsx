import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { NOTIFICATIONS_KEY } from '@/components/NotificationBell';
import { Button, EmptyState, Headline, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useMe, useToast } from '@/lib/hooks';
import { safeAppUrl } from '@/lib/notification-payload';
import type { AppNotification } from '@/lib/types';

/** Lista de avisos da pessoa: o que aconteceu nas missões e evidências dela. */
export function Notificacoes() {
  const { data: me, isPending } = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const list = useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'list'],
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!me,
  });

  if (isPending)
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );
  if (!me)
    return (
      <EmptyState
        icon={<Bell size={26} />}
        title="Entre para ver seus avisos"
        text="Quando alguém responder à sua missão ou confirmar a sua pista, o aviso aparece aqui."
        action={
          <Link to="/entrar?next=/notificacoes">
            <Button variant="primary">Entrar</Button>
          </Link>
        }
      />
    );

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unread ?? 0;

  async function markAll() {
    setBusy(true);
    try {
      await api.markRead();
      await qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    } catch (e) {
      toast.push({ text: (e as Error).message, tone: 'erro' });
    } finally {
      setBusy(false);
    }
  }

  function open(n: AppNotification) {
    // Marcar como lido não pode segurar a navegação; se falhar, o aviso só continua destacado.
    if (!n.readAt)
      api
        .markRead([n.id])
        .catch(() => undefined)
        .finally(() => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }));
    const url = safeAppUrl(n.url);
    // safeAppUrl troca endereços de fora do app pela própria lista; aí não há para onde ir.
    if (url !== '/notificacoes') nav(url);
  }

  return (
    <div className="pb-32 px-4">
      <Headline
        eyebrow="Avisos"
        title="Notificações"
        className="mt-3"
        right={
          unread > 0 ? (
            <Button variant="ghost" size="sm" loading={busy} onClick={markAll}>
              <CheckCheck size={16} aria-hidden="true" />
              Marcar todas como lidas
            </Button>
          ) : undefined
        }
      />
      {list.isPending ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : list.isError ? (
        <EmptyState art="offline" title="Não deu para carregar os avisos" text="Tente de novo em instantes." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={26} />}
          title="Nenhum aviso por enquanto"
          text="Quando alguém responder à sua missão ou confirmar a sua pista, você fica sabendo por aqui."
        />
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={`w-full text-left rounded-card border px-4 py-3 flex items-start gap-3 ${n.readAt ? 'bg-surface border-line' : 'bg-lima-100 border-lima-400 dark:bg-floresta-600'}`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-brasa-500'}`}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold">{n.title}</span>
                  <span className="block text-sm text-ink-2">{n.body}</span>
                  <span className="block text-xs text-ink-2 mt-1">
                    {timeAgo(n.createdAt)}
                    {!n.readAt && (
                      <>
                        {' · '}
                        <span>não lida</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <Button
          variant="ghost"
          className="w-full mt-4"
          loading={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          Ver avisos anteriores
        </Button>
      )}
    </div>
  );
}
