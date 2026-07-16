/**
 * Punto único de scope de tiendas/PDV por vertical.
 * Evita que un vertical lea/escriba caché o filtros de otro (p. ej. restaurante ↔ delivery).
 *
 * Regla: todo código que filtre centros retail, lea/escriba caché o cargue tiendas
 * debe pasar por aquí — no ramas sueltas `isRestaurant…` repartidas.
 */
import type { Business } from '../lib/businessApi';
import type { PointOfSale } from '../lib/deliveryApi';
import { buildDeliverySidebarStoreRows } from '../lib/deliveryApi';
import type { AuthUser } from '../lib/authApi';
import { isCompraventaBusinessType } from '../lib/compraventaSetup';
import {
  isRestaurantBusinessType,
  isStrictDeliveryBusinessType,
} from '../lib/deliveryOpsTypes';
import {
  dedupeRetailWorkCentersForBusiness,
  filterPointsOfSaleForWorkCenters,
  filterWorkCentersForBusinessScope,
  loadDeliveryStores,
  loadTpvPointsOfSaleForBusiness,
  shouldUseDeliveryStores,
  type DeliveryStoresState,
} from '../lib/deliverySetup';
import { readTpvTabletBinding } from '../lib/tpvTabletSession';
import {
  clearRetailScopeCache,
  mergeRetailScopeCacheEntry,
  readRetailScopeCache,
  writeRetailScopeCache,
  type RetailScopeSnapshot,
} from '../lib/retailScopeCache';
import { clearSidebarRetailCache, readSidebarRetailCache } from '../lib/sidebarRetailCache';
import { sanitizeRetailScopeSnapshot } from '../lib/retailScopeSanitize';
import { isSalaManagedWorkCenter } from '../lib/salaRoomTerminal';
import type { WorkCenter } from '../lib/workCentersApi';
import { loadRestaurantStores } from './restaurant/loadRestaurantStores';
import {
  clearRestaurantRetailCache,
  readRestaurantRetailCache,
  writeRestaurantRetailCache,
} from './restaurant/restaurantRetailCache';
import { filterRestaurantRetailWorkCenters } from './restaurant/retailScope';

export type { RetailScopeSnapshot };

function normalizeBusinessScopeId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

export type RetailScopeKind = 'delivery' | 'restaurant' | 'strict';

type AuthLike = Pick<AuthUser, 'user_id' | 'id'> | null | undefined;

export type RetailScopeBusinessRef = Pick<
  Business,
  'business_id' | 'businessType' | 'createdAt' | 'name'
>;

export type RetailScopeContext = {
  business: RetailScopeBusinessRef | null;
  businesses: RetailScopeBusinessRef[];
  accountBusinessCount?: number;
};

export type LoadRetailStoresOptions = {
  accountBusinessCount?: number;
  knownBusinessIds?: string[];
  includeInactivePdvs?: boolean;
  /** TPV: auto-crea PDV faltantes. Settings/listados: solo fetch. */
  tpvBootstrap?: boolean;
  /** TPV: genera códigos tablet. Ajustes/listados: false. */
  ensureTabletCodes?: boolean;
  /** Listados: true (rápido). TPV bootstrap: false para enlazar PDV faltantes. */
  skipPdvMerge?: boolean;
};

/** Clasifica cómo aislar tiendas según el tipo de negocio activo. */
export function resolveRetailScopeKind(
  businessType: string | null | undefined,
): RetailScopeKind {
  if (isRestaurantBusinessType(businessType)) return 'restaurant';
  if (isStrictDeliveryBusinessType(businessType)) return 'delivery';
  return 'strict';
}

function isRetailCenterType(wc: WorkCenter): boolean {
  return wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';
}

/** Retail genérico (sin marcar sala). Delivery NO debe filtrar notas sala_room. */
function pickRetailWorkCenters(workCenters: WorkCenter[]): WorkCenter[] {
  return workCenters.filter((wc) => !wc.deletedAt && isRetailCenterType(wc));
}

/** Solo restaurante: excluye centros técnicos de sala (mesas), no tiendas delivery. */
function pickRestaurantFloorRetail(workCenters: WorkCenter[]): WorkCenter[] {
  return pickRetailWorkCenters(workCenters).filter((wc) => !isSalaManagedWorkCenter(wc));
}

/** Filtra centros retail ya cargados según el vertical activo. */
export function filterRetailWorkCentersForScope(
  workCenters: WorkCenter[],
  ctx: RetailScopeContext,
): WorkCenter[] {
  const business = ctx.business;
  const businessId = normalizeBusinessScopeId(business?.business_id);
  if (!businessId || !business) return pickRetailWorkCenters(workCenters);

  const kind = resolveRetailScopeKind(business.businessType);

  // Delivery: scope soft por businessId + huérfanas. Nunca filtrar por sala_room.
  if (kind === 'delivery') {
    return dedupeRetailWorkCentersForBusiness(
      filterWorkCentersForBusinessScope(pickRetailWorkCenters(workCenters), businessId, {
        accountBusinessCount: ctx.accountBusinessCount,
      }),
    );
  }

  if (kind === 'restaurant') {
    return filterRestaurantRetailWorkCenters(
      pickRestaurantFloorRetail(workCenters),
      business,
      ctx.businesses,
    );
  }

  const picked = pickRetailWorkCenters(workCenters);
  return sanitizeRetailScopeSnapshot(
    businessId,
    { retailWorkCenters: picked, allPointsOfSale: [] },
    ctx.accountBusinessCount !== undefined
      ? { accountBusinessCount: ctx.accountBusinessCount }
      : undefined,
  ).retailWorkCenters;
}

function cacheOptsFromCtx(ctx: RetailScopeContext) {
  return ctx.accountBusinessCount !== undefined
    ? { accountBusinessCount: ctx.accountBusinessCount }
    : undefined;
}

/** Lee caché del vertical correcto — restaurante NUNCA lee caché delivery. */
export function readRetailScopeCacheForBusiness(
  businessId: string,
  ctx: RetailScopeContext,
): RetailScopeSnapshot | null {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid || !ctx.business) return null;

  const kind = resolveRetailScopeKind(ctx.business.businessType);
  const opts = cacheOptsFromCtx(ctx);

  if (kind === 'restaurant') {
    const cached = readRestaurantRetailCache(bid, ctx.business, ctx.businesses);
    if (!cached) return null;
    if (cached.retailWorkCenters.length === 0 && cached.allPointsOfSale.length === 0) {
      return null;
    }
    return {
      retailWorkCenters: cached.retailWorkCenters,
      allPointsOfSale: cached.allPointsOfSale,
    };
  }

  const cached = readRetailScopeCache(bid, opts);
  if (cached && (cached.retailWorkCenters.length > 0 || cached.allPointsOfSale.length > 0)) {
    return cached;
  }

  const sidebarCached = readSidebarRetailCache(bid, opts);
  if (
    sidebarCached &&
    (sidebarCached.allPointsOfSale.length > 0 || sidebarCached.rows.length > 0)
  ) {
    return {
      retailWorkCenters: sidebarCached.retailWorkCenters,
      allPointsOfSale: sidebarCached.allPointsOfSale,
    };
  }

  return null;
}

/** Escribe caché solo en el namespace del vertical activo. */
export function writeRetailScopeCacheForBusiness(
  businessId: string,
  snapshot: RetailScopeSnapshot,
  ctx: RetailScopeContext,
): void {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid || !ctx.business) return;
  if (snapshot.retailWorkCenters.length === 0 && snapshot.allPointsOfSale.length === 0) {
    return;
  }

  const kind = resolveRetailScopeKind(ctx.business.businessType);
  const opts = cacheOptsFromCtx(ctx);

  if (kind === 'restaurant') {
    const rows = buildDeliverySidebarStoreRows(
      snapshot.retailWorkCenters,
      snapshot.allPointsOfSale,
    );
    if (rows.length === 0) return;
    writeRestaurantRetailCache(
      bid,
      {
        rows,
        retailWorkCenters: snapshot.retailWorkCenters,
        allPointsOfSale: snapshot.allPointsOfSale,
        savedAt: Date.now(),
      },
      ctx.business,
      ctx.businesses,
    );
    return;
  }

  const scoped = filterRetailWorkCentersForScope(snapshot.retailWorkCenters, ctx);
  const pdvs = filterPointsOfSaleForWorkCenters(snapshot.allPointsOfSale, scoped);
  if (scoped.length === 0 && pdvs.length === 0) return;

  writeRetailScopeCache(bid, { retailWorkCenters: scoped, allPointsOfSale: pdvs }, opts);
}

/** Invalida TODAS las cachés de tiendas para un businessId (todos los verticales). */
export function clearAllRetailScopeCaches(businessId?: string): void {
  clearRetailScopeCache(businessId);
  clearSidebarRetailCache(businessId);
  clearRestaurantRetailCache(businessId);
}

/** ¿Debe cargarse el pipeline de tiendas/PDV para esta empresa? */
export function shouldLoadRetailStoresForBusiness(
  ctx: RetailScopeContext,
  bidAtStart: string,
  hints?: { hasDisplayedStores?: boolean; tabletBoundStore?: boolean },
): boolean {
  if (!ctx.business) return false;
  if (hints?.tabletBoundStore) return false;
  if (isCompraventaBusinessType(ctx.business.businessType)) return false;
  const kind = resolveRetailScopeKind(ctx.business.businessType);
  if (kind === 'restaurant') {
    if (hints?.hasDisplayedStores) return false;
    const bid = normalizeBusinessScopeId(ctx.business.business_id);
    const cached = readRestaurantRetailCache(bid, ctx.business, ctx.businesses);
    if (cached) {
      const openableRows = (cached.rows || []).some(
        (r) => r.pdvId && !r.needsPdv && !r.inactive,
      );
      const activePdvs = cached.allPointsOfSale.some((p) => p.active !== false);
      if (openableRows || activePdvs) return false;
    }
    return true;
  }

  return shouldUseDeliveryStores(
    { business: ctx.business as Business, businesses: ctx.businesses as Business[] },
    {
      tabletBusinessId: readTpvTabletBinding()?.businessId ?? null,
      hasDeliveryPdvs:
        Boolean(hints?.hasDisplayedStores) ||
        Boolean(readRetailScopeCache(bidAtStart)) ||
        Boolean(readSidebarRetailCache(bidAtStart)?.allPointsOfSale.length),
    },
  );
}

/** Carga tiendas aplicando filtro del vertical — motor fetch compartido, scope aislado. */
export async function loadRetailStoresForBusiness(
  authUser: AuthLike,
  business: Business,
  businesses: Business[],
  options?: LoadRetailStoresOptions,
): Promise<DeliveryStoresState> {
  const ctx: RetailScopeContext = {
    business,
    businesses,
    accountBusinessCount: options?.accountBusinessCount,
  };
  const kind = resolveRetailScopeKind(business.businessType);
  const tpvBootstrap = options?.tpvBootstrap === true;
  const loadOpts = {
    accountBusinessCount: options?.accountBusinessCount,
    knownBusinessIds: options?.knownBusinessIds,
    includeInactivePdvs: options?.includeInactivePdvs,
    skipPdvMerge: options?.skipPdvMerge ?? !tpvBootstrap,
    ensureTabletCodes: options?.ensureTabletCodes ?? tpvBootstrap,
  };

  if (kind === 'restaurant') {
    return loadRestaurantStores(authUser, business, businesses, {
      accountBusinessCount: options?.accountBusinessCount,
      includeInactivePdvs: options?.includeInactivePdvs,
      tpvBootstrap,
      skipPdvMerge: loadOpts.skipPdvMerge,
    });
  }

  const state = tpvBootstrap
    ? await loadTpvPointsOfSaleForBusiness(authUser, business, loadOpts)
    : await loadDeliveryStores(authUser, business, loadOpts);

  if (kind === 'strict') {
    const retail = filterRetailWorkCentersForScope(state.workCenters, ctx);
    const pointsOfSale = filterPointsOfSaleForWorkCenters(state.pointsOfSale, retail);
    return { ...state, workCenters: retail, pointsOfSale };
  }

  return state;
}

/** Tras crear/editar tienda + PDV: actualiza caché del vertical correcto. */
export function persistRetailScopeAfterStoreSave(
  businessId: string,
  workCenter: WorkCenter,
  pointOfSale: PointOfSale,
  ctx: RetailScopeContext,
): void {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid || !ctx.business) return;

  const kind = resolveRetailScopeKind(ctx.business.businessType);
  const opts = cacheOptsFromCtx(ctx);

  if (kind === 'restaurant') {
    const existing = readRestaurantRetailCache(bid, ctx.business, ctx.businesses);
    const retailWorkCenters = [...(existing?.retailWorkCenters ?? [])];
    const allPointsOfSale = [...(existing?.allPointsOfSale ?? [])];

    const wcIdx = retailWorkCenters.findIndex((wc) => wc._id === workCenter._id);
    if (wcIdx >= 0) retailWorkCenters[wcIdx] = workCenter;
    else retailWorkCenters.push(workCenter);

    const pdvForCache: PointOfSale = {
      ...pointOfSale,
      workCenterId: String(pointOfSale.workCenterId || workCenter._id).trim(),
      active: pointOfSale.active !== false,
    };
    const pdvIdx = allPointsOfSale.findIndex((p) => p._id === pdvForCache._id);
    if (pdvIdx >= 0) allPointsOfSale[pdvIdx] = pdvForCache;
    else allPointsOfSale.push(pdvForCache);

    const scopedRetail = filterRestaurantRetailWorkCenters(
      retailWorkCenters,
      ctx.business,
      ctx.businesses,
    );
    const scopedPdvs = filterPointsOfSaleForWorkCenters(allPointsOfSale, scopedRetail);
    const rows = buildDeliverySidebarStoreRows(scopedRetail, scopedPdvs);
    if (rows.length === 0) {
      clearRestaurantRetailCache(bid);
      return;
    }
    writeRestaurantRetailCache(
      bid,
      {
        rows,
        retailWorkCenters: scopedRetail,
        allPointsOfSale: scopedPdvs,
        savedAt: Date.now(),
      },
      ctx.business,
      ctx.businesses,
    );
    return;
  }

  mergeRetailScopeCacheEntry(bid, workCenter, pointOfSale, opts);
}
