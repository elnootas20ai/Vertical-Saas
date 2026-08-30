import type { Business } from './businessApi';
import type { WorkCenter } from './workCentersApi';
import { resolveBusinessDataUserId } from './tenantUserId';
import {
  notifyDeliveryActiveStoreChanged,
  writeDeliveryOpsSelectedPdvId,
} from './deliveryOpsPdvSelection';

/** Alcance de tiendas/PDV compartido entre verticales (sin acoplar a delivery). */

export type AuthLike = { user_id?: string; id?: string } | null | undefined;

export type PointOfSaleLike = {
  _id?: string;
  workCenterId?: string;
  businessId?: string;
  business_id?: string;
  active?: boolean;
  name?: string;
  updatedAt?: string;
  createdAt?: string;
};

export function normalizeBusinessScopeId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

export function resolveBusinessScopeId(business?: Business | null): string {
  return normalizeBusinessScopeId(
    business?.business_id || (business as { id?: string } | null)?.id,
  );
}

export function resolveStoreDataUserId(
  authUser: AuthLike,
  business?: Business | null,
): string {
  return resolveBusinessDataUserId(authUser, business ?? null);
}

export function readWorkCenterBusinessId(wc: WorkCenter | Record<string, unknown>): string {
  const raw = wc as Record<string, unknown>;
  return normalizeBusinessScopeId(String(raw.businessId || raw.business_id || ''));
}

/** Solo centros con `businessId` de esta empresa. */
export function workCentersStrictlyForBusiness(
  workCenters: WorkCenter[],
  businessId: string,
): WorkCenter[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];
  return workCenters.filter((wc) => readWorkCenterBusinessId(wc) === bid);
}

/** PDV enlazados a centros del scope (misma lógica que deliverySetup). */
export function filterPointsOfSaleForWorkCenters<T extends PointOfSaleLike>(
  pointsOfSale: T[],
  workCenters: WorkCenter[],
  options?: { businessId?: string | null; accountBusinessCount?: number },
): T[] {
  const wcIds = new Set(workCenters.map((wc) => String(wc._id || '').trim()).filter(Boolean));
  const businessId = normalizeBusinessScopeId(options?.businessId);
  const multiBiz =
    typeof options?.accountBusinessCount === 'number' && options.accountBusinessCount > 1;
  const pdvBusinessId = (p: T) =>
    normalizeBusinessScopeId(String(p.business_id || p.businessId || ''));

  if (wcIds.size === 0) {
    if (!businessId) return [];
    const tagged = pointsOfSale.filter((p) => pdvBusinessId(p) === businessId);
    if (tagged.length > 0) return tagged;
    if (multiBiz) return [];
    return pointsOfSale.filter((p) => !pdvBusinessId(p));
  }

  return pointsOfSale.filter((p) => {
    const wcId = String(p.workCenterId || '').trim();
    const pBid = pdvBusinessId(p);
    if (businessId && pBid && pBid !== businessId) return false;
    if (businessId && pBid === businessId) return true;
    if (wcId && wcIds.has(wcId)) return true;
    if (businessId && !pBid && !wcId) return !multiBiz;
    return false;
  });
}

function foldPdvLabel(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Selector UI: solo PDV de la empresa activa.
 * Nunca incluye otra empresa del portfolio ni PDV huérfanos sin WC del scope.
 */
export function filterPointsOfSaleStrictlyForBusiness<T extends PointOfSaleLike>(
  pointsOfSale: T[],
  options: {
    businessId: string;
    workCenters?: Array<{ _id?: string; deletedAt?: string | null; active?: boolean }>;
    foreignBusinessNames?: string[];
  },
): T[] {
  const bid = normalizeBusinessScopeId(options.businessId);
  if (!bid) return [];

  const wcIds = new Set(
    (options.workCenters || [])
      .filter((wc) => wc && !wc.deletedAt && wc.active !== false)
      .map((wc) => String(wc._id || '').trim())
      .filter(Boolean),
  );

  const foreignNames = (options.foreignBusinessNames || [])
    .map((n) => foldPdvLabel(n))
    .filter(Boolean);

  return pointsOfSale.filter((p) => {
    if (!p || (p as { deletedAt?: string }).deletedAt || p.active === false) return false;
    const pBid = normalizeBusinessScopeId(String(p.business_id || p.businessId || ''));
    if (pBid && pBid !== bid) return false;

    const name = foldPdvLabel(String(p.name || ''));
    // Solo nombre exacto: «delivery» no debe excluir «delivery bufala».
    if (name && foreignNames.some((fn) => name === fn)) {
      return false;
    }

    if (pBid === bid) return true;
    const wcId = String(p.workCenterId || '').trim();
    return Boolean(wcId && wcIds.has(wcId));
  });
}

export const WORK_CENTERS_CHANGED_EVENT = 'work-centers:changed';

export function notifyWorkCentersChanged(_businessId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(WORK_CENTERS_CHANGED_EVENT));
    notifyDeliveryActiveStoreChanged();
  } catch {
    /* ignore */
  }
}

/** Persiste PDV activo del negocio (misma clave que Ops/TPV para no romper sesión). */
export function selectActivePointOfSale(
  business: Business | null | undefined,
  dataUserId: string,
  pdvId: string,
): void {
  const businessId = String(business?.business_id || business?.id || '').trim();
  if (!businessId || !dataUserId || !pdvId.trim()) return;
  writeDeliveryOpsSelectedPdvId(businessId, dataUserId, pdvId.trim());
  notifyDeliveryActiveStoreChanged();
}

const PDV_SESSION_PREFIX = 'vertial.compraventa.pdvSession:';

export function markPdvSessionConfirmed(userId: string): void {
  if (!userId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${PDV_SESSION_PREFIX}${userId}`, '1');
  } catch {
    /* ignore */
  }
}
