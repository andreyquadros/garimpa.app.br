// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ToastProvider } from '@/lib/hooks';
import type { AppNotification } from '@/lib/types';
import { Notificacoes } from './Notificacoes';

vi.mock('@/lib/api', () => ({
  api: { notifications: vi.fn(), markRead: vi.fn(), me: vi.fn() },
  ApiError: class ApiError extends Error {},
  DEMO: false,
}));

const notifications = vi.mocked(api.notifications);
const markRead = vi.mocked(api.markRead);

const item = (o: Partial<AppNotification>): AppNotification => ({
  id: '00000000-0000-0000-0000-000000000001',
  kind: 'nova_evidencia',
  title: 'Nova pista para Garrafa térmica',
  body: 'Loja do Centro',
  url: '/m/abc',
  createdAt: new Date().toISOString(),
  readAt: null,
  ...o,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/notificacoes']}>
          <Routes>
            <Route path="/notificacoes" element={<Notificacoes />} />
            <Route path="/m/:id" element={<p>Página da missão</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Notificacoes', () => {
  beforeEach(() => {
    notifications.mockReset();
    markRead.mockReset();
    markRead.mockResolvedValue({ unread: 0 });
    vi.mocked(api.me).mockResolvedValue({ user: { id: 'u1' } } as never);
  });
  afterEach(cleanup);

  it('lista os avisos e marca as não lidas', async () => {
    notifications.mockResolvedValue({
      items: [
        item({ id: '00000000-0000-0000-0000-000000000001', title: 'Nova pista para Garrafa' }),
        item({
          id: '00000000-0000-0000-0000-000000000002',
          title: 'Pepitas liberadas',
          readAt: new Date().toISOString(),
        }),
      ],
      unread: 1,
      nextBefore: null,
    });
    renderPage();
    expect(await screen.findByText('Nova pista para Garrafa')).toBeTruthy();
    expect(screen.getByText('Pepitas liberadas')).toBeTruthy();
    expect(screen.getAllByText('não lida')).toHaveLength(1);
  });

  it('"Marcar todas como lidas" chama markRead sem ids', async () => {
    notifications.mockResolvedValue({ items: [item({})], unread: 1, nextBefore: null });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }));
    expect(markRead).toHaveBeenCalledWith();
  });

  it('clicar num aviso marca só ele como lido e abre o endereço', async () => {
    notifications.mockResolvedValue({
      items: [item({ id: '00000000-0000-0000-0000-00000000000a', title: 'Nova pista', url: '/m/xyz' })],
      unread: 1,
      nextBefore: null,
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Nova pista/ }));
    expect(markRead).toHaveBeenCalledWith(['00000000-0000-0000-0000-00000000000a']);
    expect(await screen.findByText('Página da missão')).toBeTruthy();
  });

  it('endereço de fora do app não é seguido', async () => {
    notifications.mockResolvedValue({
      items: [item({ title: 'Aviso estranho', url: 'https://golpe.example/x' })],
      unread: 1,
      nextBefore: null,
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Aviso estranho/ }));
    expect(screen.queryByText('Página da missão')).toBeNull();
    expect(screen.getByText('Aviso estranho')).toBeTruthy();
  });

  it('título com HTML aparece como texto literal', async () => {
    notifications.mockResolvedValue({ items: [item({ title: '<b>x</b>' })], unread: 1, nextBefore: null });
    const { container } = renderPage();
    expect(await screen.findByText('<b>x</b>')).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
  });

  it('carrega a página seguinte pelo cursor opaco', async () => {
    notifications.mockImplementation(async (before?: string) =>
      before === 'cursor-1'
        ? {
            items: [item({ id: '00000000-0000-0000-0000-000000000009', title: 'Aviso antigo' })],
            unread: 1,
            nextBefore: null,
          }
        : { items: [item({ title: 'Aviso novo' })], unread: 1, nextBefore: 'cursor-1' },
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Ver avisos anteriores' }));
    expect(await screen.findByText('Aviso antigo')).toBeTruthy();
    expect(notifications).toHaveBeenLastCalledWith('cursor-1');
  });

  it('sem avisos mostra o estado vazio', async () => {
    notifications.mockResolvedValue({ items: [], unread: 0, nextBefore: null });
    renderPage();
    expect(await screen.findByText('Nenhum aviso por enquanto')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).toBeNull();
  });
});
