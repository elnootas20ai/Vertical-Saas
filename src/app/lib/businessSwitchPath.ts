import { isRestaurantBusinessType, isStrictDeliveryBusinessType } from './deliveryOpsTypes';
import {
  resolveRetailCajaPath,
  resolveRetailCeoTpvPath,
  resolveRetailOpsHomePath,
} from './retailOpsPaths';

/**
 * Al cambiar de empresa, si la ruta es del otro vertical retail, ir a la home correcta.
 * Delivery ↔ Bar/restaurante no se mezclan.
 */
export function resolvePathAfterBusinessSwitch(
  pathname: string,
  nextBusinessType?: string | null,
): string | null {
  const path = String(pathname || '');
  const nextIsRestaurant = isRestaurantBusinessType(nextBusinessType);
  const nextIsDelivery = isStrictDeliveryBusinessType(nextBusinessType);

  const onRestaurantOps =
    path.startsWith('/saas/restaurant-ops')
    || path.startsWith('/saas/caja')
    || path.startsWith('/saas/sala')
    || path.startsWith('/saas/cocina')
    || path.startsWith('/saas/lista-espera')
    || path.startsWith('/saas/vertical/restaurant');

  const onDeliveryOps =
    path.startsWith('/saas/delivery-ops')
    || path.startsWith('/saas/vertical/delivery/');

  if (onRestaurantOps && !nextIsRestaurant) {
    if (path.includes('/tpv')) return resolveRetailCeoTpvPath(nextBusinessType);
    if (path.startsWith('/saas/caja')) return resolveRetailCajaPath(nextBusinessType);
    return nextIsDelivery ? resolveRetailOpsHomePath(nextBusinessType) : '/saas';
  }

  if (onDeliveryOps && !nextIsDelivery) {
    if (nextIsRestaurant) {
      if (path.includes('/tpv')) return resolveRetailCeoTpvPath(nextBusinessType);
      if (path.includes('/caja')) return resolveRetailCajaPath(nextBusinessType);
      return resolveRetailOpsHomePath(nextBusinessType);
    }
    return '/saas';
  }

  return null;
}
