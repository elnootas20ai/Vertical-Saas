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
import { clearRetailScopeCache } from './retailScopeCache';
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

/**
 * ¿Cargar tiendas/PDV delivery? Sí si la cuenta es delivery o hay tablet TPV vinculada a esta empresa.
 * Evita que un businessType mal puesto (p. ej. events) oculte códigos tablet y el TPV operativo.
 */
export function shouldUseDeliveryStores(
  sources?: {
    business?: Business | null;
    businesses?: Business[];
    userOnboarding?: { businessType?: string } | null;
  },
  options?: {
    tabletBusinessId?: string | null;
    hasDeliveryPdvs?: boolean;
  },
): boolean {
  if (isDeliveryAccountFromSources(sources)) return true;
  if (options?.hasDeliveryPdvs) return true;
  const bizId = resolveBusinessScopeId(sources?.business);
  const tabletBid = normalizeBusinessScopeId(options?.tabletBusinessId);
  if (bizId && tabletBid && bizId === tabletBid) return true;
  return false;
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

/** Quita prefijo Couch `business:` para comparar IDs de forma consistente. */
export function normalizeBusinessScopeId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

/** Id estable de la empresa activa (selector superior). */
export function resolveBusinessScopeId(business?: Business | null): string {
  return normalizeBusinessScopeId(
    business?.business_id || (business as { id?: string } | null)?.id,
  );
}

/** Lee `businessId` del documento (también alias legacy `business_id`). */
export function readWorkCenterBusinessId(wc: WorkCenter | Record<string, unknown>): string {
  const raw = wc as Record<string, unknown>;
  return normalizeBusinessScopeId(String(raw.businessId || raw.business_id || ''));
}

/**
 * Centros visibles solo para la empresa activa (`businessId` exacto).
 * Con 2+ empresas en la cuenta nunca se mezclan tiendas sin etiquetar ni de otra empresa.
 */
export function filterWorkCentersForBusinessScope(
  workCenters: WorkCenter[],
  businessId: string,
  options?: { accountBusinessCount?: number },
): WorkCenter[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];

  const active = workCenters.filter((wc) => !wc.deletedAt);
  const mine = active.filter((wc) => readWorkCenterBusinessId(wc) === bid);
  const accountN = options?.accountBusinessCount;

  if (accountN === undefined) {
    return mine.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  if (accountN >= 2) {
    return mine.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  if (accountN === 1) {
    const isRetail = (wc: WorkCenter) =>
      wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';
    const legacy = active.filter((wc) => !readWorkCenterBusinessId(wc) && isRetail(wc));
    const merged = new Map<string, WorkCenter>();
    for (const wc of [...mine, ...legacy]) merged.set(wc._id, wc);
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  return mine.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Una tienda retail por nombre dentro de la misma empresa (evita 3× «prueba2» en el menú).
 * Se conserva la más antigua (la original).
 */
export function dedupeRetailWorkCentersForBusiness(workCenters: WorkCenter[]): WorkCenter[] {
  const isRetail = (wc: WorkCenter) =>
    wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';
  const retail: WorkCenter[] = [];
  const other: WorkCenter[] = [];
  for (const wc of workCenters) {
    if (isRetail(wc)) retail.push(wc);
    else other.push(wc);
  }

  const byKey = new Map<string, WorkCenter>();
  for (const wc of retail) {
    const bid = readWorkCenterBusinessId(wc);
    const nameKey = String(wc.name || '')
      .trim()
      .toLowerCase();
    const key = `${bid}::${nameKey || wc._id}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, wc);
      continue;
    }
    const ta = new Date(prev.createdAt || 0).getTime();
    const tb = new Date(wc.createdAt || 0).getTime();
    if (tb < ta || (tb === ta && wc._id < prev._id)) {
      byKey.set(key, wc);
    }
  }

  return [...other, ...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Solo centros con `businessId` de esta empresa (sin mezclar legacy ni otras empresas). */
export function workCentersStrictlyForBusiness(
  workCenters: WorkCenter[],
  businessId: string,
): WorkCenter[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];
  return workCenters.filter((wc) => readWorkCenterBusinessId(wc) === bid);
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

export type LoadDeliveryStoresOptions = {
  /** Tras crear/editar un PDV ya enlazado: evita re-sincronizar todos los centros (muy lento). */
  skipPdvMerge?: boolean;
  /** Cuántas empresas tiene la cuenta (para no mostrar todas las tiendas en cada una). */
  accountBusinessCount?: number;
  /** Centro asignado al trabajador (invitación): asegurar PDV aunque falte en el listado filtrado. */
  priorityWorkCenterId?: string;
};

/**
 * Corrige tiendas retail con `businessId` antiguo pero PDV activo y mismo nombre que la empresa.
 * Evita que modomio (u otra) quede sin tienda tras recrear la empresa con otro UUID.
 */
export function alignRetailWorkCentersToActiveBusiness(
  workCenters: WorkCenter[],
  business: Business | null | undefined,
  pointsOfSale: PointOfSale[],
): WorkCenter[] {
  const bid = resolveBusinessScopeId(business);
  const bizName = String(business?.name || '').trim().toLowerCase();
  if (!bid || !bizName) return workCenters;

  const linkedWcIds = new Set(
    pointsOfSale
      .filter((p) => p.active !== false && p.workCenterId)
      .map((p) => String(p.workCenterId).trim())
      .filter(Boolean),
  );

  return workCenters.map((wc) => {
    const isRetail =
      wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';
    if (!isRetail || wc.deletedAt) return wc;
    if (readWorkCenterBusinessId(wc) === bid) return wc;
    if (!linkedWcIds.has(String(wc._id || '').trim())) return wc;
    const wcName = String(wc.name || '').trim().toLowerCase();
    if (wcName !== bizName) return wc;
    return { ...wc, businessId: bid, business_id: bid };
  });
}

/** Fuente única: centros de trabajo + PDV de caja enlazados y deduplicados. */
export async function loadDeliveryStores(
  authUser: AuthLike,
  business?: Business | null,
  options?: LoadDeliveryStoresOptions,
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

  const scopedWorkCenters = alignRetailWorkCentersToActiveBusiness(
    allWorkCenters,
    business ?? null,
    dedupePointsOfSale(rawPdvs),
  );

  let workCenters = filterWorkCentersForBusinessScope(scopedWorkCenters, businessId, {
    accountBusinessCount: options?.accountBusinessCount,
  });
  workCenters = dedupeRetailWorkCentersForBusiness(workCenters);

  let pointsOfSale = options?.skipPdvMerge
    ? dedupePointsOfSale(rawPdvs)
    : await mergePointsOfSaleWithRetailWorkCenters(dataUserId, dedupePointsOfSale(rawPdvs), {
        business: business ?? null,
      });
  pointsOfSale = dedupePointsOfSale(filterPointsOfSaleForWorkCenters(pointsOfSale, workCenters));

  return { dataUserId, workCenters, pointsOfSale };
}

/**
 * Tiendas + PDV de caja para TPV: merge automático y enlaza PDV faltantes por tienda retail activa.
 */
export async function loadTpvPointsOfSaleForBusiness(
  authUser: AuthLike,
  business?: Business | null,
  options?: LoadDeliveryStoresOptions,
): Promise<DeliveryStoresState> {
  const state = await loadDeliveryStores(authUser, business, options);
  if (!state.dataUserId) return state;

  const retail = state.workCenters.filter(
    (wc) =>
      wc.active !== false &&
      !wc.deletedAt &&
      (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
  );

  let pointsOfSale = [...state.pointsOfSale];
  if (pointsOfSale.length === 0) {
    pointsOfSale = dedupePointsOfSale(
      await listPointsOfSaleRequest(state.dataUserId).catch(() => [] as PointOfSale[]),
    ).filter((p) => p.active !== false);
  }
  for (const wc of retail) {
    const ensured = await ensureDeliveryPdvForWorkCenter(state.dataUserId, wc, {
      business: business ?? null,
      existingPdvs: pointsOfSale,
    });
    if (!ensured) continue;
    const idx = pointsOfSale.findIndex((p) => p._id === ensured._id);
    if (idx >= 0) pointsOfSale[idx] = ensured;
    else pointsOfSale.push(ensured);
    pointsOfSale = dedupePointsOfSale(pointsOfSale);
  }

  const beforeScopeFilter = dedupePointsOfSale(pointsOfSale);
  pointsOfSale = dedupePointsOfSale(
    filterPointsOfSaleForWorkCenters(beforeScopeFilter, state.workCenters),
  );
  if (pointsOfSale.length === 0 && beforeScopeFilter.length > 0) {
    pointsOfSale = beforeScopeFilter.filter((p) => p.active !== false);
  }

  const priorityWcId = String(options?.priorityWorkCenterId || '').trim();
  if (priorityWcId) {
    const priorityWc =
      state.workCenters.find((wc) => wc._id === priorityWcId) ||
      retail.find((wc) => wc._id === priorityWcId);
    if (priorityWc) {
      const ensured = await ensureDeliveryPdvForWorkCenter(state.dataUserId, priorityWc, {
        business: business ?? null,
        existingPdvs: pointsOfSale,
      });
      if (ensured) {
        const idx = pointsOfSale.findIndex((p) => p._id === ensured._id);
        if (idx >= 0) pointsOfSale[idx] = ensured;
        else pointsOfSale.push(ensured);
        pointsOfSale = dedupePointsOfSale(pointsOfSale);
      }
    }
  }

  return { ...state, pointsOfSale };
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
    void ensureDeliveryDefaultBrand(businessId, {
      workCenterId: workCenter._id,
      preferredName: storeName?.trim() || workCenter.name,
    })
      .then(() => {
        notifyDeliveryBrandsChanged();
      })
      .catch(() => {
        /* la marca se puede completar en Ajustes → Marca */
      });
  }

  notifyDeliveryWorkCentersChanged(businessId);
  if (dataUserId) markDeliveryPdvSessionConfirmed(dataUserId);
}

export const DELIVERY_WORK_CENTERS_CHANGED = 'work-centers:changed';
export const DELIVERY_CATALOG_CHANGED = 'catalog:changed';
export const DELIVERY_BRANDS_CHANGED = 'brands:changed';

/** Invalida caché de tiendas en sesión (sidebar / scope) tras alta o edición. */
export function clearDeliveryStoresSessionCache(businessId?: string): void {
  clearRetailScopeCache(businessId);
}

export function notifyDeliveryWorkCentersChanged(businessId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    clearDeliveryStoresSessionCache(businessId);
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

export function notifyDeliveryBrandsChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DELIVERY_BRANDS_CHANGED));
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
