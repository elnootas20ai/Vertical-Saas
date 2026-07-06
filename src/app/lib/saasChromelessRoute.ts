const CHROMELESS_EXACT = new Set([
  '/saas/clock-kiosk',
  '/saas/user-dashboard',
]);

const CHROMELESS_PREFIXES = [
  '/saas/vertical/delivery/tpv',
  '/saas/vertical/delivery/caja',
  '/saas/caja',
  '/saas/tpv/punto/',
];

/** Rutas a pantalla completa sin sidebar/topbar estándar. */
export function isChromelessSaasRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  if (CHROMELESS_EXACT.has(path)) return true;
  return CHROMELESS_PREFIXES.some((prefix) => path.startsWith(prefix));
}
