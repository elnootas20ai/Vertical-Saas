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
import { resolveBrandPlaceholderUrl } from './brandPlaceholders';
import {
  dedupePointsOfSale,
  ensureDeliveryPdvForWorkCenter,
  ensureTabletCodesForPointsOfSale,
  listPointsOfSaleRequest,
  mergePointsOfSaleWithRetailWorkCenters,
  suggestNextPdvDisplayName,
  type PointOfSale,
} from './deliveryApi';
import type { Business } from './businessApi';
import { resolveBusinessDataUserId } from './tenantUserId';
import { isEventsBusinessType } from './deliveryOpsTypes';
import {
  createWorkCenter,
  isTemporaryEventWorkCenter,
  listWorkCentersForDelivery,
  updateWorkCenter,
  type WorkCenter,
} from './workCentersApi';
import { clearTpvCatalogCache } from './tpvCatalogCache';
import {
  notifyDeliveryActiveStoreChanged,
  writeDeliveryOpsSelectedPdvId,
} from './deliveryOpsPdvSelection';

export { notifyDeliveryActiveStoreChanged } from './deliveryOpsPdvSelection.js';

/** @deprecated Pantalla obligatoria desactivada; PDV desde Ajustes → Empresa → Tiendas. */
export const DELIVERY_FIRST_PDV_PATH = '/saas/settings/tienda';

/** Tras crear PDV en sesión (evita parpadeos al revalidar listas). */
export const DELIVERY_PDV_SESSION_KEY = 'vertial_delivery_has_pdv';

/** @deprecated Pantalla clásica `/saas/delivery` — redirige a centro operativo. */
export const DELIVERY_LEGACY_PATH = '/saas/delivery';
export const DELIVERY_OPS_PATH = '/saas/delivery-ops';

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

/** Misma lógica que Ajustes → Tienda y TPV (evita checklist desincronizado). */
export function snapshotDeliveryStoreActivation(
  state: Pick<DeliveryStoresState, 'workCenters' | 'pointsOfSale'>,
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
    // Con tienda retail el PDV y código tablet se crean solos (sin «Activar caja»).
    hasActivePdv: storeReady && activePdvs.length > 0,
  };
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

export function knownBusinessIdsFromList(
  businesses: Array<{ business_id?: string; id?: string } | null | undefined>,
): string[] {
  const ids = new Set<string>();
  for (const b of businesses) {
    const id = resolveBusinessScopeId(b as Business | null);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Lee `businessId` del documento (también alias legacy `business_id`). */
export function readWorkCenterBusinessId(wc: WorkCenter | Record<string, unknown>): string {
  const raw = wc as Record<string, unknown>;
  return normalizeBusinessScopeId(String(raw.businessId || raw.business_id || ''));
}

/**
 * Centros visibles solo para la empresa activa (`businessId` exacto).
 * Si la empresa tiene oficinas u otros centros pero ninguna tienda retail, incluye tiendas huérfanas.
 */
export function filterWorkCentersForBusinessScope(
  workCenters: WorkCenter[],
  businessId: string,
  options?: { accountBusinessCount?: number; includeTemporaryEventPdvs?: boolean },
): WorkCenter[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];

  const active = workCenters.filter((wc) => !wc.deletedAt);
  const isRetail = (wc: WorkCenter) =>
    wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';

  const mine = active.filter((wc) => readWorkCenterBusinessId(wc) === bid);
  const mineRetail = mine.filter(isRetail);
  const accountN = options?.accountBusinessCount;

  let result: WorkCenter[];
  if (accountN === undefined) {
    result = mine.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } else if (mineRetail.length === 0) {
    // Multi-empresa: no absorber tiendas huérfanas (bodegeta u otra vertical) en el scope activo.
    if (typeof accountN === 'number' && accountN > 1) {
      result = mine.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    } else {
      const legacyRetail = active.filter((wc) => !readWorkCenterBusinessId(wc) && isRetail(wc));
      const merged = new Map<string, WorkCenter>();
      for (const wc of mine) merged.set(wc._id, wc);
      for (const wc of legacyRetail) merged.set(wc._id, wc);
      result = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }
  } else {
    result = mine.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // PDV temporales de eventos solo en /eventos/tpv (no sidebar / ajustes / TPV general).
  if (!options?.includeTemporaryEventPdvs) {
    result = result.filter((wc) => !isTemporaryEventWorkCenter(wc));
  }
  return result;
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
  return workCenters
    .filter((wc) => readWorkCenterBusinessId(wc) === bid)
    .filter((wc) => !isTemporaryEventWorkCenter(wc));
}

function isRetailWorkCenterType(wc: WorkCenter): boolean {
  return wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';
}

/** Etiqueta tiendas huérfanas (sin businessId) a la empresa activa cuando aún no tiene ninguna. */
export async function tagOrphanRetailWorkCentersForBusiness(
  businessId: string,
  workCenters: WorkCenter[],
): Promise<WorkCenter[]> {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return workCenters;

  const hasTaggedRetail = workCenters.some(
    (wc) => !wc.deletedAt && isRetailWorkCenterType(wc) && readWorkCenterBusinessId(wc) === bid,
  );
  if (hasTaggedRetail) return workCenters;

  const orphans = workCenters.filter(
    (wc) => !wc.deletedAt && isRetailWorkCenterType(wc) && !readWorkCenterBusinessId(wc),
  );
  if (orphans.length === 0 || orphans.length > 8) return workCenters;

  const next = [...workCenters];
  for (const wc of orphans) {
    try {
      const patched = await updateWorkCenter({ ...wc, businessId: bid });
      const idx = next.findIndex((row) => row._id === wc._id);
      if (idx >= 0) next[idx] = patched;
    } catch {
      const idx = next.findIndex((row) => row._id === wc._id);
      if (idx >= 0) next[idx] = { ...wc, businessId: bid };
    }
  }
  return next;
}

/** PDV de caja enlazados a centros de la empresa activa (evita mezclar tiendas entre empresas). */
/**
 * PDV enlazados a tiendas del scope.
 * Si un PDV es de la empresa activa pero su workCenterId está roto/huérfano,
 * se conserva igual (si no, Modomio “desaparece” del dashboard con pedidos reales).
 */
export function filterPointsOfSaleForWorkCenters(
  pointsOfSale: PointOfSale[],
  workCenters: WorkCenter[],
  options?: { businessId?: string | null; accountBusinessCount?: number },
): PointOfSale[] {
  const wcIds = new Set(workCenters.map((wc) => String(wc._id || '').trim()).filter(Boolean));
  const businessId = normalizeBusinessScopeId(options?.businessId);
  const multiBiz =
    typeof options?.accountBusinessCount === 'number' && options.accountBusinessCount > 1;
  const pdvBusinessId = (p: PointOfSale) =>
    normalizeBusinessScopeId(
      String((p as PointOfSale & { business_id?: string }).business_id || p.businessId || ''),
    );

  if (wcIds.size === 0) {
    // Sin tiendas en scope: PDV de la empresa; legacy sin etiqueta solo en mono-empresa.
    if (!businessId) return [];
    const tagged = pointsOfSale.filter((p) => pdvBusinessId(p) === businessId);
    if (tagged.length > 0) return tagged;
    if (multiBiz) return [];
    return pointsOfSale.filter((p) => !pdvBusinessId(p));
  }

  return pointsOfSale.filter((p) => {
    const wcId = String(p.workCenterId || '').trim();
    const pBid = pdvBusinessId(p);
    // Otra empresa: nunca (aunque el WC esté en el scope por error).
    if (businessId && pBid && pBid !== businessId) return false;
    if (businessId && pBid === businessId) return true;
    if (wcId && wcIds.has(wcId)) return true;
    // Legacy sin empresa ni WC: solo mono-empresa (evita bodegeta en delivery).
    if (businessId && !pBid && !wcId) return !multiBiz;
    return false;
  });
}

export { isRetailWorkCenter, sanitizeRetailScopeSnapshot } from './retailScopeSanitize';

export type LoadDeliveryStoresOptions = {
  /** Tras crear/editar un PDV ya enlazado: evita re-sincronizar todos los centros (muy lento). */
  skipPdvMerge?: boolean;
  /** Incluir PDV inactivos (p. ej. tienda desactivada) — necesario en Ajustes → Tiendas. */
  includeInactivePdvs?: boolean;
  /** Cuántas empresas tiene la cuenta (para no mostrar todas las tiendas en cada una). */
  accountBusinessCount?: number;
  /** Ids de empresas de la cuenta (reasignar tienda única mal etiquetada). */
  knownBusinessIds?: string[];
  /** Centro asignado al trabajador (invitación): asegurar PDV aunque falte en el listado filtrado. */
  priorityWorkCenterId?: string;
  /** TPV: genera códigos tablet si faltan. Ajustes/listados: false para no bloquear la UI. */
  ensureTabletCodes?: boolean;
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

/**
 * Empresa sin tienda retail: recupera tiendas mal etiquetadas (UUID viejo al recrear empresa)
 * o la tienda única de la cuenta. Reasigna en memoria para Ajustes / sidebar / TPV.
 */
export function rescueRetailForBusinessWithoutStores(
  workCenters: WorkCenter[],
  businessId: string,
  knownBusinessIds: string[],
): WorkCenter[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return workCenters;

  const isRetail = (wc: WorkCenter) =>
    !wc.deletedAt && (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen');

  if (workCenters.some((wc) => isRetail(wc) && readWorkCenterBusinessId(wc) === bid)) {
    return workCenters;
  }

  const legacyRetail = workCenters.filter((wc) => isRetail(wc) && !readWorkCenterBusinessId(wc));
  if (legacyRetail.length > 0) return workCenters;

  const known = new Set(knownBusinessIds.map(normalizeBusinessScopeId).filter(Boolean));
  const allRetail = workCenters.filter(isRetail);
  if (allRetail.length === 0) return workCenters;

  const stamp = (wc: WorkCenter): WorkCenter => ({ ...wc, businessId: bid, business_id: bid });

  // Tienda única de la cuenta (aunque esté etiquetada a otra empresa viva o a un UUID muerto).
  if (allRetail.length === 1) {
    const only = allRetail[0];
    const wb = readWorkCenterBusinessId(only);
    if (!wb || wb === bid) return workCenters;
    return workCenters.map((wc) => (wc._id === only._id ? stamp(wc) : wc));
  }

  // Varias tiendas: solo reclamar las etiquetadas a un businessId que ya no existe en la cuenta
  // (empresa recreada / UUID viejo). No tocar tiendas de otras empresas vivas (Pau, etc.).
  const deadTagged = allRetail.filter((wc) => {
    const wb = readWorkCenterBusinessId(wc);
    return Boolean(wb) && wb !== bid && !known.has(wb);
  });
  if (deadTagged.length === 0) return workCenters;

  const reclaimIds = new Set(deadTagged.map((wc) => String(wc._id || '').trim()).filter(Boolean));
  return workCenters.map((wc) => (reclaimIds.has(String(wc._id || '').trim()) ? stamp(wc) : wc));
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
  const includeInactivePdvs = options?.includeInactivePdvs === true;

  const [allWorkCenters, rawPdvs] = await Promise.all([
    listWorkCentersForDelivery(dataUserId, business ?? null).catch(() => [] as WorkCenter[]),
    listPointsOfSaleRequest(dataUserId, { includeInactive: includeInactivePdvs }).catch(
      () => [] as PointOfSale[],
    ),
  ]);

  // Etiquetar huérfanas en segundo plano: no bloquear Ajustes si falla el PATCH.
  if (businessId) {
    void tagOrphanRetailWorkCentersForBusiness(businessId, allWorkCenters).catch(() => {});
  }
  const taggedWorkCenters = allWorkCenters;

  const dedupeOpts = includeInactivePdvs ? { includeInactive: true as const } : undefined;

  let scopedWorkCenters = alignRetailWorkCentersToActiveBusiness(
    taggedWorkCenters,
    business ?? null,
    dedupePointsOfSale(rawPdvs, dedupeOpts),
  );

  const knownBusinessIds =
    options?.knownBusinessIds ??
    (businessId ? [businessId] : []);
  if (businessId && knownBusinessIds.length > 0) {
    scopedWorkCenters = rescueRetailForBusinessWithoutStores(
      scopedWorkCenters,
      businessId,
      knownBusinessIds,
    );
  }

  let workCenters = filterWorkCentersForBusinessScope(scopedWorkCenters, businessId, {
    accountBusinessCount: options?.accountBusinessCount,
    includeTemporaryEventPdvs: isEventsBusinessType(business?.businessType),
  });
  workCenters = dedupeRetailWorkCentersForBusiness(workCenters);

  const skipPdvMerge = options?.skipPdvMerge ?? true;
  let pointsOfSale = skipPdvMerge
    ? dedupePointsOfSale(rawPdvs, dedupeOpts)
    : await mergePointsOfSaleWithRetailWorkCenters(dataUserId, dedupePointsOfSale(rawPdvs, dedupeOpts), {
        business: business ?? null,
        workCenters,
        includeInactive: includeInactivePdvs,
      });
  const filteredByWc = dedupePointsOfSale(
    filterPointsOfSaleForWorkCenters(pointsOfSale, workCenters, {
      businessId,
      accountBusinessCount: options?.accountBusinessCount,
    }),
    dedupeOpts,
  );
  pointsOfSale = filteredByWc;
  if (options?.ensureTabletCodes === true && pointsOfSale.length > 0) {
    pointsOfSale = await ensureTabletCodesForPointsOfSale(dataUserId, pointsOfSale);
  }

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
  const state = await loadDeliveryStores(authUser, business, {
    ...options,
    skipPdvMerge: false,
    ensureTabletCodes: options?.ensureTabletCodes !== false,
  });
  if (!state.dataUserId) return state;

  const retail = state.workCenters.filter(
    (wc) =>
      wc.active !== false &&
      !wc.deletedAt &&
      (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
  );

  let pointsOfSale = [...state.pointsOfSale];
  if (pointsOfSale.length === 0) {
    const raw = dedupePointsOfSale(
      await listPointsOfSaleRequest(state.dataUserId).catch(() => [] as PointOfSale[]),
    ).filter((p) => p.active !== false);
    pointsOfSale = dedupePointsOfSale(
      filterPointsOfSaleForWorkCenters(raw, state.workCenters, {
        businessId: resolveBusinessScopeId(business),
      }),
    );
  }
  for (const wc of retail) {
    try {
      const ensured = await ensureDeliveryPdvForWorkCenter(state.dataUserId, wc, {
        business: business ?? null,
        existingPdvs: pointsOfSale,
      });
      if (!ensured) continue;
      const idx = pointsOfSale.findIndex((p) => p._id === ensured._id);
      if (idx >= 0) pointsOfSale[idx] = ensured;
      else pointsOfSale.push(ensured);
      pointsOfSale = dedupePointsOfSale(pointsOfSale);
    } catch {
      // Un PDV que no se puede crear/enlazar no debe impedir ver la tienda.
      continue;
    }
  }

  pointsOfSale = await ensureTabletCodesForPointsOfSale(state.dataUserId, pointsOfSale);

  const beforeScopeFilter = dedupePointsOfSale(pointsOfSale);
  pointsOfSale = dedupePointsOfSale(
    filterPointsOfSaleForWorkCenters(beforeScopeFilter, state.workCenters, {
      businessId: resolveBusinessScopeId(business),
    }),
  );

  const priorityWcId = String(options?.priorityWorkCenterId || '').trim();
  if (priorityWcId) {
    const priorityWc =
      state.workCenters.find((wc) => wc._id === priorityWcId) ||
      retail.find((wc) => wc._id === priorityWcId);
    if (priorityWc) {
      try {
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
      } catch {
        // Sin PDV prioritario: el centro sigue visible en scope.
      }
    }
  }

  return { ...state, pointsOfSale };
}

/**
 * Repara tiendas retail sin PDV de caja enlazado (Ajustes → Tienda).
 * Crea/enlaza el PDV y genera código tablet cuando falta.
 */
export async function repairMissingRetailDeliveryPdvs(
  dataUserId: string,
  workCenters: WorkCenter[],
  pointsOfSale: PointOfSale[],
  business?: Business | null,
): Promise<PointOfSale[]> {
  if (!dataUserId) return pointsOfSale;

  let pdvs = dedupePointsOfSale([...pointsOfSale], { includeInactive: true });
  const retail = workCenters.filter(
    (wc) =>
      !wc.deletedAt &&
      (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
  );

  for (const wc of retail) {
    const alreadyLinked = pdvs.some((p) => String(p.workCenterId || '').trim() === wc._id);
    if (alreadyLinked) continue;
    try {
      const ensured = await ensureDeliveryPdvForWorkCenter(dataUserId, wc, {
        business: business ?? null,
        existingPdvs: pdvs,
      });
      if (!ensured) continue;
      const idx = pdvs.findIndex((p) => p._id === ensured._id);
      if (idx >= 0) pdvs[idx] = ensured;
      else pdvs.push(ensured);
      pdvs = dedupePointsOfSale(pdvs, { includeInactive: true });
    } catch {
      // Reparación en segundo plano: el guardado manual mostrará el error concreto.
    }
  }

  return ensureTabletCodesForPointsOfSale(dataUserId, pdvs);
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
      logo: resolveBrandPlaceholderUrl({ name: preferred || DEFAULT_COMMERCIAL_BRAND_NAME }),
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
    expectedStaffCount: 0,
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

  const businessId = resolveBusinessScopeId(business);
  if (businessId) {
    persistRetailScopeAfterStorePdvSave(businessId, wc, pdv);
  }

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
export const DELIVERY_CONFIG_CHANGED = 'delivery-config:changed';
export const DELIVERY_BRANDS_CHANGED = 'brands:changed';

import {
  clearRetailScopeCache,
  mergeRetailScopeCacheEntry,
} from './retailScopeCache';
import { clearSidebarRetailCache } from './sidebarRetailCache';

/** Invalida caché de tiendas en sesión (sidebar / scope) tras baja o cambio de empresa. */
export function clearDeliveryStoresSessionCache(businessId?: string): void {
  clearRetailScopeCache(businessId);
  clearSidebarRetailCache(businessId);
}

/** Tras crear/editar tienda + PDV: caché al instante para gate Marca y sidebar. */
export function persistRetailScopeAfterStorePdvSave(
  businessId: string,
  workCenter: WorkCenter,
  pointOfSale: PointOfSale,
  options?: { accountBusinessCount?: number },
): void {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return;
  mergeRetailScopeCacheEntry(bid, workCenter, pointOfSale, options);
}

export function notifyDeliveryWorkCentersChanged(_businessId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DELIVERY_WORK_CENTERS_CHANGED));
    notifyDeliveryActiveStoreChanged();
  } catch {
    /* ignore */
  }
}

export function notifyDeliveryCatalogChanged(userId?: string, _businessId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    // Multi-negocio: la caché TPV usa catalogBusinessId resuelto (delivery), no el selector global.
    clearTpvCatalogCache(userId);
    window.dispatchEvent(new CustomEvent(DELIVERY_CATALOG_CHANGED));
  } catch {
    /* ignore */
  }
}

export function notifyDeliveryConfigChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(DELIVERY_CONFIG_CHANGED));
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
