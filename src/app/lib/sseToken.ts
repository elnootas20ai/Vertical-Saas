import { getApiBase } from './apiBase';
import { authFetch, getAuthHeaders } from './authApi';

let cachedToken: string | null = null;
let cachedUntil = 0;

/** Token para EventSource (query param). Usa memoria/localStorage o pide uno con cookie de sesión. */
export async function resolveSseAccessToken(): Promise<string | null> {
  const headers = getAuthHeaders();
  const authHeader = headers.Authorization || headers.authorization;
  const fromStore = authHeader?.replace(/^Bearer\s+/i, '').trim() || null;
  if (fromStore) return fromStore;

  const now = Date.now();
  if (cachedToken && cachedUntil > now + 30_000) {
    return cachedToken;
  }

  try {
    const res = await authFetch(`${getApiBase()}/api/sse/token`);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string };
    if (res.ok && data.ok && data.token) {
      cachedToken = data.token;
      cachedUntil = now + 14 * 60 * 1000;
      return data.token;
    }
  } catch {
    /* sin red o sin sesión */
  }
  return null;
}

export function clearSseTokenCache() {
  cachedToken = null;
  cachedUntil = 0;
}
