import type { PointOfSale } from './deliveryApi';
import { normalizeBusinessScopeId, filterPointsOfSaleForWorkCenters } from './deliverySetup';
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
    const retailWorkCenters = parsed.retailWorkCenters;
    const allPointsOfSale = filterPointsOfSaleForWorkCenters(
      Array.isArray(parsed.allPointsOfSale) ? parsed.allPointsOfSale : [],
      retailWorkCenters,
    );
    return {
      retailWorkCenters,
      allPointsOfSale,
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

/** Tras login tablet: pintar la caja al instante sin esperar al fetch completo de tiendas. */
export function seedRetailScopeCacheFromTabletLogin(params: {
  businessId: string;
  pointOfSale?: PointOfSale | null;
  workCenterId?: string;
}): void {
  const bid = normalizeBusinessScopeId(params.businessId);
  const pdv = params.pointOfSale;
  if (!bid || !pdv?._id) return;

  const wcId = String(params.workCenterId || pdv.workCenterId || '').trim();
  const retailWorkCenters: WorkCenter[] = wcId
    ? [
        {
          _id: wcId,
          name: pdv.name || 'Tienda',
          centerType: 'punto_de_venta',
          businessId: bid,
          active: true,
        } as WorkCenter,
      ]
    : [];

  writeRetailScopeCache(bid, {
    retailWorkCenters,
    allPointsOfSale: [pdv],
  });
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
