import { Capacitor } from '@capacitor/core';

/**
 * En Capacitor el bundle va dentro del IPA/APK, pero el service worker PWA puede
 * seguir sirviendo JS/CSS de una instalación anterior tras actualizar TestFlight.
 */
export async function prepareNativeWebView(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
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
