import type { Business } from './businessApi';
import { isDeliveryOpsBusinessType, isRestaurantBusinessType } from './deliveryOpsTypes';
import {
  isTpvTabletBindingAllowedForAuth,
  isTpvTabletWorkerPath,
} from './tpvTabletSession';
import { resolveBusinessDataUserId } from './tenantUserId';

export interface TpvTabletBindingRef {
  businessId?: string;
  dataUserId?: string;
  pdvId?: string;
  workCenterId?: string;
  authUserId?: string;
}

type AuthLike = { user_id?: string; id?: string } | null | undefined;

function normalizeBusinessScopeId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function resolveBusinessScopeId(business?: Business | null): string {
  return normalizeBusinessScopeId(
    business?.business_id || (business as { id?: string } | null)?.id,
  );
}

/** Expuesto para tests de regresión (no pasar un string suelto a resolveBusinessScopeId). */
export function businessScopeIdFromRawId(rawId: string | null | undefined): string {
  return resolveBusinessScopeId({ business_id: String(rawId || '').trim() });
}

type BusinessScopeRef = Pick<Business, 'business_id' | 'businessType'> & { id?: string };

function isDeliveryBusinessType(businessType?: string | null): boolean {
  return String(businessType || '').trim() === 'delivery';
}

/**
 * Catálogo TPV: delivery y restaurante usan el catálogo de su propia empresa.
 * Solo redirige al negocio delivery si el selector apunta a otra vertical (p. ej. limpieza).
 */
export function resolveTpvCatalogBusinessId(
  scopeBusinessId: string,
  businesses: BusinessScopeRef[],
): string {
  const bid = businessScopeIdFromRawId(scopeBusinessId);
  const match = businesses.find(
    (b) => businessScopeIdFromRawId(b.business_id || b.id) === bid,
  );
  if (
    match &&
    (isDeliveryOpsBusinessType(match.businessType) ||
      isRestaurantBusinessType(match.businessType))
  ) {
    return bid;
  }

  const deliveryId = deliveryBusinessIdForTpv(businesses);
  return deliveryId || bid;
}

/**
 * Id de empresa para ESCRIBIR en TPV/delivery (pedidos, clientes, caja).
 * Misma regla que el catálogo: nunca mezclar limpieza/otra vertical con delivery.
 */
export function resolveRetailOpsWriteBusinessId(
  scopeBusinessId: string,
  businesses: BusinessScopeRef[],
): string {
  return resolveTpvCatalogBusinessId(scopeBusinessId, businesses);
}

/** Si el selector global no es delivery, devolver el id delivery de la cuenta (TPV / catálogo). */
export function deliveryBusinessIdForTpv(businesses: BusinessScopeRef[]): string {
  const delivery = businesses.find((b) => isDeliveryBusinessType(b.businessType));
  return businessScopeIdFromRawId(delivery?.business_id || delivery?.id);
}

export function shouldAutoSwitchToDeliveryBusiness(
  currentBusiness: BusinessScopeRef | null | undefined,
  businesses: BusinessScopeRef[],
): string | null {
  const deliveryId = deliveryBusinessIdForTpv(businesses);
  if (!deliveryId) return null;
  const currentId = businessScopeIdFromRawId(currentBusiness?.business_id || currentBusiness?.id);
  if (!currentId || currentId === deliveryId) return null;
  if (isDeliveryOpsBusinessType(currentBusiness?.businessType)) return null;
  if (isRestaurantBusinessType(currentBusiness?.businessType)) return null;
  if (isDeliveryBusinessType(currentBusiness?.businessType)) return null;
  return deliveryId;
}

/** Binding tablet válido (código de tienda vinculado). */
export function isTpvTabletSession(binding?: TpvTabletBindingRef | null): boolean {
  return Boolean(String(binding?.pdvId || '').trim() && String(binding?.businessId || '').trim());
}

/** Tablet operativa: binding + ruta worker/tablet (no aplica en /saas/caja/tpv del gerente). */
export function isActiveTpvTabletSession(
  binding?: TpvTabletBindingRef | null,
  pathname?: string | null,
): boolean {
  return isTpvTabletSession(binding) && isTpvTabletWorkerPath(String(pathname || ''));
}

/** Id de empresa a partir del binding tablet — siempre pasar `{ business_id }`, nunca el string suelto. */
export function businessScopeIdFromTabletBinding(
  binding?: Pick<TpvTabletBindingRef, 'businessId'> | null,
): string {
  return businessScopeIdFromRawId(binding?.businessId);
}

/**
 * Fuente única para TpvRegisterGate: qué empresa y qué userId usar al cargar caja.
 * En tablet el código de tienda manda sobre la empresa cacheada en el selector,
 * pero SOLO si el binding pertenece a la cuenta activa (no a Pau u otra).
 */
export function resolveTpvRegisterScope(params: {
  currentBusiness: Business | null;
  tabletBinding?: TpvTabletBindingRef | null;
  authUser: AuthLike;
  /** Ruta actual: la sesión tablet solo aplica en /saas/worker/tpv*. */
  pathname?: string | null;
  /** Empresas de la cuenta activa — para no usar un binding ajeno. */
  businesses?: Array<{
    business_id?: string;
    id?: string;
    owner_user_id?: string;
    members?: Array<{ user_id?: string }>;
  }> | null;
  businessesSettled?: boolean;
}): {
  scopeBusinessId: string;
  effectiveDataUserId: string;
  isTabletSession: boolean;
  shouldSyncBusinessFromTablet: boolean;
} {
  const { currentBusiness, tabletBinding, authUser, pathname } = params;
  const businesses = Array.isArray(params.businesses) ? params.businesses : [];
  const businessesSettled = Boolean(params.businessesSettled) || businesses.length > 0;

  const pathOk = isActiveTpvTabletSession(tabletBinding, pathname);
  const bindingAllowed = isTpvTabletBindingAllowedForAuth({
    binding: tabletBinding
      ? {
          pdvId: tabletBinding.pdvId,
          businessId: tabletBinding.businessId,
          dataUserId: tabletBinding.dataUserId,
          authUserId: tabletBinding.authUserId,
        }
      : null,
    authUser,
    businesses,
    businessesSettled,
  });
  // Con código de tienda válido: datos SIEMPRE de la tienda (nunca cuenta personal),
  // aunque la URL aún no sea /worker/tpv (SaasRoot redirige).
  const hasTerminalIds = Boolean(
    String(tabletBinding?.pdvId || '').trim()
    && String(tabletBinding?.businessId || '').trim()
    && String(tabletBinding?.dataUserId || '').trim(),
  );
  const tablet = bindingAllowed && hasTerminalIds;

  const tabletBid = businessScopeIdFromTabletBinding(tabletBinding);
  const activeBid = resolveBusinessScopeId(currentBusiness);

  const scopeBusinessId = tablet && tabletBid ? tabletBid : activeBid;

  const tabletOwnerId = String(tabletBinding?.dataUserId || '').trim();
  const effectiveDataUserId =
    tablet && tabletOwnerId
      ? tabletOwnerId
      : resolveBusinessDataUserId(authUser, currentBusiness);

  const shouldSyncBusinessFromTablet = Boolean(tablet && tabletBid && tabletBid !== activeBid);

  return {
    scopeBusinessId,
    effectiveDataUserId,
    /** UI/caja tablet: solo en rutas worker/tpv. Los datos de tienda ya van arriba con `tablet`. */
    isTabletSession: tablet && pathOk,
    shouldSyncBusinessFromTablet,
  };
}

/** ¿Puede arrancar loadData del gate de caja? */
export function evaluateTpvRegisterLoadGate(params: {
  businessLoading: boolean;
  businessesFetchSettled: boolean;
  isTabletSession: boolean;
  dataUserId: string;
  scopeBusinessId: string;
}): { canLoad: boolean; shouldClearLoading: boolean } {
  const {
    businessLoading,
    businessesFetchSettled,
    isTabletSession,
    dataUserId,
    scopeBusinessId,
  } = params;

  const hasIds = Boolean(dataUserId && scopeBusinessId);

  // Tablet: el código de tienda ya fija empresa y titular; no esperar al selector global.
  if (isTabletSession) {
    return {
      canLoad: hasIds,
      shouldClearLoading: !hasIds,
    };
  }

  if (businessLoading) {
    return { canLoad: false, shouldClearLoading: false };
  }

  const canLoad = businessesFetchSettled && hasIds;
  const shouldClearLoading = !canLoad && businessesFetchSettled && !hasIds;

  return { canLoad, shouldClearLoading };
}

/** Evita descartar resultados obsoletos en tablet cuando el selector global aún no ha sincronizado. */
export function shouldApplyTpvRegisterLoadResult(params: {
  isTabletSession: boolean;
  bidAtStart: string;
  activeBid: string;
}): boolean {
  if (params.isTabletSession) return true;
  return params.activeBid === params.bidAtStart;
}

export function resolveTpvRegisterBidAtStart(params: {
  isTabletSession: boolean;
  tabletBinding?: Pick<TpvTabletBindingRef, 'businessId'> | null;
  scopeBusinessId: string;
}): string {
  if (params.isTabletSession && params.tabletBinding?.businessId) {
    return businessScopeIdFromTabletBinding(params.tabletBinding);
  }
  return params.scopeBusinessId;
}
