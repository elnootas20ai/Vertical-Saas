const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getApiBase(): string {
  if (env.VITE_API_URL) return trimTrailingSlash(env.VITE_API_URL);

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

