/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// Inyectado por VitePWA/Workbox en build
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.skipWaiting();

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Aviso a pestañas abiertas: el shell puede quedar con refs a chunks viejos.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'vertial:sw-activated' });
      }
    })(),
  );
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

// Búsqueda CRM/TPV: nunca servir vacío/viejo desde SW (rompe «nuevo pedido»).
registerRoute(
  ({ url }) => {
    if (!url.pathname.startsWith('/api/clients/')) return false;
    if (url.pathname.includes('search-by-phone')) return true;
    return url.searchParams.has('search') || url.searchParams.get('refresh') === '1';
  },
  new NetworkOnly(),
);

// Fotos adjuntas: nunca cachear (binario + auth; un 404 cacheado = “sin foto” en silencio).
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') && url.pathname.includes('/foto'),
  new NetworkOnly(),
);

// Integraciones Uber/delivery: nunca cachear (si no, Desconectar parece no funcionar).
registerRoute(
  ({ url }) => {
    if (!url.pathname.startsWith('/api/')) return false;
    return (
      url.pathname.startsWith('/api/uber-eats')
      || url.pathname.startsWith('/api/web/integrations')
      || url.pathname.startsWith('/api/delivery-webhooks')
    );
  },
  new NetworkOnly(),
);

// Verticales CRUD (inmobiliaria, etc.): nunca cachear — un 304/vacío rompe el sidebar.
registerRoute(
  ({ url }) => {
    if (!url.pathname.startsWith('/api/')) return false;
    return (
      url.pathname.startsWith('/api/realestate')
      || url.pathname.startsWith('/api/lawyer')
      || url.pathname.startsWith('/api/academy')
      || url.pathname.startsWith('/api/hotel')
      || url.pathname.startsWith('/api/gym')
      || url.pathname.startsWith('/api/clinic')
      || url.pathname.startsWith('/api/events')
      || url.pathname.startsWith('/api/nightclub')
      || url.pathname.startsWith('/api/pharmacy')
      || url.pathname.startsWith('/api/vet')
    );
  },
  new NetworkOnly(),
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
  const data = (payload.data || {}) as Record<string, unknown>;
  const notifId = typeof data.notificationId === 'string' ? data.notificationId : '';
  const options: NotificationOptions = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: notifId ? `vertial-${notifId}` : 'vertial-notification',
    renotify: false,
    data,
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
            // Preferir postMessage + soft navigate; fallback navigate
            try {
              client.postMessage({ type: 'vertial:push-navigate', route });
            } catch {
              /* ignore */
            }
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
