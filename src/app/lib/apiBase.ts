const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getApiBase(): string {
  // Runtime safety: force canonical API host in production frontend.
  return 'https://api.udaredge.com';
}

