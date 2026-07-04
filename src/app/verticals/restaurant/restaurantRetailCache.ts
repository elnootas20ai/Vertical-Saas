import type { PointOfSale } from '../../lib/deliveryApi';
import { buildDeliverySidebarStoreRows, type DeliverySidebarStoreRow } from '../../lib/deliveryApi';
import { filterPointsOfSaleForWorkCenters } from '../../lib/deliverySetup';
import type { WorkCenter } from '../../lib/workCentersApi';
import {
  filterRestaurantRetailWorkCenters,
  type RestaurantBusinessRef,
} from './retailScope';

const CACHE_PREFIX = 'vertial.restaurantRetail:v1:';

export type RestaurantRetailSnapshot = {
  rows: DeliverySidebarStoreRow[];
  retailWorkCenters: WorkCenter[];
  allPointsOfSale: PointOfSale[];
  savedAt: number;
};

function sanitizeSnapshot(
  businessId: string,
  snapshot: { retailWorkCenters: WorkCenter[]; allPointsOfSale: PointOfSale[] },
  activeBusiness: RestaurantBusinessRef,
  allBusinesses: RestaurantBusinessRef[],
): { retailWorkCenters: WorkCenter[]; allPointsOfSale: PointOfSale[] } {
  const retail = filterRestaurantRetailWorkCenters(
    snapshot.retailWorkCenters,
    activeBusiness,
    allBusinesses,
  );
  const allPointsOfSale = filterPointsOfSaleForWorkCenters(snapshot.allPointsOfSale, retail);
  return { retailWorkCenters: retail, allPointsOfSale };
}

export function readRestaurantRetailCache(
  businessId: string,
  activeBusiness: RestaurantBusinessRef,
  allBusinesses: RestaurantBusinessRef[],
): RestaurantRetailSnapshot | null {
  if (!businessId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${businessId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestaurantRetailSnapshot;
    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;

    const sanitized = sanitizeSnapshot(
      businessId,
      {
        retailWorkCenters: Array.isArray(parsed.retailWorkCenters) ? parsed.retailWorkCenters : [],
        allPointsOfSale: Array.isArray(parsed.allPointsOfSale) ? parsed.allPointsOfSale : [],
      },
      activeBusiness,
      allBusinesses,
    );
    const rows = buildDeliverySidebarStoreRows(
      sanitized.retailWorkCenters,
      sanitized.allPointsOfSale,
    );
    if (rows.length === 0) return null;

    return {
      rows,
      retailWorkCenters: sanitized.retailWorkCenters,
      allPointsOfSale: sanitized.allPointsOfSale,
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

export function writeRestaurantRetailCache(
  businessId: string,
  snapshot: RestaurantRetailSnapshot,
  activeBusiness: RestaurantBusinessRef,
  allBusinesses: RestaurantBusinessRef[],
): void {
  if (!businessId || snapshot.rows.length === 0 || typeof localStorage === 'undefined') return;
  const sanitized = sanitizeSnapshot(
    businessId,
    snapshot,
    activeBusiness,
    allBusinesses,
  );
  const rows = buildDeliverySidebarStoreRows(
    sanitized.retailWorkCenters,
    sanitized.allPointsOfSale,
  );
  if (rows.length === 0) return;
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${businessId}`,
      JSON.stringify({
        rows,
        retailWorkCenters: sanitized.retailWorkCenters,
        allPointsOfSale: sanitized.allPointsOfSale,
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* quota */
  }
}

export function clearRestaurantRetailCache(businessId?: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (businessId) {
      localStorage.removeItem(`${CACHE_PREFIX}${businessId}`);
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
