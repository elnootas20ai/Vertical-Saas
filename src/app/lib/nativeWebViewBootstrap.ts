import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const NATIVE_BOOTSTRAP_TIMEOUT_MS = 2_500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      globalThis.setTimeout(resolve, timeoutMs);
    }),
  ]);
}

/** Marca el documento y evita que la status bar nativa tape el header del SaaS. */
export async function configureNativeSafeArea(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add('native-app');
  if (Capacitor.getPlatform() === 'ios') {
    document.documentElement.classList.add('native-ios');
  }

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Default });
  } catch {
    // Plugin opcional en algunos entornos de build.
  }
}

/**
 * En Capacitor el bundle va dentro del IPA/APK, pero el service worker PWA puede
 * seguir sirviendo JS/CSS de una instalación anterior tras actualizar TestFlight.
 * Nunca debe bloquear el arranque: en iOS getRegistrations() a veces no responde.
 */
export async function prepareNativeWebView(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const cleanup = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  };

  try {
    await withTimeout(cleanup(), NATIVE_BOOTSTRAP_TIMEOUT_MS);
  } catch {
    // Algunos WebViews bloquean cache/SW; el bundle empaquetado sigue cargando.
  }
}

/**
 * En desarrollo el SW de la PWA puede dejar el HTML inicial («Cargando Vertial…»)
 * sin cargar el JS nuevo tras cambios en Vite. Nunca bloquea el arranque.
 */
export async function clearStaleWebCachesInDev(): Promise<void> {
  if (!import.meta.env.DEV) return;

  const cleanup = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  };

  try {
    await withTimeout(cleanup(), NATIVE_BOOTSTRAP_TIMEOUT_MS);
  } catch {
    /* ignore */
  }
}

const CHUNK_RELOAD_KEY = 'vertial:chunk-reload';

function isStaleChunkError(message: string): boolean {
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

/** Un reload si un chunk hasheado ya no existe tras un deploy (evita pantalla blanca). */
function armStaleChunkReload(): void {
  if (typeof window === 'undefined') return;

  const reloadOnce = (reason: string) => {
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    } catch {
      /* private mode */
    }
    console.warn('[Vertial] chunk/SW desfasado → reload', reason);
    window.location.reload();
  };

  window.addEventListener('error', (event) => {
    const msg = [
      event.message,
      event.filename,
      (event.error && (event.error as Error).message) || '',
    ].join(' ');
    if (isStaleChunkError(msg)) reloadOnce(msg);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? `${reason.name} ${reason.message}`
        : String(reason || '');
    if (isStaleChunkError(msg)) reloadOnce(msg);
  });
}

/**
 * Registra el service worker de la PWA solo en web producción: en la app nativa el bundle
 * ya viene dentro del binario y un SW cachearía una versión antigua.
 */
export function registerPwaServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (Capacitor.isNativePlatform()) return;
  if (!('serviceWorker' in navigator)) return;

  armStaleChunkReload();

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Buscar SW nuevo tras deploy (no esperar 24h).
        void registration.update();
      })
      .catch(() => {
        /* la PWA es opcional; la web funciona igual sin SW */
      });
  });

  // Nuevo SW (update) con skipWaiting + clients.claim → controllerchange.
  // Tras un F5/deploy el claim suele llegar a los 1–5 s: un reload ahí se siente
  // como «doble recarga». Si la página acaba de cargar, el HTML/JS ya vienen de red
  // (index no se precachea); solo marcamos el stamp y no recargamos.
  // Si el SW cambia con la pestaña ya abierta un rato, sí recargamos una vez por build.
  const SW_RELOAD_STAMP_KEY = 'vertial:sw-reloaded-for-stamp';
  const SW_RELOAD_GRACE_MS = 12_000;
  const pageLoadedAt = Date.now();
  const bundleStamp = () =>
    String(import.meta.env.VITE_BUILD_STAMP || import.meta.env.VITE_APP_VERSION || '0');

  let refreshing = false;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (refreshing) return;
    const stamp = bundleStamp();
    try {
      if (localStorage.getItem(SW_RELOAD_STAMP_KEY) === stamp) return;
      localStorage.setItem(SW_RELOAD_STAMP_KEY, stamp);
    } catch {
      /* private mode: mejor no recargar en bucle */
      return;
    }
    if (Date.now() - pageLoadedAt < SW_RELOAD_GRACE_MS) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });
}

