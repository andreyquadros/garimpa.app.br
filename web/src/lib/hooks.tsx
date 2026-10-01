import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { AppConfig, Me } from './types';

export function useConfig() {
  return useQuery<AppConfig>({ queryKey: ['config'], queryFn: api.config, staleTime: 10 * 60 * 1000 });
}

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => { try { return await api.me(); } catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; } },
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback((keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })), [qc]);
}

export type Geo = { lat: number; lng: number; accuracy: number };
const GEO_KEY = 'garimpa.geo';
export function useGeo() {
  const [pos, setPos] = useState<Geo | null>(() => { try { const s = sessionStorage.getItem(GEO_KEY); return s ? (JSON.parse(s) as Geo) : null; } catch { return null; } });
  const [state, setState] = useState<'idle' | 'asking' | 'ok' | 'denied' | 'unavailable'>(pos ? 'ok' : 'idle');
  const ask = useCallback(() => {
    if (!('geolocation' in navigator)) { setState('unavailable'); return; }
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => { const g = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }; setPos(g); setState('ok'); try { sessionStorage.setItem(GEO_KEY, JSON.stringify(g)); } catch { /* sem storage */ } },
      () => setState('denied'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, []);
  return { pos, state, ask };
}

/* Avisos curtos no rodapé: recompensas (XP, pepitas) e erros. */
export type Toast = { id: number; text: string; xp?: number; pepitas?: number; tone?: 'ok' | 'erro' | 'info' };
const ToastCtx = createContext<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = seq.current++;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), t.tone === 'erro' ? 5000 : 3600);
  }, [dismiss]);
  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
  return <ToastCtx.Provider value={value}>{children}</ToastCtx.Provider>;
}
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('ToastProvider ausente');
  return ctx;
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => (localStorage.getItem('garimpa.theme') as 'light' | 'dark' | 'auto' | null) ?? 'auto');
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    localStorage.setItem('garimpa.theme', theme);
  }, [theme]);
  return { theme, setTheme };
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useShare() {
  return useCallback(async (title: string, url: string = location.href) => {
    try {
      if (navigator.share) { await navigator.share({ title, url }); return 'shared' as const; }
      await navigator.clipboard.writeText(url);
      return 'copied' as const;
    } catch { return 'cancelled' as const; }
  }, []);
}
