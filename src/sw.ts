/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// Inyectado por VitePWA/Workbox en build
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.skipWaiting();

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Caché de fuentes Google ────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      // En producción, cachear 1 año suele causar "veo lo antiguo" tras despliegues
      // (especialmente si el navegador queda enganchado a una variante antigua).
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  }),
);

// ─── NetworkFirst para API ───────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      // Mantener poco tiempo para evitar respuestas "antiguas" tras releases.
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 1 }),
    ],
  }),
);

// ─── RT-02: Web Push handler ─────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: {
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    data?: Record<string, unknown>;
  };

  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Vertial', body: event.data.text() };
  }

  const title = payload.title || 'Vertial';
  const options: NotificationOptions = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: 'udar-notification',
    renotify: true,
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const route: string = (event.notification.data as Record<string, string>)?.route || '/saas/dashboard';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            void client.navigate(route);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(route);
        }
      })
      .catch(() => { /* silent – avoid errors on invalid routes */ }),
  );
});
