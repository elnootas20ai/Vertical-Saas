import {
  createBrandRequest,
  listBrandsRequest,
  updateBrandRequest,
  type Brand,
} from './brandApi';
import {
  DEFAULT_COMMERCIAL_BRAND_NAME,
  isDefaultBrandNamePlaceholder,
  isDefaultCommercialBrand,
} from './brandUtils';
import {
  dedupePointsOfSale,
  ensureDeliveryPdvForWorkCenter,
  listPointsOfSaleRequest,
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

/**
 * Oculta Sala (`/saas/sala`) y la pantalla clásica de pedidos (`/saas/delivery`)
 * en menú y accesos del centro operativo hasta la nueva UX.
 */
export const DELIVERY_LEGACY_SCREENS_HIDDEN = true;

export function filterDeliverySidebarItemIds(itemIds: readonly string[]): string[] {
  if (!DELIVERY_LEGACY_SCREENS_HIDDEN) return [...itemIds];
  return itemIds.filter((id) => id !== 'sala' && id !== 'delivery');
}

import { ONBOARDING_DATA_LEGACY_KEY, onboardingDataStorageKey } from './onboardingStorage';

/** Tipo de negocio guardado en onboarding (local) antes de que el user en API esté al día. */
export function readStoredOnboardingBusinessType(userId?: string | null): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const key = userId ? onboardingDataStorageKey(String(userId)) : ONBOARDING_DATA_LEGACY_KEY;
    let raw = localStorage.getItem(key);
    if (!raw && userId) {
      raw = localStorage.getItem(ONBOARDING_DATA_LEGACY_KEY);
    }
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

/** Id estable de la empresa activa (selector superior). */
export function resolveBusinessScopeId(business?: Business | null): string {
  return String(business?.business_id || (business as { id?: string } | null)?.id || '').trim();
}

/**
 * Centros de trabajo visibles solo para la empresa activa.
 * Si ya hay centros con `businessId`, cada empresa ve solo los suyos.
 * Si ninguno tiene `businessId` (datos antiguos), se muestran todos (comportamiento legacy).
 */
export function filterWorkCentersForBusinessScope(
  workCenters: WorkCenter[],
  businessId: string,
): WorkCenter[] {
  const bid = String(businessId || '').trim();
  if (!bid) return workCenters;

  const scoped = workCenters.filter((wc) => String(wc.businessId || '').trim() === bid);
  const anyScoped = workCenters.some((wc) => String(wc.businessId || '').trim());
  if (scoped.length > 0) {
    const legacyRetail = workCenters.filter(
      (wc) =>
        !wc.deletedAt &&
        !String(wc.businessId || '').trim() &&
        (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
    );
    const merged = new Map<string, WorkCenter>();
    for (const wc of [...scoped, ...legacyRetail]) merged.set(wc._id, wc);
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  if (!anyScoped) return workCenters;
  // Empresa sin centros con businessId propio: mostrar legacy retail (datos antiguos).
  const legacyOnly = workCenters.filter(
    (wc) =>
      !wc.deletedAt &&
      !String(wc.businessId || '').trim() &&
      (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
  );
  if (legacyOnly.length > 0) {
    return [...legacyOnly].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  return [];
}

/** Solo centros con `businessId` de esta empresa (sin mezclar legacy ni otras empresas). */
export function workCentersStrictlyForBusiness(
  workCenters: WorkCenter[],
  businessId: string,
): WorkCenter[] {
  const bid = String(businessId || '').trim();
  if (!bid) return [];
  return workCenters.filter((wc) => String(wc.businessId || '').trim() === bid);
}

/** PDV de caja enlazados a centros de la empresa activa (evita mezclar tiendas entre empresas). */
export function filterPointsOfSaleForWorkCenters(
  pointsOfSale: PointOfSale[],
  workCenters: WorkCenter[],
): PointOfSale[] {
  const wcIds = new Set(workCenters.map((wc) => String(wc._id || '').trim()).filter(Boolean));
  if (wcIds.size === 0) return [];
  return pointsOfSale.filter((p) => {
    const wcId = String(p.workCenterId || '').trim();
    return wcId && wcIds.has(wcId);
  });
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

  const businessId = resolveBusinessScopeId(business);

  const [allWorkCenters, rawPdvs] = await Promise.all([
    listWorkCentersForDelivery(dataUserId, business ?? null),
    listPointsOfSaleRequest(dataUserId).catch(() => [] as PointOfSale[]),
  ]);

  const workCenters = filterWorkCentersForBusinessScope(allWorkCenters, businessId);

  // Lectura rápida: no sincronizar PDV↔centro en cada listado (541+ PDV bloqueaba el sidebar).
  // La sincronización ocurre al crear/editar centro (SalesPointsTab, ensureDeliveryPdvForWorkCenter).
  let pointsOfSale = dedupePointsOfSale(rawPdvs);
  pointsOfSale = filterPointsOfSaleForWorkCenters(pointsOfSale, workCenters);

  return { dataUserId, workCenters, pointsOfSale };
}

/**
 * Marca por defecto de la empresa + enlace a tiendas retail (alta delivery).
 * Idempotente: no duplica «General» ni re-vincula tiendas ya asignadas.
 */
export async function ensureDeliveryDefaultBrand(
  businessId: string,
  options?: { workCenterId?: string; preferredName?: string },
): Promise<Brand | null> {
  const bid = String(businessId || '').trim();
  if (!bid) return null;

  let brands = await listBrandsRequest(bid).catch(() => [] as Brand[]);
  let defaultBrand = brands.find((b) => isDefaultCommercialBrand(b)) ?? null;

  if (!defaultBrand) {
    const preferred = String(options?.preferredName || '').trim();
    defaultBrand = await createBrandRequest(bid, {
      name: preferred || DEFAULT_COMMERCIAL_BRAND_NAME,
      description: '',
      active: true,
      isDefault: true,
      primaryColor: '#6366F1',
      salesPointIds: [],
    });
    brands = [defaultBrand, ...brands];
  } else if (options?.preferredName) {
    const preferred = options.preferredName.trim();
    if (preferred && isDefaultBrandNamePlaceholder(defaultBrand.name)) {
      defaultBrand = await updateBrandRequest(bid, {
        ...defaultBrand,
        name: preferred,
      });
    }
  }

  const wcId = String(options?.workCenterId || '').trim();
  if (wcId) {
    const current = new Set((defaultBrand.salesPointIds ?? []).map((id) => String(id).trim()).filter(Boolean));
    if (!current.has(wcId)) {
      current.add(wcId);
      defaultBrand = await updateBrandRequest(bid, {
        ...defaultBrand,
        salesPointIds: Array.from(current),
      });
    }
  }

  return defaultBrand;
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

  const state = await loadDeliveryStores(authUser, business);
  const active = state.pointsOfSale.filter((p) => p.active !== false).length;
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

  await bootstrapRetailStoreAfterCreate(authUser, business, {
    workCenter: wc,
    pointOfSale: pdv,
    storeName: trimmedName,
  });

  return { workCenter: wc, pointOfSale: pdv };
}

/** Mismo post-alta para PDV 1, 2, 3…: tienda activa + marca por defecto enlazada. */
export async function bootstrapRetailStoreAfterCreate(
  authUser: AuthLike,
  business: Business | null | undefined,
  payload: {
    workCenter: WorkCenter;
    pointOfSale: PointOfSale;
    storeName?: string;
  },
): Promise<void> {
  const dataUserId = resolveDeliveryDataUserId(authUser, business);
  const { workCenter, pointOfSale, storeName } = payload;
  const businessId = String(business?.business_id || business?.id || '').trim();

  if (businessId && dataUserId && pointOfSale.active !== false) {
    selectDeliveryPointOfSale(business, dataUserId, pointOfSale._id);
  }

  if (businessId) {
    try {
      await ensureDeliveryDefaultBrand(businessId, {
        workCenterId: workCenter._id,
        preferredName: storeName?.trim() || workCenter.name,
      });
    } catch {
      /* la marca se puede completar en Ajustes → Marca */
    }
  }

  notifyDeliveryWorkCentersChanged();
  if (dataUserId) markDeliveryPdvSessionConfirmed(dataUserId);
}

export const DELIVERY_WORK_CENTERS_CHANGED = 'work-centers:changed';
export const DELIVERY_CATALOG_CHANGED = 'catalog:changed';

export function notifyDeliveryWorkCentersChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DELIVERY_WORK_CENTERS_CHANGED));
    notifyDeliveryActiveStoreChanged();
  } catch {
    /* ignore */
  }
}

export function notifyDeliveryCatalogChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DELIVERY_CATALOG_CHANGED));
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
