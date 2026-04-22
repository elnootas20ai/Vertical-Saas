const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getApiBase(): string {
  const base = env.VITE_API_URL || 'https://api.udaredge.com';
  return trimTrailingSlash(base);
}

