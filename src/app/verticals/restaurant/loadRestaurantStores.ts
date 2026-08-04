import type { Business } from '../../lib/businessApi';
import {
  dedupePointsOfSale,
  ensureDeliveryPdvForWorkCenter,
  ensureTabletCodesForPointsOfSale,
  listPointsOfSaleRequest,
  mergePointsOfSaleWithRetailWorkCenters,
  type PointOfSale,
} from '../../lib/deliveryApi';
import {
  alignRetailWorkCentersToActiveBusiness,
  filterPointsOfSaleForWorkCenters,
  knownBusinessIdsFromList,
  rescueRetailForBusinessWithoutStores,
  resolveDeliveryDataUserId,
  type DeliveryStoresState,
} from '../../lib/deliverySetup';
import type { AuthUser } from '../../lib/authApi';
import { listWorkCentersForDelivery } from '../../lib/workCentersApi';
import { filterRestaurantRetailWorkCenters } from './retailScope';

type AuthLike = Pick<AuthUser, 'user_id' | 'id'> | null | undefined;

export type LoadRestaurantStoresOptions = {
  accountBusinessCount?: number;
  includeInactivePdvs?: boolean;
  skipPdvMerge?: boolean;
  tpvBootstrap?: boolean;
  knownBusinessIds?: string[];
};

/**
 * Carga tiendas/PDV solo de esta empresa restaurante.
 * Recupera locales etiquetados a UUID muertos (empresa recreada) sin mezclar delivery.
 */
export async function loadRestaurantStores(
  authUser: AuthLike,
  business: Business,
  businesses: Business[],
  options?: LoadRestaurantStoresOptions,
): Promise<DeliveryStoresState> {
  const dataUserId = resolveDeliveryDataUserId(authUser, business);
  if (!dataUserId) {
    return { dataUserId: '', workCenters: [], pointsOfSale: [] };
  }

  const includeInactivePdvs = options?.includeInactivePdvs === true;
  const dedupeOpts = includeInactivePdvs ? { includeInactive: true as const } : undefined;

  const [allWorkCenters, rawPdvs] = await Promise.all([
    listWorkCentersForDelivery(dataUserId, business).catch(() => []),
    listPointsOfSaleRequest(dataUserId, { includeInactive: includeInactivePdvs }).catch(() => []),
  ]);

  const businessId = String(business.business_id || '').replace(/^business:/, '').trim();
  const pdvScope = { businessId };
  const dedupedRaw = dedupePointsOfSale(rawPdvs, dedupeOpts);

  let scopedWorkCenters = alignRetailWorkCentersToActiveBusiness(
    allWorkCenters,
    business,
    dedupedRaw,
  );
  const knownIds =
    options?.knownBusinessIds ?? knownBusinessIdsFromList(businesses);
  if (businessId && knownIds.length > 0) {
    scopedWorkCenters = rescueRetailForBusinessWithoutStores(
      scopedWorkCenters,
      businessId,
      knownIds,
    );
  }

  const retail = filterRestaurantRetailWorkCenters(
    scopedWorkCenters,
    business,
    businesses,
  );

  const skipPdvMerge = options?.skipPdvMerge ?? true;
  let pointsOfSale = skipPdvMerge
    ? dedupedRaw
    : await mergePointsOfSaleWithRetailWorkCenters(dataUserId, dedupedRaw, {
        business,
        workCenters: retail,
        includeInactive: includeInactivePdvs,
      });

  // Con businessId: si solo hay centros sala_room (excluidos del retail),
  // no vaciar PDVs etiquetados de la empresa (evita «Crear primer local» en TPV).
  pointsOfSale = dedupePointsOfSale(
    filterPointsOfSaleForWorkCenters(pointsOfSale, retail, pdvScope),
    dedupeOpts,
  );

  if (options?.tpvBootstrap) {
    for (const wc of retail.filter((w) => w.active !== false && !w.deletedAt)) {
      try {
        const ensured = await ensureDeliveryPdvForWorkCenter(dataUserId, wc, {
          business,
          existingPdvs: pointsOfSale,
        });
        if (!ensured) continue;
        const idx = pointsOfSale.findIndex((p) => p._id === ensured._id);
        if (idx >= 0) pointsOfSale[idx] = ensured;
        else pointsOfSale.push(ensured);
        pointsOfSale = dedupePointsOfSale(
          filterPointsOfSaleForWorkCenters(pointsOfSale, retail, pdvScope),
          dedupeOpts,
        );
      } catch {
        continue;
      }
    }
  }

  if (options?.tpvBootstrap) {
    pointsOfSale = await ensureTabletCodesForPointsOfSale(dataUserId, pointsOfSale);
    pointsOfSale = dedupePointsOfSale(
      filterPointsOfSaleForWorkCenters(pointsOfSale, retail, pdvScope),
      dedupeOpts,
    );
  }

  return {
    dataUserId,
    workCenters: retail,
    pointsOfSale,
  };
}

/** PDV visibles para sala/TPV de un restaurante concreto. */
export function scopeRestaurantPointsOfSale(
  pointsOfSale: PointOfSale[],
  workCenters: Parameters<typeof filterRestaurantRetailWorkCenters>[0],
  business: Business,
  businesses: Business[],
): PointOfSale[] {
  const retail = filterRestaurantRetailWorkCenters(workCenters, business, businesses);
  const businessId = String(business.business_id || '').replace(/^business:/, '').trim();
  return filterPointsOfSaleForWorkCenters(pointsOfSale, retail, { businessId });
}
