import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { router } from './App';
import { ThemeProvider, ToastProvider } from './lib/hooks';
import { DEMO } from './lib/api';

// Na demonstração não há service worker: nada para colocar em cache além da própria página.
if (!DEMO) registerSW({ immediate: true });

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
