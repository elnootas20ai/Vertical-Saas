/**
 * Reglas de ámbito multi-PDV (Vertial / delivery retail).
 *
 * - PDV 1, 2, 3… son independientes: pedidos, stock, facturación y caja por tienda.
 * - Clientes y equipo: ámbito empresa (compartidos).
 * - Catálogo: por marca; la marca puede limitar en qué PDVs opera.
 * - Local = PDV (mismo concepto para el usuario).
 * - Al crear una 2ª tienda debe quedar autónoma como la 1ª (sin heredar config operativa).
 */
import type { AuthUser } from './authApi';
import type { Business } from './businessApi';
import { loadDeliveryStores } from './deliverySetup';
import {
  deliveryOrderMatchesPdvFilter,
  pickDefaultActivePdvId,
  type DeliveryOrderPdvFilterOptions,
} from './deliveryOpsPdvSelection';
import { resolveBusinessDataUserId } from './tenantUserId';
import type { WorkCenter } from './workCentersApi';
import type { PointOfSale } from './deliveryApi';

export { deliveryOrderMatchesPdvFilter, pickDefaultActivePdvId };
export type { DeliveryOrderPdvFilterOptions };

export interface ScopedPdvContext {
  dataUserId: string | null;
  pointsOfSale: PointOfSale[];
  primaryPdvId: string | null;
}

/** PDVs activos de la empresa actual (filtrados por centros de trabajo / negocio). */
export async function loadScopedPointsOfSale(
  user: AuthUser | null | undefined,
  business: Business | null | undefined,
): Promise<ScopedPdvContext> {
  const dataUserId = resolveBusinessDataUserId(user, business);
  if (!dataUserId) {
    return { dataUserId: null, pointsOfSale: [], primaryPdvId: null };
  }
  const { pointsOfSale } = await loadDeliveryStores(user, business);
  const active = pointsOfSale.filter((p) => p.active !== false);
  return {
    dataUserId,
    pointsOfSale: active,
    primaryPdvId: pickDefaultActivePdvId(active),
  };
}

export function filterOrdersForActivePdv<T extends { salesPointId?: string | null; salesPointName?: string | null }>(
  orders: T[],
  pdvId: string | null | undefined,
  primaryPdvId: string | null | undefined,
  pdvName?: string | null,
  pdvWorkCenterId?: string | null,
): T[] {
  if (!pdvId) return orders;
  return orders.filter((o) =>
    deliveryOrderMatchesPdvFilter(o, pdvId, { primaryPdvId, pdvName, pdvWorkCenterId }),
  );
}

export function resolvePdvIdFromStoreRef(
  pointsOfSale: PointOfSale[],
  ref: string | null | undefined,
): { pdvId: string | null; pdvName: string | null; workCenterId: string | null } {
  let r = String(ref || '').trim();
  if (!r) return { pdvId: null, pdvName: null, workCenterId: null };
  if (r.startsWith('wc:')) r = r.slice(3).trim();
  const bare = r.startsWith('wc:') ? r.slice(3) : r;
  const byId = pointsOfSale.find((p) => p._id === r || p._id === bare);
  if (byId) {
    return {
      pdvId: byId._id,
      pdvName: byId.name || null,
      workCenterId: String(byId.workCenterId || '').trim() || null,
    };
  }
  const byWc = pointsOfSale.find((p) => {
    const wc = String(p.workCenterId || '').trim();
    return wc === r || wc === bare;
  });
  if (byWc) {
    return {
      pdvId: byWc._id,
      pdvName: byWc.name || null,
      workCenterId: String(byWc.workCenterId || '').trim() || bare,
    };
  }
  return { pdvId: null, pdvName: null, workCenterId: bare.startsWith('wc-') || bare.startsWith('wc') ? bare : null };
}

export function isInvitedWorkerUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.accountType === 'user') return true;
  return Boolean(String((user as { invitedBy?: string }).invitedBy || '').trim());
}

function workCenterMatchesRef(wc: WorkCenter, ref: string): boolean {
  const bare = ref.startsWith('wc:') ? ref.slice(3) : ref;
  const id = String(wc._id || '').trim();
  const alt = String(wc.id || '').trim();
  return id === ref || alt === ref || id === bare || alt === bare;
}

/** Trabajador invitado: solo su tienda/PDV asignado en Equipo (`employment.salesPointId`). */
export function filterStoresForWorkerAssignment(
  pointsOfSale: PointOfSale[],
  workCenters: WorkCenter[],
  salesPointRef: string | null | undefined,
): {
  pointsOfSale: PointOfSale[];
  workCenters: WorkCenter[];
  assignedPdvId: string | null;
} {
  const ref = String(salesPointRef || '').trim();
  if (!ref) {
    return { pointsOfSale: [], workCenters: [], assignedPdvId: null };
  }

  const resolved = resolvePdvIdFromStoreRef(pointsOfSale, ref);
  const wcId = String(resolved.workCenterId || '').trim();

  if (resolved.pdvId) {
    const pdv = pointsOfSale.find((p) => p._id === resolved.pdvId) || null;
    const linkedWcId = wcId || String(pdv?.workCenterId || '').trim();
    const matchedWc = linkedWcId
      ? workCenters.filter((wc) => workCenterMatchesRef(wc, linkedWcId))
      : workCenters.filter((wc) => workCenterMatchesRef(wc, ref));
    return {
      pointsOfSale: pdv ? [pdv] : [],
      workCenters: matchedWc,
      assignedPdvId: resolved.pdvId,
    };
  }

  if (wcId) {
    const wcPdvs = pointsOfSale.filter((p) => {
      const linked = String(p.workCenterId || '').trim();
      return linked === wcId || linked === ref;
    });
    const primary = wcPdvs[0] || null;
    return {
      pointsOfSale: wcPdvs,
      workCenters: workCenters.filter((wc) => workCenterMatchesRef(wc, wcId)),
      assignedPdvId: primary?._id || null,
    };
  }

  return { pointsOfSale: [], workCenters: [], assignedPdvId: null };
}

/** Catálogo visible en una tienda según marcas asignadas (work center id). */
export function catalogItemOperatesAtWorkCenter(
  item: { brandIds?: string[] },
  brands: Array<{ _id: string; salesPointIds?: string[] }>,
  workCenterId: string,
): boolean {
  const wc = String(workCenterId || '').trim();
  if (!wc) return true;
  const brandIds = item.brandIds ?? [];
  if (brandIds.length === 0) return true;
  return brandIds.some((brandId) => {
    const brand = brands.find((b) => b._id === brandId);
    if (!brand) return false;
    const storeIds = brand.salesPointIds ?? [];
    if (storeIds.length === 0) return true;
    return storeIds.includes(wc);
  });
}
