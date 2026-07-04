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
  filterPointsOfSaleForWorkCenters,
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
};

/**
 * Carga tiendas/PDV solo de esta empresa restaurante.
 * No reutiliza loadDeliveryStores (huérfanas, rescate, legacy multiempresa).
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

  const retail = filterRestaurantRetailWorkCenters(allWorkCenters, business, businesses);

  let pointsOfSale = options?.skipPdvMerge
    ? dedupePointsOfSale(rawPdvs, dedupeOpts)
    : await mergePointsOfSaleWithRetailWorkCenters(
        dataUserId,
        dedupePointsOfSale(rawPdvs, dedupeOpts),
        {
          business,
          workCenters: retail,
          includeInactive: includeInactivePdvs,
        },
      );

  pointsOfSale = dedupePointsOfSale(
    filterPointsOfSaleForWorkCenters(pointsOfSale, retail),
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
          filterPointsOfSaleForWorkCenters(pointsOfSale, retail),
          dedupeOpts,
        );
      } catch {
        continue;
      }
    }
  }

  pointsOfSale = await ensureTabletCodesForPointsOfSale(dataUserId, pointsOfSale);
  pointsOfSale = dedupePointsOfSale(
    filterPointsOfSaleForWorkCenters(pointsOfSale, retail),
    dedupeOpts,
  );

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
  return filterPointsOfSaleForWorkCenters(pointsOfSale, retail);
}
