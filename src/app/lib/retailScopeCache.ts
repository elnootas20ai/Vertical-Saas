import type { PointOfSale } from './deliveryApi';
import type { WorkCenter } from './workCentersApi';

export interface RetailScopeSnapshot {
  retailWorkCenters: WorkCenter[];
  allPointsOfSale: PointOfSale[];
}

const CACHE_PREFIX = 'vertial_delivery_stores_cache:';

export function readRetailScopeCache(businessId: string): RetailScopeSnapshot | null {
  if (!businessId || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${businessId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RetailScopeSnapshot;
    if (!parsed || !Array.isArray(parsed.retailWorkCenters)) return null;
    const hasData =
      parsed.retailWorkCenters.length > 0 ||
      (Array.isArray(parsed.allPointsOfSale) && parsed.allPointsOfSale.length > 0);
    if (!hasData) return null;
    return {
      retailWorkCenters: parsed.retailWorkCenters,
      allPointsOfSale: Array.isArray(parsed.allPointsOfSale) ? parsed.allPointsOfSale : [],
    };
  } catch {
    return null;
  }
}

export function writeRetailScopeCache(businessId: string, snapshot: RetailScopeSnapshot): void {
  if (!businessId || typeof sessionStorage === 'undefined') return;
  const hasData =
    snapshot.retailWorkCenters.length > 0 || snapshot.allPointsOfSale.length > 0;
  if (!hasData) return;
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${businessId}`, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

export function clearRetailScopeCache(businessId?: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (businessId) {
      sessionStorage.removeItem(`${CACHE_PREFIX}${businessId}`);
      return;
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
