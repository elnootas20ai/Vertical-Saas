import type { Business } from './businessApi';
import {
  dedupePointsOfSale,
  ensureTabletCodesForPointsOfSale,
  listPointsOfSaleRequest,
  type PointOfSale,
} from './deliveryApi';
import {
  filterPointsOfSaleForWorkCenters,
  markDeliveryPdvSessionConfirmed,
  notifyDeliveryWorkCentersChanged,
  normalizeBusinessScopeId,
  resolveBusinessScopeId,
  resolveDeliveryDataUserId,
  selectDeliveryPointOfSale,
  workCentersStrictlyForBusiness,
} from './deliverySetup';
import { listWorkCentersForDelivery, type WorkCenter } from './workCentersApi';

type AuthLike = { user_id?: string; id?: string } | null | undefined;

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
 * ni mezclar tiendas de otras empresas de la cuenta (p. ej. Badalona en Veneautos).
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

/** Tiendas/PDV de compraventa: alcance estricto por empresa activa (independiente de delivery). */
export async function loadCompraventaStores(
  authUser: AuthLike,
  business?: Business | null,
  options?: LoadCompraventaStoresOptions,
): Promise<CompraventaStoresState> {
  const dataUserId = resolveDeliveryDataUserId(authUser, business);
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
  );

  if (options?.ensureTabletCodes === true && pointsOfSale.length > 0) {
    pointsOfSale = await ensureTabletCodesForPointsOfSale(dataUserId, pointsOfSale);
  }

  return { dataUserId, workCenters, pointsOfSale };
}

/** Post-alta compraventa: PDV + tienda activa (sin marcas ni catálogo delivery). */
export async function bootstrapCompraventaStoreAfterCreate(
  authUser: AuthLike,
  business: Business | null | undefined,
  payload: {
    workCenter: WorkCenter;
    pointOfSale: PointOfSale;
  },
): Promise<void> {
  const dataUserId = resolveDeliveryDataUserId(authUser, business);
  const { pointOfSale } = payload;
  const businessId = resolveBusinessScopeId(business);

  if (businessId && dataUserId && pointOfSale.active !== false) {
    selectDeliveryPointOfSale(business, dataUserId, pointOfSale._id);
  }

  notifyDeliveryWorkCentersChanged(businessId);
  if (dataUserId) markDeliveryPdvSessionConfirmed(dataUserId);
}
