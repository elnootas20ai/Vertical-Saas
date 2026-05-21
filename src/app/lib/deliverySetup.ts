import {
  dedupePointsOfSale,
  ensureDeliveryPdvForWorkCenter,
  listPointsOfSaleRequest,
  mergePointsOfSaleWithRetailWorkCenters,
  suggestNextPdvDisplayName,
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

export { notifyDeliveryActiveStoreChanged } from './deliveryOpsPdvSelection.js';

/** @deprecated Pantalla obligatoria desactivada; PDV desde Ajustes → Empresa → Tiendas. */
export const DELIVERY_FIRST_PDV_PATH = '/saas/settings/tienda';

/** Tras crear PDV en sesión (evita parpadeos al revalidar listas). */
export const DELIVERY_PDV_SESSION_KEY = 'vertial_delivery_has_pdv';

const ONBOARDING_STORAGE_KEY = 'vertial_onboarding_data';

/** Tipo de negocio guardado en onboarding (local) antes de que el user en API esté al día. */
export function readStoredOnboardingBusinessType(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { businessType?: string };
    const bt = String(parsed?.businessType || '').trim();
    return bt || null;
  } catch {
    return null;
  }
}

export function resolveDeliveryBusinessType(
  sources?: {
    business?: Business | null;
    businesses?: Business[];
    userOnboarding?: { businessType?: string } | null;
  },
): string {
  return (
    String(sources?.business?.businessType || '').trim() ||
    String(sources?.userOnboarding?.businessType || '').trim() ||
    String(sources?.businesses?.[0]?.businessType || '').trim() ||
    readStoredOnboardingBusinessType() ||
    ''
  );
}

export function isDeliveryAccountFromSources(
  sources?: {
    business?: Business | null;
    businesses?: Business[];
    userOnboarding?: { businessType?: string } | null;
  },
): boolean {
  return isDeliveryBusinessType(resolveDeliveryBusinessType(sources));
}

/** Tras registro/onboarding: mismo destino que el resto de verticales. */
export function getPostAuthSaasEntryPath(_businessType?: string | null, _hasPdv = false): string {
  return '/saas/dashboard';
}

function deliveryPdvSessionStorageKey(userId: string): string {
  return `${DELIVERY_PDV_SESSION_KEY}:${userId}`;
}

export function markDeliveryPdvSessionConfirmed(userId: string): void {
  if (!userId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(deliveryPdvSessionStorageKey(userId), '1');
    sessionStorage.removeItem(DELIVERY_PDV_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function peekDeliveryPdvSessionConfirmed(userId?: string | null): boolean {
  if (!userId || typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(deliveryPdvSessionStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function clearDeliveryPdvSessionForUser(userId: string): void {
  if (!userId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(deliveryPdvSessionStorageKey(userId));
  } catch {
    /* ignore */
  }
}

/** Limpia flags de PDV (p. ej. al cerrar sesión). */
export function clearAllDeliveryPdvSessionFlags(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const prefix = `${DELIVERY_PDV_SESSION_KEY}`;
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && (key === DELIVERY_PDV_SESSION_KEY || key.startsWith(`${prefix}:`))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated Usar clearAllDeliveryPdvSessionFlags */
export function clearDeliveryPdvSessionConfirmed(): void {
  clearAllDeliveryPdvSessionFlags();
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

/**
 * Comprobación rápida para el gate (sin merge auto-crear PDV).
 * El merge solo debe usarse al cargar listas en UI, no en cada redirect.
 */
export async function countDeliveryPointsOfSale(
  authUser: AuthLike,
  business?: Business | null,
): Promise<number> {
  const dataUserId = resolveDeliveryDataUserId(authUser, business);
  if (!dataUserId) return 0;

  const pdvs = await listPointsOfSaleRequest(dataUserId).catch(() => [] as PointOfSale[]);
  const active = pdvs.filter((p) => p.active !== false).length;
  if (active > 0) {
    markDeliveryPdvSessionConfirmed(dataUserId);
    return active;
  }
  if (peekDeliveryPdvSessionConfirmed(dataUserId)) return 1;
  return 0;
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

  const existingPdvs = await listPointsOfSaleRequest(dataUserId).catch(() => []);
  const existingCodes = existingPdvs.map((p) => String(p.code || '').trim()).filter(Boolean);
  const existingNames = existingPdvs.map((p) => String(p.name || '').trim()).filter(Boolean);
  const displayName = suggestNextPdvDisplayName(trimmedName, existingNames, existingCodes);

  const wc = await createWorkCenter(dataUserId, {
    name: displayName,
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
  markDeliveryPdvSessionConfirmed(dataUserId);

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
