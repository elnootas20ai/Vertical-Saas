import { toast } from 'sonner';
import { getApiBase } from './apiBase';
import { authFetch } from './authApi';

const API_BASE = getApiBase();

const FRIENDLY: Array<{ test: RegExp; message: string }> = [
  { test: /failed to fetch|networkerror|load failed|no se pudo conectar|network/i, message: 'Sin conexión con el servidor. Comprueba la red o que el PC de caja esté encendido.' },
  { test: /sesión expirada|session expired|401|unauthorized|token/i, message: 'Tu sesión ha caducado. Cierra y vuelve a entrar.' },
  { test: /abre la caja|caja.*abierta|register.*open/i, message: 'Abre la caja de la tienda antes de cobrar.' },
  { test: /mesa.*cuenta|cuenta abierta|already has/i, message: 'Esa mesa ya tiene una cuenta abierta.' },
  { test: /no está libre|not available|unavailable/i, message: 'Esa mesa no está disponible ahora.' },
  { test: /409|conflict|_rev/i, message: 'Otra acción se guardó antes. Espera un segundo y vuelve a intentarlo.' },
  { test: /timeout|timed out|tard/i, message: 'El servidor tardó demasiado. Reintenta en unos segundos.' },
];

function looksTechnical(raw: string): boolean {
  if (!raw) return false;
  return (
    raw.length > 160
    || /\/api\//i.test(raw)
    || /TypeError|ReferenceError|SyntaxError/i.test(raw)
    || /\bat\s+\w+/i.test(raw)
    || /\[object Object\]/i.test(raw)
    || /^Error:\s*Failed/i.test(raw)
    || /\bnpm\s+run\b/i.test(raw)
    || /\bnode_modules\b/i.test(raw)
    || /\.tsx?\b|\.jsx?\b/i.test(raw)
    || /\bstack\s*trace\b/i.test(raw)
  );
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message || '');
  }
  return String(err ?? '');
}

export function extractErrorStack(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  return extractErrorMessage(err);
}

/** Mensaje corto para el camarero; el detalle técnico va al registro. */
export function toUserFacingMessage(err: unknown, fallback = 'No se pudo completar la acción'): string {
  const raw = extractErrorMessage(err).trim();
  if (!raw) return fallback;
  for (const { test, message } of FRIENDLY) {
    if (test.test(raw)) return message;
  }
  if (looksTechnical(raw)) return fallback;
  return raw.length <= 100 ? raw : fallback;
}

export type ClientErrorReport = {
  err: unknown;
  context: string;
  page?: string;
  businessId?: string;
  businessName?: string;
};

const recentKeys = new Set<string>();

export function reportClientError(payload: ClientErrorReport): void {
  const technical = extractErrorStack(payload.err);
  const userMessage = toUserFacingMessage(payload.err);
  const dedupeKey = `${payload.context}|${userMessage}|${technical.slice(0, 80)}`;
  if (recentKeys.has(dedupeKey)) return;
  recentKeys.add(dedupeKey);
  window.setTimeout(() => recentKeys.delete(dedupeKey), 8000);

  if (import.meta.env.DEV) {
    console.warn('[Vertial TPV]', payload.context, technical);
  }

  void authFetch(`${API_BASE}/api/support/client-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      technical,
      context: payload.context,
      page: payload.page || (typeof window !== 'undefined' ? window.location.pathname : ''),
      businessId: payload.businessId || '',
      businessName: payload.businessName || '',
    }),
  }).catch(() => {
    /* registro best-effort */
  });
}

/** Toast amigable + registro técnico en servidor (visible en Caja → Incidencias). */
export function toastActionError(
  err: unknown,
  context: string,
  fallback?: string,
  meta?: Omit<ClientErrorReport, 'err' | 'context'>,
): void {
  reportClientError({ err, context, ...meta });
  toast.error(toUserFacingMessage(err, fallback || 'No se pudo completar la acción'));
}

export type ClientErrorRow = {
  id: string;
  at: string;
  context: string;
  message: string;
  technical?: string;
  page?: string;
  businessName?: string;
  userName?: string;
  userEmail?: string;
};

export async function listClientErrorsRequest(limit = 30): Promise<ClientErrorRow[]> {
  const response = await authFetch(`${API_BASE}/api/support/client-errors?limit=${limit}`);
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; errors?: ClientErrorRow[] };
  if (!response.ok || !data.ok) return [];
  return data.errors || [];
}
