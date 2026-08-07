/**
 * Navegación «Atrás» del shell SaaS (Topbar).
 * Pestañas raíz del bottom nav: sin botón.
 * Delivery anidado: siempre vuelve a Centro Operativo.
 * Resto: history o padre conocido.
 */

/** Destinos raíz (móvil) — no llevan Atrás. */
const ROOT_EXACT = new Set([
  '/saas',
  '/saas/',
  '/saas/dashboard',
  '/saas/delivery-ops',
  '/saas/restaurant-ops',
  '/saas/alerts',
  '/saas/clients',
  '/saas/crm/clientes',
  '/saas/sala',
  '/saas/cocina',
  '/saas/worker/tasks',
  '/saas/worker/clock',
  '/saas/worker/notifications',
]);

/** Chromeless / TPV-caja: no usan Topbar. */
const ROOT_PREFIXES = [
  '/saas/vertical/delivery/caja',
  '/saas/vertical/delivery/tpv',
  '/saas/vertical/delivery/pedidos',
  '/saas/vertical/heladeria/tpv',
  '/saas/caja/tpv',
  '/saas/worker/tpv',
];

export const DELIVERY_OPS_PATH = '/saas/delivery-ops';

function normalizePath(pathname: string): string {
  const p = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  return p;
}

/** Pantallas Delivery con Layout (cocina, montaje, reparto, catálogo…). */
export function isDeliveryNestedPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (p === DELIVERY_OPS_PATH) return false;
  if (ROOT_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) return false;
  if (p.startsWith('/saas/delivery-')) return true;
  if (p.startsWith('/saas/vertical/delivery/')) return true;
  return false;
}

/** ¿Es pestaña / hub raíz? (sin Atrás en chrome). */
export function isSaasRootNavPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (ROOT_EXACT.has(p)) return true;
  return ROOT_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** Padre seguro si no hay historial. */
export function resolveSaasBackFallback(pathname: string): string {
  const p = normalizePath(pathname);

  if (isDeliveryNestedPath(p)) return DELIVERY_OPS_PATH;

  if (p.startsWith('/saas/crm/') || p.startsWith('/saas/clients/')) return '/saas/clients';
  if (p.startsWith('/saas/alerts/')) return '/saas/alerts';
  if (p.startsWith('/saas/settings/')) return '/saas/settings';
  if (p === '/saas/settings') return '/saas/dashboard';

  if (p.startsWith('/saas/team/') || p.startsWith('/saas/equipo/')) return '/saas/team';
  if (p === '/saas/team' || p === '/saas/equipo') return '/saas/dashboard';

  if (p.startsWith('/saas/documents/') || p.startsWith('/saas/documentos/')) return '/saas/documents';
  if (p === '/saas/documents' || p === '/saas/documentos') return '/saas/dashboard';

  if (p.startsWith('/saas/clockins') || p.startsWith('/saas/fichajes')) return '/saas/dashboard';
  if (p.startsWith('/saas/income-expenses') || p.startsWith('/saas/finance')) return '/saas/dashboard';
  if (p.startsWith('/saas/sales-metrics')) return '/saas/dashboard';
  if (p.startsWith('/saas/worker/')) return '/saas/worker/tasks';

  return '/saas/dashboard';
}

export function shouldShowSaasBack(pathname: string, backTo?: string | false | null): boolean {
  if (backTo === false) return false;
  if (typeof backTo === 'string' && backTo.trim()) return true;
  if (isDeliveryNestedPath(pathname)) return true;
  return !isSaasRootNavPath(pathname);
}

/**
 * Destino de Atrás.
 * Delivery anidado → siempre Operativa (no history a ciegas).
 */
export function resolveSaasBackTarget(
  pathname: string,
  backTo?: string | false | null,
): string | 'history' | null {
  if (backTo === false) return null;
  if (typeof backTo === 'string' && backTo.trim()) return backTo.trim();
  if (isDeliveryNestedPath(pathname)) return DELIVERY_OPS_PATH;
  if (isSaasRootNavPath(pathname)) return null;
  return 'history';
}
