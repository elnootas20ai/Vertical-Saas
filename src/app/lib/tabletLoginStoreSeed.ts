/**
 * Semilla de caché tras activar tablet TPV.
 * Archivo aparte para no crear ciclo retailScopeCache ↔ restaurantRetailCache ↔ deliverySetup
 * al cargar /auth/tpv-tablet (bloqueaba el navegador entero en dev).
 */
import type { Business } from './businessApi';
import type { PointOfSale } from './deliveryApi';
import { buildDeliverySidebarStoreRows } from './deliveryApi';
import { isRestaurantBusinessType } from './deliveryOpsTypes';
import { normalizeBusinessScopeId } from './retailScopeSanitize';
import { writeRetailScopeCache } from './retailScopeCache';
import { writeRestaurantRetailCache } from '../verticals/restaurant/restaurantRetailCache';
import type { WorkCenter } from './workCentersApi';

function buildTabletLoginStoreSnapshot(params: {
  businessId: string;
  pointOfSale: PointOfSale;
  workCenterId?: string;
}): { retailWorkCenters: WorkCenter[]; allPointsOfSale: PointOfSale[] } {
  const bid = normalizeBusinessScopeId(params.businessId);
  const pdv = params.pointOfSale;
  const wcId =
    String(params.workCenterId || pdv.workCenterId || '').trim() ||
    `wc-tablet-${pdv._id}`;
  const pdvForCache: PointOfSale = {
    ...pdv,
    workCenterId: String(pdv.workCenterId || wcId).trim(),
    active: pdv.active !== false,
  };
  const retailWorkCenters: WorkCenter[] = [
    {
      _id: wcId,
      name: pdv.name || 'Tienda',
      centerType: 'punto_de_venta',
      businessId: bid,
      active: true,
    } as WorkCenter,
  ];
  return { retailWorkCenters, allPointsOfSale: [pdvForCache] };
}

export function seedRetailScopeCacheFromTabletLogin(params: {
  businessId: string;
  pointOfSale?: PointOfSale | null;
  workCenterId?: string;
  business?: Pick<Business, 'business_id' | 'businessType' | 'createdAt' | 'name'> | null;
  businesses?: Pick<Business, 'business_id' | 'businessType' | 'createdAt' | 'name'>[];
}): void {
  const bid = normalizeBusinessScopeId(params.businessId);
  const pdv = params.pointOfSale;
  if (!bid || !pdv?._id) return;

  const snapshot = buildTabletLoginStoreSnapshot({
    businessId: bid,
    pointOfSale: pdv,
    workCenterId: params.workCenterId,
  });

  if (isRestaurantBusinessType(params.business?.businessType) && params.business) {
    const rows = buildDeliverySidebarStoreRows(
      snapshot.retailWorkCenters,
      snapshot.allPointsOfSale,
    );
    if (rows.length === 0) return;
    writeRestaurantRetailCache(
      bid,
      {
        rows,
        retailWorkCenters: snapshot.retailWorkCenters,
        allPointsOfSale: snapshot.allPointsOfSale,
        savedAt: Date.now(),
      },
      params.business,
      params.businesses || [params.business],
    );
    return;
  }

  writeRetailScopeCache(bid, snapshot);
}
