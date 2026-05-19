import {
  dedupePointsOfSale,
  ensureDeliveryPdvForWorkCenter,
  listPointsOfSaleRequest,
  mergePointsOfSaleWithRetailWorkCenters,
  type PointOfSale,
} from './deliveryApi';
import type { Business } from './businessApi';
import { resolveBusinessDataUserId } from './tenantUserId';
import {
  createWorkCenter,
  listWorkCentersForDelivery,
  type WorkCenter,
} from './workCentersApi';
import {
  notifyDeliveryActiveStoreChanged,
  writeDeliveryOpsSelectedPdvId,
} from './deliveryOpsPdvSelection';

export const DELIVERY_FIRST_PDV_PATH = '/saas/delivery/primer-pdv';

export const DELIVERY_PDV_EXEMPT_PATHS = [
  DELIVERY_FIRST_PDV_PATH,
  '/saas/suspended',
  '/saas/billing',
  '/saas/help',
] as const;

export function isDeliveryPdvExemptPath(pathname: string): boolean {
  return DELIVERY_PDV_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isDeliveryBusinessType(businessType?: string | null): boolean {
  return String(businessType || '').trim() === 'delivery';
}

type AuthLike = { user_id?: string; id?: string } | null | undefined;

export function resolveDeliveryDataUserId(
  authUser: AuthLike,
  business?: Business | null,
): string {
  return resolveBusinessDataUserId(authUser, business ?? null);
}

export interface DeliveryStoresState {
  dataUserId: string;
  workCenters: WorkCenter[];
  pointsOfSale: PointOfSale[];
}

/** Fuente única: centros de trabajo + PDV de caja enlazados y deduplicados. */
export async function loadDeliveryStores(
  authUser: AuthLike,
  business?: Business | null,
): Promise<DeliveryStoresState> {
  const dataUserId = resolveDeliveryDataUserId(authUser, business);
  if (!dataUserId) {
    return { dataUserId: '', workCenters: [], pointsOfSale: [] };
  }

  const [workCenters, rawPdvs] = await Promise.all([
    listWorkCentersForDelivery(dataUserId, business ?? null),
    listPointsOfSaleRequest(dataUserId).catch(() => [] as PointOfSale[]),
  ]);

  let pointsOfSale = await mergePointsOfSaleWithRetailWorkCenters(dataUserId, rawPdvs, {
    business: business ?? null,
  });
  pointsOfSale = dedupePointsOfSale(pointsOfSale).filter((p) => p.active !== false);

  return { dataUserId, workCenters, pointsOfSale };
}

export async function countDeliveryPointsOfSale(
  authUser: AuthLike,
  business?: Business | null,
): Promise<number> {
  const { pointsOfSale } = await loadDeliveryStores(authUser, business);
  return pointsOfSale.length;
}

export interface CreateRetailStorePayload {
  name: string;
  address: string;
  city?: string;
  province?: string;
  postalCode?: string;
  phone?: string;
  businessId?: string;
}

/** Crea centro de trabajo + PDV de caja + selección activa (un solo flujo). */
export async function setupDeliveryRetailStore(
  authUser: AuthLike,
  business: Business | null | undefined,
  payload: CreateRetailStorePayload,
): Promise<{ workCenter: WorkCenter; pointOfSale: PointOfSale }> {
  const dataUserId = resolveDeliveryDataUserId(authUser, business);
  if (!dataUserId) {
    throw new Error('No hay usuario de datos para crear el punto de venta');
  }

  const trimmedName = payload.name.trim();
  const trimmedAddress = payload.address.trim();
  if (!trimmedName) throw new Error('El nombre del local es obligatorio');
  if (trimmedAddress.length < 5) {
    throw new Error('Indica una dirección completa (mínimo 5 caracteres)');
  }

  const wc = await createWorkCenter(dataUserId, {
    name: trimmedName,
    centerType: 'punto_de_venta',
    ownership: 'propiedad',
    address: trimmedAddress,
    city: payload.city?.trim() || undefined,
    province: payload.province?.trim() || undefined,
    postalCode: payload.postalCode?.trim() || undefined,
    phone: payload.phone?.trim() || undefined,
    active: true,
    expectedStaffCount: 3,
    businessId: payload.businessId,
  });

  const pdv = await ensureDeliveryPdvForWorkCenter(dataUserId, wc, {
    business: business ?? null,
  });
  if (!pdv) {
    throw new Error('No se pudo crear el punto de venta de caja para este local');
  }

  const businessId = String(business?.business_id || business?.id || '').trim();
  if (businessId) {
    writeDeliveryOpsSelectedPdvId(businessId, dataUserId, pdv._id);
    notifyDeliveryActiveStoreChanged();
  }

  notifyDeliveryWorkCentersChanged();

  return { workCenter: wc, pointOfSale: pdv };
}

export const DELIVERY_WORK_CENTERS_CHANGED = 'work-centers:changed';

export function notifyDeliveryWorkCentersChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DELIVERY_WORK_CENTERS_CHANGED));
  } catch {
    /* ignore */
  }
}

export function selectDeliveryPointOfSale(
  business: Business | null | undefined,
  dataUserId: string,
  pdvId: string,
): void {
  const businessId = String(business?.business_id || business?.id || '').trim();
  if (!businessId || !dataUserId || !pdvId.trim()) return;
  writeDeliveryOpsSelectedPdvId(businessId, dataUserId, pdvId.trim());
  notifyDeliveryActiveStoreChanged();
}
