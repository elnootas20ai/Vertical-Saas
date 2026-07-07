import { Capacitor } from '@capacitor/core';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function nativeApiOrigin(): string {
  const configured = (env.VITE_NATIVE_API_ORIGIN ?? 'https://vertialapp.com').trim();
  return trimTrailingSlash(configured || 'https://vertialapp.com');
}

/**
 * Prefijo para montar URLs tipo `${getApiBase()}/api/...`.
 * - Web en vertialapp.com: same-origin `/api` (VITE_API_URL vacío o `/api`).
 * - App nativa Capacitor: origen absoluto (p. ej. https://vertialapp.com) — el WebView no comparte origen con el API.
 * - URL absoluta en VITE_API_URL: se respeta en todos los entornos.
 */
export function getApiBase(): string {
  const raw = (env.VITE_API_URL ?? '').trim();

  if (!raw || raw === '/api') {
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      return nativeApiOrigin();
    }
    return '';
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const u = new URL(raw.replace(/\/+$/, ''));
      const pathname = u.pathname.replace(/\/+$/, '');
      if (!pathname || pathname === '/') {
        return trimTrailingSlash(u.origin);
      }
      return trimTrailingSlash(`${u.origin}${u.pathname}`);
    } catch {
      return trimTrailingSlash(raw);
    }
  }

  return trimTrailingSlash(raw.startsWith('/') ? raw : `/${raw}`);
}
