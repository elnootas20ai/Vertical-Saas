import type { DeliverySidebarStoreRow, PointOfSale } from './deliveryApi';
import { buildDeliverySidebarStoreRows } from './deliveryApi';
import { sanitizeRetailScopeSnapshot } from './retailScopeSanitize';
import type { WorkCenter } from './workCentersApi';

const CACHE_PREFIX = 'vertial.sidebarRetail:v3:';
const LEGACY_CACHE_PREFIX = 'vertial.sidebarRetail:v1:';
const STALE_CACHE_PREFIX = 'vertial.sidebarRetail:v2:';

export type SidebarRetailSnapshot = {
  rows: DeliverySidebarStoreRow[];
  retailWorkCenters: WorkCenter[];
  allPointsOfSale: PointOfSale[];
  savedAt: number;
};

let legacyCachePurged = false;

function purgeLegacySidebarRetailCache(): void {
  if (legacyCachePurged || typeof localStorage === 'undefined') return;
  legacyCachePurged = true;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith(LEGACY_CACHE_PREFIX) ||
        key.startsWith(STALE_CACHE_PREFIX)
      ) {
        if (!key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

export function readSidebarRetailCache(
  businessId: string,
  options?: { accountBusinessCount?: number },
): SidebarRetailSnapshot | null {
  if (!businessId || typeof localStorage === 'undefined') return null;
  purgeLegacySidebarRetailCache();
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${businessId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SidebarRetailSnapshot;
    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;

    const sanitized = sanitizeRetailScopeSnapshot(
      businessId,
      {
        retailWorkCenters: Array.isArray(parsed.retailWorkCenters) ? parsed.retailWorkCenters : [],
        allPointsOfSale: Array.isArray(parsed.allPointsOfSale) ? parsed.allPointsOfSale : [],
      },
      options,
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

export function writeSidebarRetailCache(
  businessId: string,
  snapshot: SidebarRetailSnapshot,
  options?: { accountBusinessCount?: number },
): void {
  if (!businessId || snapshot.rows.length === 0 || typeof localStorage === 'undefined') return;
  const sanitized = sanitizeRetailScopeSnapshot(
    businessId,
    {
      retailWorkCenters: snapshot.retailWorkCenters,
      allPointsOfSale: snapshot.allPointsOfSale,
    },
    options,
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

export function clearSidebarRetailCache(businessId?: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (businessId) {
      localStorage.removeItem(`${CACHE_PREFIX}${businessId}`);
      localStorage.removeItem(`${LEGACY_CACHE_PREFIX}${businessId}`);
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (
        key?.startsWith(CACHE_PREFIX) ||
        (key?.startsWith(LEGACY_CACHE_PREFIX) && !key.startsWith(CACHE_PREFIX))
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}
