/**
 * Bootstrap y filas del TPV CEO para restaurante/bar.
 * No comparte heurísticas con delivery: tiendas = etiqueta businessId + PDV enlazado.
 */
import type { AuthUser } from '../../lib/authApi';
import type { Business } from '../../lib/businessApi';
import {
  buildDeliverySidebarStoreRows,
  pointOfSaleDisplayLabel,
  type DeliverySidebarStoreRow,
  type PointOfSale,
} from '../../lib/deliveryApi';
import {
  filterPointsOfSaleForWorkCenters,
  repairMissingRetailDeliveryPdvs,
  type DeliveryStoresState,
} from '../../lib/deliverySetup';
import type { WorkCenter } from '../../lib/workCentersApi';
import {
  loadRetailStoresForBusiness,
  writeRetailScopeCacheForBusiness,
} from '../retailScopeRegistry';
import { filterRestaurantRetailWorkCenters } from './retailScope';

type AuthLike = Pick<AuthUser, 'user_id' | 'id'> | null | undefined;

export function buildRestaurantCeoTpvStoreRows(
  workCenters: WorkCenter[],
  pointsOfSale: PointOfSale[],
  business: Pick<Business, 'business_id' | 'businessType' | 'createdAt' | 'name'> | null | undefined,
  businesses: Pick<Business, 'business_id' | 'businessType' | 'createdAt' | 'name'>[] = [],
): DeliverySidebarStoreRow[] {
  if (!business) return [];
  const retail = filterRestaurantRetailWorkCenters(workCenters, business, businesses);
  const scopedPdvs = filterPointsOfSaleForWorkCenters(pointsOfSale, retail);
  const rows = buildDeliverySidebarStoreRows(retail, scopedPdvs).filter(
    (r) => !r.inactive && !r.needsPdv && Boolean(r.pdvId),
  );
  if (rows.length > 0) return rows;

  // Fallback: PDVs activos enlazados a WC del restaurante (por si falta fila sidebar).
  return scopedPdvs
    .filter((p) => p.active !== false)
    .map((pdv) => ({
      rowId: pdv._id,
      pdvId: pdv._id,
      workCenterId: pdv.workCenterId,
      title: pointOfSaleDisplayLabel(pdv),
      code: pdv.code,
      inactive: false,
      needsPdv: false,
    }));
}

/** Carga + repara PDV/terminal para el TPV gerente de restaurante. */
export async function bootstrapRestaurantCeoTpvStores(
  authUser: AuthLike,
  business: Business,
  businesses: Business[],
  options?: { accountBusinessCount?: number },
): Promise<DeliveryStoresState> {
  let state = await loadRetailStoresForBusiness(authUser, business, businesses, {
    accountBusinessCount: options?.accountBusinessCount,
    includeInactivePdvs: true,
    skipPdvMerge: false,
    ensureTabletCodes: true,
    tpvBootstrap: true,
  });

  if (state.dataUserId && state.workCenters.length > 0) {
    state = {
      ...state,
      pointsOfSale: await repairMissingRetailDeliveryPdvs(
        state.dataUserId,
        state.workCenters,
        state.pointsOfSale,
        business,
      ),
    };
  }

  const bid = String(business.business_id || '').replace(/^business:/, '').trim();
  if (bid && (state.workCenters.length > 0 || state.pointsOfSale.length > 0)) {
    writeRetailScopeCacheForBusiness(
      bid,
      { retailWorkCenters: state.workCenters, allPointsOfSale: state.pointsOfSale },
      { business, businesses, accountBusinessCount: options?.accountBusinessCount },
    );
  }

  return state;
}
