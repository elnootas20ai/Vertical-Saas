import type { PointOfSale } from './deliveryApi';
import { normalizeBusinessScopeId, sanitizeRetailScopeSnapshot } from './retailScopeSanitize';
import type { WorkCenter } from './workCentersApi';

export interface RetailScopeSnapshot {
  retailWorkCenters: WorkCenter[];
  allPointsOfSale: PointOfSale[];
}

const CACHE_PREFIX = 'vertial_delivery_stores_cache:v2:';
const LEGACY_CACHE_PREFIX = 'vertial_delivery_stores_cache:';

let legacyCachePurged = false;

function purgeLegacyRetailScopeCache(): void {
  if (legacyCachePurged || typeof sessionStorage === 'undefined') return;
  legacyCachePurged = true;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(LEGACY_CACHE_PREFIX) || key.startsWith(CACHE_PREFIX)) continue;
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function readRetailScopeCache(
  businessId: string,
  options?: { accountBusinessCount?: number },
): RetailScopeSnapshot | null {
  if (!businessId || typeof sessionStorage === 'undefined') return null;
  purgeLegacyRetailScopeCache();
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${businessId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RetailScopeSnapshot;
    if (!parsed || !Array.isArray(parsed.retailWorkCenters)) return null;
    const sanitized = sanitizeRetailScopeSnapshot(
      businessId,
      {
        retailWorkCenters: parsed.retailWorkCenters,
        allPointsOfSale: Array.isArray(parsed.allPointsOfSale) ? parsed.allPointsOfSale : [],
      },
      options,
    );
    const hasData =
      sanitized.retailWorkCenters.length > 0 || sanitized.allPointsOfSale.length > 0;
    if (!hasData) return null;
    return sanitized;
  } catch {
    return null;
  }
}

export function writeRetailScopeCache(
  businessId: string,
  snapshot: RetailScopeSnapshot,
  options?: { accountBusinessCount?: number },
): void {
  if (!businessId || typeof sessionStorage === 'undefined') return;
  const sanitized = sanitizeRetailScopeSnapshot(businessId, snapshot, options);
  const hasData =
    sanitized.retailWorkCenters.length > 0 || sanitized.allPointsOfSale.length > 0;
  if (!hasData) return;
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${businessId}`, JSON.stringify(sanitized));
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
      sessionStorage.removeItem(`${LEGACY_CACHE_PREFIX}${businessId}`);
      return;
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (
        key?.startsWith(CACHE_PREFIX) ||
        (key?.startsWith(LEGACY_CACHE_PREFIX) && !key.startsWith(CACHE_PREFIX))
      ) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}
