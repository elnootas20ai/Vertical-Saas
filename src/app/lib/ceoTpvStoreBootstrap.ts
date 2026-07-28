import type { Business } from './businessApi';
import type { AuthUser } from './authApi';
import {
  knownBusinessIdsFromList,
  repairMissingRetailDeliveryPdvs,
  type DeliveryStoresState,
} from './deliverySetup';
import type { PointOfSale } from './deliveryApi';
import {
  loadRetailStoresForBusiness,
  writeRetailScopeCacheForBusiness,
  type LoadRetailStoresOptions,
} from '../verticals/retailScopeRegistry';
import type { WorkCenter } from './workCentersApi';
import type { DeliverySidebarStoreRow } from './deliveryApi';

type AuthLike = Pick<AuthUser, 'user_id' | 'id'> | null | undefined;

/**
 * Carga tiendas para el TPV del gerente: enlaza PDV faltantes y genera códigos tablet.
 * ActiveStoreScope solo lee (skipPdvMerge); aquí reparamos antes del selector de tienda.
 */
export async function bootstrapCeoTpvStores(
  authUser: AuthLike,
  business: Business,
  businesses: Business[],
  options?: Pick<LoadRetailStoresOptions, 'accountBusinessCount' | 'knownBusinessIds'>,
): Promise<DeliveryStoresState> {
  let state = await loadRetailStoresForBusiness(authUser, business, businesses, {
    accountBusinessCount: options?.accountBusinessCount,
    knownBusinessIds: options?.knownBusinessIds ?? knownBusinessIdsFromList(businesses),
    includeInactivePdvs: true,
    skipPdvMerge: false,
    ensureTabletCodes: true,
    // Delivery/CEO: enlazar PDV faltantes para que el selector no quede vacío.
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

/** ¿Hace falta reparar/enlazar PDV antes de mostrar el selector del gerente? */
export function needsCeoTpvStoreBootstrap(
  retailWorkCenters: WorkCenter[],
  pointsOfSale: PointOfSale[],
  storeRows: DeliverySidebarStoreRow[],
): boolean {
  const activePdvs = pointsOfSale.filter((p) => p.active !== false);
  const openable = storeRows.filter((r) => r.pdvId && !r.needsPdv && !r.inactive);
  if (openable.length > 0) return false;
  return activePdvs.length === 0 || retailWorkCenters.length > 0;
}
