// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { NotificationBell } from './NotificationBell';

vi.mock('@/lib/api', () => ({
  api: { notifications: vi.fn() },
  ApiError: class ApiError extends Error {},
  DEMO: false,
}));

const notifications = vi.mocked(api.notifications);

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    notifications.mockReset();
  });
  afterEach(cleanup);

  it('mostra o número de não lidas com rótulo acessível', async () => {
    notifications.mockResolvedValue({ items: [], unread: 3, nextBefore: null });
    renderBell();
    const link = await screen.findByRole('link', { name: 'Notificações, 3 não lidas' });
    expect(link.getAttribute('href')).toBe('/notificacoes');
    expect(link.textContent).toContain('3');
  });

  it('usa o singular com uma não lida', async () => {
    notifications.mockResolvedValue({ items: [], unread: 1, nextBefore: null });
    renderBell();
    expect(await screen.findByRole('link', { name: 'Notificações, 1 não lida' })).toBeTruthy();
  });

  it('esconde o número quando não há não lidas', async () => {
    notifications.mockResolvedValue({ items: [], unread: 0, nextBefore: null });
    renderBell();
    await vi.waitFor(() => expect(notifications).toHaveBeenCalled());
    const link = await screen.findByRole('link', { name: 'Notificações' });
    expect(link.textContent).not.toMatch(/\d/);
  });

  it('sem resposta da API (ex.: demonstração sem a rota) fica só o sininho', async () => {
    notifications.mockRejectedValue(new Error('Rota não encontrada.'));
    const { container } = renderBell();
    await vi.waitFor(() => expect(notifications).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Notificações' })).toBeTruthy();
    expect(container.textContent).toBe('');
  });
});
