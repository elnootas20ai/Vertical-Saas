/**
 * Deep link desde push nativo / web: abrir la app en la ruta de la alerta.
 * Una sola navegación suave (sin reload) cuando React Router ya está listo.
 */

const STORAGE_KEY = 'vertial.pendingPushRoute';
const EVENT = 'vertial:push-navigate';

function normalizeRoute(raw: unknown): string | null {
  const route = String(raw || '').trim();
  if (!route.startsWith('/')) return null;
  // Evitar open redirects absolutos
  if (route.startsWith('//')) return null;
  return route;
}

/** Guarda ruta y avisa a la app (tap en notificación). */
export function queuePushDeepLink(route: unknown): void {
  const path = normalizeRoute(route);
  if (!path || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    /* private mode */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { route: path } }));
  } catch {
    /* ignore */
  }
}

export function consumePendingPushDeepLink(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const path = sessionStorage.getItem(STORAGE_KEY);
    if (!path) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return normalizeRoute(path);
  } catch {
    return null;
  }
}

export const PUSH_DEEP_LINK_EVENT = EVENT;
