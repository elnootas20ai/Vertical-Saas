import { Capacitor } from '@capacitor/core';

const NATIVE_BOOTSTRAP_TIMEOUT_MS = 2_500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      globalThis.setTimeout(resolve, timeoutMs);
    }),
  ]);
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
 * Registra el service worker de la PWA solo en web: en la app nativa el bundle
 * ya viene dentro del binario y un SW cachearía una versión antigua.
 */
export function registerPwaServiceWorker(): void {
  if (Capacitor.isNativePlatform()) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* la PWA es opcional; la web funciona igual sin SW */
    });
  });
}
