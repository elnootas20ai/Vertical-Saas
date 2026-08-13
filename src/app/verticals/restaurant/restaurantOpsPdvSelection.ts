/**
 * PDV/local elegido en TPV / ops de bar-restaurante.
 * Claves propias: no compartir storage ni eventos con Delivery.
 */

export const RESTAURANT_ACTIVE_STORE_CHANGED = 'vertial-restaurant-active-store';

/** Vista ops: una tienda o monitor en directo de todos los locales. */
export type RestaurantOpsViewMode = 'single' | 'live_all';

export const RESTAURANT_OPS_LIVE_ALL_FILTER = '__restaurant_live_all__';

export function notifyRestaurantActiveStoreChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(RESTAURANT_ACTIVE_STORE_CHANGED));
  } catch {
    /* ignore */
  }
}

export function restaurantOpsSelectedPdvStorageKey(businessId: string, dataUserId: string): string {
  return `vertial.restaurantOps.selectedPdv.${String(businessId || 'noBiz')}.${String(dataUserId || '')}`;
}

export function readRestaurantOpsSelectedPdvId(businessId: string, dataUserId: string): string | null {
  try {
    const v = localStorage.getItem(restaurantOpsSelectedPdvStorageKey(businessId, dataUserId));
    const t = v && String(v).trim();
    return t || null;
  } catch {
    return null;
  }
}

export function writeRestaurantOpsSelectedPdvId(
  businessId: string,
  dataUserId: string,
  value: string | null,
): void {
  try {
    const key = restaurantOpsSelectedPdvStorageKey(businessId, dataUserId);
    if (value && String(value).trim()) localStorage.setItem(key, String(value).trim());
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function restaurantOpsViewModeStorageKey(businessId: string, dataUserId: string): string {
  return `vertial.restaurantOps.viewMode.${String(businessId || 'noBiz')}.${String(dataUserId || '')}`;
}

export function readRestaurantOpsViewMode(
  businessId: string,
  dataUserId: string,
): RestaurantOpsViewMode {
  try {
    const v = localStorage.getItem(restaurantOpsViewModeStorageKey(businessId, dataUserId));
    return v === 'live_all' ? 'live_all' : 'single';
  } catch {
    return 'single';
  }
}

export function writeRestaurantOpsViewMode(
  businessId: string,
  dataUserId: string,
  mode: RestaurantOpsViewMode,
): void {
  try {
    const key = restaurantOpsViewModeStorageKey(businessId, dataUserId);
    if (mode === 'live_all') localStorage.setItem(key, 'live_all');
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
