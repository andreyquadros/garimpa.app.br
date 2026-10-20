/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { type PushPayload, safeAppUrl, toNotificationOptions } from './lib/notification-payload';

declare let self: ServiceWorkerGlobalScope;

// Equivale ao registerType 'autoUpdate': a versão nova assume sem esperar as abas fecharem.
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/u\//] }));

const DAY = 60 * 60 * 24;
registerRoute(
  /\/u\/.*\.jpg$/,
  new CacheFirst({
    cacheName: 'provas',
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * DAY })],
  }),
);
registerRoute(
  /\/tiles\/.*\.png$/,
  new CacheFirst({
    cacheName: 'tiles',
    plugins: [new ExpirationPlugin({ maxEntries: 1500, maxAgeSeconds: 60 * DAY })],
  }),
);
registerRoute(
  /\/api\/(config|map\/finds|questions)(\?.*)?$/,
  new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 4 }),
);

self.addEventListener('push', (event) => {
  let payload: PushPayload;
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    return;
  }
  if (!payload) return;
  const { title, options } = toNotificationOptions(payload);
  // Todo push precisa mostrar um aviso (userVisibleOnly); as abas abertas só são avisadas para atualizar o sino.
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: 'notificacao' });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeAppUrl((event.notification.data as { url?: unknown } | null)?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        await existing.navigate(url);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
