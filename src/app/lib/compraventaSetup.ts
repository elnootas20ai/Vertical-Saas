import type { PointOfSale } from './pointsOfSaleApi';
import type { WorkCenter } from './workCentersApi';
import type { Business } from './businessApi';
import { listWorkCentersForDelivery } from './workCentersApi';
import {
  dedupePointsOfSale,
  ensureTabletCodesForPointsOfSale,
  listPointsOfSaleRequest,
} from './pointsOfSaleApi';
import {
  filterPointsOfSaleForWorkCenters,
  markPdvSessionConfirmed,
  normalizeBusinessScopeId,
  notifyWorkCentersChanged,
  resolveBusinessScopeId,
  resolveStoreDataUserId,
  selectActivePointOfSale,
  workCentersStrictlyForBusiness,
  type AuthLike,
} from './businessStoreScope';

export type CompraventaStoresState = {
  dataUserId: string;
  workCenters: WorkCenter[];
  pointsOfSale: PointOfSale[];
};

export function isCompraventaBusinessType(businessType?: string | null): boolean {
  return businessType === 'carDealership';
}

/**
 * Solo centros con businessId de ESTA compraventa. Sin huérfanos, sin reasignar legacy
 * ni mezclar tiendas de otras empresas de la cuenta.
 */
export function scopeCompraventaWorkCenters(
  workCenters: WorkCenter[],
  businessId: string,
): WorkCenter[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];
  return workCentersStrictlyForBusiness(
    workCenters.filter((wc) => !wc.deletedAt),
    bid,
  ).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export type LoadCompraventaStoresOptions = {
  includeInactivePdvs?: boolean;
  ensureTabletCodes?: boolean;
};

/** Centros visibles en sidebar compraventa (misma lista que Ajustes → Tienda). */
export function listCompraventaSidebarWorkCenters(workCenters: WorkCenter[]): WorkCenter[] {
  return workCenters.filter((wc) => wc.active !== false && !wc.deletedAt);
}

/** Snapshot de activación: expositor + PDV (sin marcas ni catálogo). */
export function snapshotCompraventaStoreActivation(
  state: Pick<CompraventaStoresState, 'workCenters' | 'pointsOfSale'>,
): { hasActiveRetailStore: boolean; hasActivePdv: boolean; retailStores: WorkCenter[] } {
  const retailStores = state.workCenters.filter(
    (wc) =>
      wc.active !== false &&
      !wc.deletedAt &&
      (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
  );
  const activePdvs = state.pointsOfSale.filter(
    (p) => p.active !== false && String(p._id || '').trim(),
  );
  const storeReady = retailStores.length > 0;
  return {
    retailStores,
    hasActiveRetailStore: storeReady,
    hasActivePdv: storeReady && activePdvs.length > 0,
  };
}

/** Tiendas/PDV de compraventa: alcance estricto por empresa activa. */
export async function loadCompraventaStores(
  authUser: AuthLike,
  business?: Business | null,
  options?: LoadCompraventaStoresOptions,
): Promise<CompraventaStoresState> {
  const dataUserId = resolveStoreDataUserId(authUser, business);
  const businessId = resolveBusinessScopeId(business);
  if (!dataUserId || !businessId) {
    return { dataUserId: dataUserId || '', workCenters: [], pointsOfSale: [] };
  }

  const includeInactive = options?.includeInactivePdvs === true;
  const dedupeOpts = includeInactive ? { includeInactive: true as const } : undefined;

  const [allWorkCenters, rawPdvs] = await Promise.all([
    listWorkCentersForDelivery(dataUserId, business ?? null).catch(() => [] as WorkCenter[]),
    listPointsOfSaleRequest(dataUserId, { includeInactive }).catch(() => [] as PointOfSale[]),
  ]);

  const workCenters = scopeCompraventaWorkCenters(allWorkCenters, businessId);
  let pointsOfSale = filterPointsOfSaleForWorkCenters(
    dedupePointsOfSale(rawPdvs, dedupeOpts),
    workCenters,
    { businessId },
  );

  if (options?.ensureTabletCodes === true && pointsOfSale.length > 0) {
    pointsOfSale = await ensureTabletCodesForPointsOfSale(dataUserId, pointsOfSale);
  }

  return { dataUserId, workCenters, pointsOfSale };
}

/** Post-alta compraventa: PDV + tienda activa. */
export async function bootstrapCompraventaStoreAfterCreate(
  authUser: AuthLike,
  business: Business | null | undefined,
  payload: {
    workCenter: WorkCenter;
    pointOfSale: PointOfSale;
  },
): Promise<void> {
  const dataUserId = resolveStoreDataUserId(authUser, business);
  const { pointOfSale } = payload;
  const businessId = resolveBusinessScopeId(business);

  if (businessId && dataUserId && pointOfSale.active !== false && pointOfSale._id) {
    selectActivePointOfSale(business, dataUserId, pointOfSale._id);
  }

  notifyWorkCentersChanged(businessId);
  if (dataUserId) markPdvSessionConfirmed(dataUserId);
}
