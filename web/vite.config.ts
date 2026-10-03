import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// VITE_DEMO=1: build estático com a API falsa no navegador (GitHub Pages). VITE_BASE=./ deixa os caminhos relativos.
const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  // Literal em tempo de build: no modo normal o código da demonstração some do bundle.
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? '1' : '') },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: demo,
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'favicon.svg'],
      manifest: {
        name: 'Pepita Social',
        short_name: 'Pepita',
        description: 'Encontre produtos perto de você. Ajude pessoas. Receba pepitas.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F6F5EE',
        theme_color: '#103D32',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: undefined,
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/u\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          { urlPattern: /\/u\/.*\.jpg$/, handler: 'CacheFirst', options: { cacheName: 'provas', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } } },
          { urlPattern: /\/tiles\/.*\.png$/, handler: 'CacheFirst', options: { cacheName: 'tiles', expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 60 } } },
          { urlPattern: /\/api\/(config|map\/finds|questions)(\?.*)?$/, handler: 'NetworkFirst', options: { cacheName: 'api', networkTimeoutSeconds: 4 } },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:8787', '/u': 'http://localhost:8787' },
  },
  build: { sourcemap: false, target: 'es2022' },
});
