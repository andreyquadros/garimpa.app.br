// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useOfferPushFlag } from './use-offer-push';

let goTo: (to: string) => void = () => undefined;
function Probe() {
  const offer = useOfferPushFlag();
  const location = useLocation();
  const nav = useNavigate();
  goTo = (to) => nav(to);
  return (
    <>
      <p>{offer ? 'com convite' : 'sem convite'}</p>
      <p data-testid="state">{JSON.stringify(location.state)}</p>
    </>
  );
}

describe('useOfferPushFlag', () => {
  afterEach(cleanup);

  it('mostra o convite e apaga a marca do histórico na hora', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/m/1', state: { offerPush: true } }]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(await screen.findByText('com convite')).toBeTruthy();
    expect(screen.getByTestId('state').textContent).toBe('null');
  });

  it('some ao sair da página', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/m/1', state: { offerPush: true } }]}>
        <Probe />
      </MemoryRouter>,
    );
    await screen.findByText('com convite');
    act(() => goTo('/missoes'));
    expect(await screen.findByText('sem convite')).toBeTruthy();
  });

  it('recarregar a mesma entrada (já sem a marca) não mostra de novo', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/m/1', state: null }]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByText('sem convite')).toBeTruthy();
  });
});
