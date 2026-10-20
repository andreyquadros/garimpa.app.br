// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUSH_PROMPT_KEY, PushPrompt } from './PushPrompt';

describe('PushPrompt', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('inativo: oferece ativar os avisos', async () => {
    const onEnable = vi.fn();
    render(<PushPrompt status="inativo" onEnable={onEnable} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ativar avisos' }));
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it('instalar-no-iphone: explica como instalar, sem botão de ativar', () => {
    render(<PushPrompt status="instalar-no-iphone" onEnable={vi.fn()} />);
    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ativar avisos' })).toBeNull();
  });

  it('"Agora não" grava o momento e o cartão some', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    render(<PushPrompt status="inativo" onEnable={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(localStorage.getItem(PUSH_PROMPT_KEY)).toBe('1800000000000');
    expect(screen.queryByRole('button', { name: 'Ativar avisos' })).toBeNull();
    vi.restoreAllMocks();
  });

  it('dispensado há menos de 30 dias: não aparece', () => {
    localStorage.setItem(PUSH_PROMPT_KEY, String(Date.now() - 24 * 60 * 60 * 1000));
    const { container } = render(<PushPrompt status="inativo" onEnable={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it.each(['negado', 'indisponivel', 'ativo'] as const)('%s: não renderiza', (status) => {
    const { container } = render(<PushPrompt status={status} onEnable={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
