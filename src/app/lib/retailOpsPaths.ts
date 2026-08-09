import { isIceCreamShopBusinessType, isRestaurantBusinessType } from './deliveryOpsTypes';

/** Centro operativo delivery (pedidos, cocina, reparto). */
export const DELIVERY_OPS_HOME_PATH = '/saas/delivery-ops';

/** Home al abrir empresa bar/restaurante (Centro operativo propio; no Delivery). */
export const RESTAURANT_OPS_HOME_PATH = '/saas/restaurant-ops';

/** Home Heladería. */
export const HELADERIA_OPS_HOME_PATH = '/saas/heladeria-ops';

/** TPV gerente delivery. */
export const DELIVERY_CEO_TPV_PATH = '/saas/vertical/delivery/tpv';

/** TPV gerente bar/restaurante. */
export const RESTAURANT_CEO_TPV_PATH = '/saas/caja/tpv';

/** TPV gerente heladería. */
export const HELADERIA_CEO_TPV_PATH = '/saas/vertical/heladeria/tpv';

/** Caja gerente delivery. */
export const DELIVERY_CAJA_PATH = '/saas/vertical/delivery/caja';

/** Caja gerente bar/restaurante. */
export const RESTAURANT_CAJA_PATH = '/saas/caja';

/** Caja gerente heladería. */
export const HELADERIA_CAJA_PATH = '/saas/vertical/heladeria/caja';

export function resolveRetailOpsHomePath(businessType?: string | null): string {
  if (isRestaurantBusinessType(businessType)) return RESTAURANT_OPS_HOME_PATH;
  if (isIceCreamShopBusinessType(businessType)) return HELADERIA_OPS_HOME_PATH;
  return DELIVERY_OPS_HOME_PATH;
}

export function resolveRetailCeoTpvPath(businessType?: string | null): string {
  if (isRestaurantBusinessType(businessType)) return RESTAURANT_CEO_TPV_PATH;
  if (isIceCreamShopBusinessType(businessType)) return HELADERIA_CEO_TPV_PATH;
  return DELIVERY_CEO_TPV_PATH;
}

export function resolveRetailCajaPath(businessType?: string | null): string {
  if (isRestaurantBusinessType(businessType)) return RESTAURANT_CAJA_PATH;
  if (isIceCreamShopBusinessType(businessType)) return HELADERIA_CAJA_PATH;
  return DELIVERY_CAJA_PATH;
}

/**
 * Salida del botón Volver en la pantalla Caja (timeline).
 * - Desde Centro operativo (`returnToOps`) → ops de la vertical.
 * - Desde sidebar / dashboard / KPI → Panel principal (no forzar ops).
 */
export function resolveCajaPageExitPath(options?: {
  returnToOps?: boolean;
  businessType?: string | null;
}): string {
  if (options?.returnToOps) {
    return resolveRetailOpsHomePath(options.businessType);
  }
  return '/saas/dashboard';
}

/** Salida del TPV CEO según ruta actual y vertical. */
export function resolveTpvCeoExitPath(
  pathname: string,
  businessType?: string | null,
): string {
  // Restaurant: volver al centro operativo, no a la pantalla Caja.
  if (pathname.startsWith('/saas/caja')) return RESTAURANT_OPS_HOME_PATH;
  if (pathname.startsWith('/saas/vertical/delivery')) return DELIVERY_OPS_HOME_PATH;
  if (pathname.startsWith('/saas/vertical/heladeria')) return HELADERIA_OPS_HOME_PATH;
  if (pathname.startsWith('/saas/heladeria-')) return HELADERIA_OPS_HOME_PATH;
  return resolveRetailOpsHomePath(businessType);
}

/** Recarga agresiva de tiendas en pantallas operativas retail y ajustes. */
export function shouldForceRetailStoreReload(pathname: string): boolean {
  return (
    pathname.includes('/delivery-ops')
    || pathname.includes('/restaurant-ops')
    || pathname.includes('/heladeria-ops')
    || pathname.includes('/heladeria-')
    || pathname.startsWith('/saas/vertical/delivery/')
    || pathname.startsWith('/saas/vertical/heladeria/')
    || pathname.startsWith('/saas/caja')
    || pathname.startsWith('/saas/sala')
    || pathname.startsWith('/saas/cocina')
    || pathname.startsWith('/saas/lista-espera')
    || pathname.startsWith('/saas/reservations')
    || pathname.startsWith('/saas/settings')
  );
}

/** Rutas que solo aplican a delivery puro. */
export function isDeliveryOnlyRoute(route: string): boolean {
  const r = String(route || '');
  return (
    r.includes('/delivery-ops')
    || r.includes('/vertical/delivery/')
    || r.includes('/delivery-kitchen')
    || r.includes('/delivery-reparto')
    || r.includes('/delivery-montaje')
  );
}
