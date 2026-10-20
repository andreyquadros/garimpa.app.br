// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushSetting } from './PushSetting';

describe('PushSetting (Carteira)', () => {
  afterEach(cleanup);

  it('ativo: chave ligada; desligar chama onChange(false)', async () => {
    const onChange = vi.fn();
    render(<PushSetting status="ativo" onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Avisos no celular' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('inativo: chave desligada; ligar chama onChange(true)', async () => {
    const onChange = vi.fn();
    render(<PushSetting status="inativo" onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Avisos no celular' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('negado: explica como liberar nas configurações do navegador', () => {
    render(<PushSetting status="negado" onChange={vi.fn()} />);
    expect(screen.getByText(/configurações do navegador/)).toBeTruthy();
    expect((screen.getByRole('switch', { name: 'Avisos no celular' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('instalar-no-iphone: explica como instalar', () => {
    render(<PushSetting status="instalar-no-iphone" onChange={vi.fn()} />);
    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeTruthy();
  });

  it('ainda lendo o estado: não renderiza', () => {
    const { container } = render(<PushSetting status={null} onChange={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
