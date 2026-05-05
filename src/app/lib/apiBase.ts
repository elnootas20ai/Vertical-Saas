const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getApiBase(): string {
  if (env.VITE_API_URL) return trimTrailingSlash(env.VITE_API_URL);

  // En producción, lo más robusto es usar same-origin (sin CORS) y llamar a `/api/*`.
  // Esto evita "failed to fetch" por DNS/SSL/mixed-content cuando el frontend y backend
  // están detrás del mismo dominio (reverse proxy).
  if (typeof window !== 'undefined') return '';

  const browserHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return trimTrailingSlash(`${protocol}://${host}:${port}`);
}

