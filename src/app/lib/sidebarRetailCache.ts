import type { DeliverySidebarStoreRow, PointOfSale } from './deliveryApi';
import { filterPointsOfSaleForWorkCenters } from './deliverySetup';
import type { WorkCenter } from './workCentersApi';
const CACHE_PREFIX = 'vertial.sidebarRetail:v1:';

export type SidebarRetailSnapshot = {
  rows: DeliverySidebarStoreRow[];
  retailWorkCenters: WorkCenter[];
  allPointsOfSale: PointOfSale[];
  savedAt: number;
};

export function readSidebarRetailCache(businessId: string): SidebarRetailSnapshot | null {
  if (!businessId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${businessId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SidebarRetailSnapshot;
    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;
    const retailWorkCenters = Array.isArray(parsed.retailWorkCenters) ? parsed.retailWorkCenters : [];
    const wcIds = new Set(retailWorkCenters.map((wc) => String(wc._id || '').trim()).filter(Boolean));
    const allPointsOfSale = filterPointsOfSaleForWorkCenters(
      Array.isArray(parsed.allPointsOfSale) ? parsed.allPointsOfSale : [],
      retailWorkCenters,
    );
    const rows = parsed.rows.filter(
      (row) => row.needsPdv || (row.workCenterId && wcIds.has(row.workCenterId)),
    );
    if (rows.length === 0) return null;
    return {
      rows,
      retailWorkCenters,
      allPointsOfSale,
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

export function writeSidebarRetailCache(businessId: string, snapshot: SidebarRetailSnapshot): void {
  if (!businessId || snapshot.rows.length === 0 || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${businessId}`,
      JSON.stringify({ ...snapshot, savedAt: Date.now() }),
    );
  } catch {
    /* quota */
  }
}
