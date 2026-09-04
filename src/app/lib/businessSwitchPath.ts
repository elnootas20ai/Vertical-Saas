import {
  isEventsBusinessType,
  isIceCreamShopBusinessType,
  isRestaurantBusinessType,
  isStrictDeliveryBusinessType,
} from './deliveryOpsTypes';
import { isCompraventaBusinessType } from './compraventaSetup';
import {
  resolveRetailCajaPath,
  resolveRetailCeoTpvPath,
  resolveRetailOpsHomePath,
} from './retailOpsPaths';

const EVENTS_HOME = '/saas/vertical/eventos';
const COMPRAVENTA_HOME = '/saas/vertical/compraventa';

function isHeladeriaOpsPath(path: string): boolean {
  return (
    path.startsWith('/saas/heladeria-')
    || path.startsWith('/saas/vertical/heladeria')
  );
}

function isEventsPath(path: string): boolean {
  return path.startsWith('/saas/events-') || path.startsWith('/saas/vertical/eventos');
}

/** Rutas del vertical Comercial / compraventa (concesionario). */
function isCompraventaPath(path: string): boolean {
  return (
    path.startsWith('/saas/vertical/compraventa')
    || path.startsWith('/saas/vehicles')
    || path.startsWith('/saas/dealership-workers')
    || path.startsWith('/saas/reservations')
    || path === '/saas/sales'
    || path.startsWith('/saas/sales/')
    || path === '/saas/pipeline'
    || path.startsWith('/saas/pipeline/')
  );
}

/**
 * Al cambiar de empresa, si la ruta es de otro vertical, ir a la home correcta.
 * Delivery ↔ Bar/restaurante ↔ Heladería ↔ Eventos ↔ Comercial no se mezclan.
 */
export function resolvePathAfterBusinessSwitch(
  pathname: string,
  nextBusinessType?: string | null,
): string | null {
  const path = String(pathname || '');
  const nextIsRestaurant = isRestaurantBusinessType(nextBusinessType);
  const nextIsDelivery = isStrictDeliveryBusinessType(nextBusinessType);
  const nextIsHeladeria = isIceCreamShopBusinessType(nextBusinessType);
  const nextIsEvents = isEventsBusinessType(nextBusinessType);
  const nextIsCompraventa = isCompraventaBusinessType(nextBusinessType);

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

  const onHeladeriaOps = isHeladeriaOpsPath(path);

  if (onRestaurantOps && !nextIsRestaurant) {
    if (nextIsEvents) return EVENTS_HOME;
    if (path.includes('/tpv')) return resolveRetailCeoTpvPath(nextBusinessType);
    if (path.startsWith('/saas/caja')) return resolveRetailCajaPath(nextBusinessType);
    if (nextIsDelivery || nextIsHeladeria) return resolveRetailOpsHomePath(nextBusinessType);
    return '/saas';
  }

  if (onDeliveryOps && !nextIsDelivery) {
    if (nextIsEvents) return EVENTS_HOME;
    if (nextIsRestaurant || nextIsHeladeria) {
      if (path.includes('/tpv')) return resolveRetailCeoTpvPath(nextBusinessType);
      if (path.includes('/caja')) return resolveRetailCajaPath(nextBusinessType);
      return resolveRetailOpsHomePath(nextBusinessType);
    }
    return '/saas';
  }

  if (onHeladeriaOps && !nextIsHeladeria) {
    if (nextIsEvents) return EVENTS_HOME;
    if (nextIsRestaurant || nextIsDelivery) {
      if (path.includes('/tpv')) return resolveRetailCeoTpvPath(nextBusinessType);
      if (path.includes('/caja')) return resolveRetailCajaPath(nextBusinessType);
      return resolveRetailOpsHomePath(nextBusinessType);
    }
    return '/saas';
  }

  if (isCompraventaPath(path) && !nextIsCompraventa) {
    if (nextIsEvents) return EVENTS_HOME;
    if (nextIsRestaurant || nextIsDelivery || nextIsHeladeria) {
      return resolveRetailOpsHomePath(nextBusinessType);
    }
    return '/saas';
  }

  if (isEventsPath(path) && !nextIsEvents) {
    if (nextIsCompraventa) return COMPRAVENTA_HOME;
    if (nextIsRestaurant || nextIsDelivery || nextIsHeladeria) {
      return resolveRetailOpsHomePath(nextBusinessType);
    }
    return '/saas';
  }

  return null;
}
