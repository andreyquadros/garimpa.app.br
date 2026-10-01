import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: Record<string, unknown>) => void; renderButton: (el: HTMLElement, o: Record<string, unknown>) => void; prompt: () => void } } };
  }
}

let loading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Não deu para carregar o login do Google.'));
    document.head.appendChild(s);
  });
  return loading;
}

export function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadGis().then(() => {
      if (!alive || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => onCredential(r.credential), ux_mode: 'popup', itp_support: true });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'pt-BR', width: 320, logo_alignment: 'left' });
    }).catch((e: Error) => setError(e.message));
    return () => { alive = false; };
  }, [clientId, onCredential]);
  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} className="min-h-11" />
      {error && <p className="text-sm text-barro-ink">{error}</p>}
    </div>
  );
}
