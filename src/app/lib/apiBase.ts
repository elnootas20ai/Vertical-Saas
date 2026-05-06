const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Prefijo para montar URLs tipo `${getApiBase()}/api/...`.
 * - `VITE_API_URL` vacío o `/api`: mismo origen (Nginx / proxy Vite → sin puerto en producción).
 * - URL absoluta `http(s)://...`: API en otro host (dev contra backend directo u otro dominio).
 */
export function getApiBase(): string {
  const raw = (env.VITE_API_URL ?? '').trim();

  if (!raw || raw === '/api') {
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
