import type { Business } from './businessApi';
import { resolveBusinessDataUserId } from './tenantUserId';

export interface TpvTabletBindingRef {
  businessId?: string;
  dataUserId?: string;
  pdvId?: string;
  workCenterId?: string;
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

/** Sesión tablet TPV activa (código de tienda vinculado). */
export function isTpvTabletSession(binding?: TpvTabletBindingRef | null): boolean {
  return Boolean(String(binding?.pdvId || '').trim() && String(binding?.businessId || '').trim());
}

/** Id de empresa a partir del binding tablet — siempre pasar `{ business_id }`, nunca el string suelto. */
export function businessScopeIdFromTabletBinding(
  binding?: Pick<TpvTabletBindingRef, 'businessId'> | null,
): string {
  return businessScopeIdFromRawId(binding?.businessId);
}

/**
 * Fuente única para TpvRegisterGate: qué empresa y qué userId usar al cargar caja.
 * En tablet el código de tienda manda sobre la empresa cacheada en el selector.
 */
export function resolveTpvRegisterScope(params: {
  currentBusiness: Business | null;
  tabletBinding?: TpvTabletBindingRef | null;
  authUser: AuthLike;
}): {
  scopeBusinessId: string;
  effectiveDataUserId: string;
  isTabletSession: boolean;
  shouldSyncBusinessFromTablet: boolean;
} {
  const { currentBusiness, tabletBinding, authUser } = params;
  const tablet = isTpvTabletSession(tabletBinding);
  const tabletBid = businessScopeIdFromTabletBinding(tabletBinding);
  const activeBid = resolveBusinessScopeId(currentBusiness);

  const scopeBusinessId = tablet && tabletBid ? tabletBid : activeBid || tabletBid;

  const tabletOwnerId = String(tabletBinding?.dataUserId || '').trim();
  const effectiveDataUserId =
    tablet && tabletOwnerId
      ? tabletOwnerId
      : resolveBusinessDataUserId(authUser, currentBusiness);

  const shouldSyncBusinessFromTablet = Boolean(tablet && tabletBid && tabletBid !== activeBid);

  return {
    scopeBusinessId,
    effectiveDataUserId,
    isTabletSession: tablet,
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
