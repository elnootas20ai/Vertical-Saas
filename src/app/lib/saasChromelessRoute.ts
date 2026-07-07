import { isTpvTabletSaasSession } from './tpvTabletSession';

const CHROMELESS_EXACT = new Set([
  '/saas/clock-kiosk',
  '/saas/user-dashboard',
]);

const CHROMELESS_PREFIXES = [
  '/saas/vertical/delivery/tpv',
  '/saas/vertical/delivery/caja',
  '/saas/caja',
  '/saas/tpv/punto/',
  /** TPV operativo tras código de tienda (no es la caja del CEO en /saas/caja). */
  '/saas/worker/tpv',
];

/** Rutas a pantalla completa sin sidebar/topbar estándar. */
export function isChromelessSaasRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  if (isTpvTabletSaasSession(path)) return true;
  if (CHROMELESS_EXACT.has(path)) return true;
  return CHROMELESS_PREFIXES.some((prefix) => path.startsWith(prefix));
}
