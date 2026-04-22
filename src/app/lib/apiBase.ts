const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getApiBase(): string {
  if (env.VITE_API_URL) return trimTrailingSlash(env.VITE_API_URL);
  const protocol = env.VITE_API_PROTOCOL || 'https';
  const host = env.VITE_API_HOST || 'api.udaredge.com';
  const port = env.VITE_API_PORT || '';
  const base = port ? `${protocol}://${host}:${port}` : `${protocol}://${host}`;
  return trimTrailingSlash(base);
}

