import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Lê a marca `offerPush` que a tela de nova missão deixa no histórico e a apaga na hora: o convite aparece uma vez
 * nesta página, e recarregar ou reabrir o app (que restaura a mesma entrada do histórico) não o mostra de novo.
 */
export function useOfferPushFlag(): boolean {
  const location = useLocation();
  const nav = useNavigate();
  const [offeredAt, setOfferedAt] = useState<string | null>(null);
  const flagged = (location.state as { offerPush?: boolean } | null)?.offerPush === true;

  useEffect(() => {
    if (!flagged) return;
    setOfferedAt(location.pathname);
    nav(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [flagged, location.pathname, location.search, location.hash, nav]);

  return flagged || offeredAt === location.pathname;
}
