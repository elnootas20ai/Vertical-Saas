import { resolveBusinessDataUserId } from './tenantUserId';

type AuthLike = {
  user_id?: string;
  id?: string;
  invitedBy?: string;
} | null | undefined;

type BusinessLike = {
  owner_user_id?: string;
  members?: { user_id?: string }[];
} | null | undefined;

/**
 * Titular de la cartera CRM del TPV (fichas del local).
 *
 * Orden:
 * 1) scope caja/tablet (`effectiveDataUserId` / binding) — es el dueño de datos del TPV
 * 2) owner_user_id de la empresa activa
 * 3) resolveBusiness / invitedBy / self
 *
 * Antes priorizar solo el owner de currentBusiness podía buscar en otra cartera
 * si el selector global no coincidía con el binding de tablet.
 */
export function resolveTpvClientSearchUserId(params: {
  currentBusiness?: BusinessLike;
  scopeDataUserId?: string | null;
  authUser?: AuthLike;
}): string {
  const fromScope = String(params.scopeDataUserId || '').trim();
  const ownerId = String(params.currentBusiness?.owner_user_id || '').trim();
  const fromBusiness = resolveBusinessDataUserId(params.authUser, params.currentBusiness);
  const selfId = String(params.authUser?.user_id || params.authUser?.id || '').trim();
  const invitedBy = String(params.authUser?.invitedBy || '').trim();

  // Tablet / caja: el scope ya apunta al titular de la tienda.
  if (fromScope) {
    if (!ownerId || fromScope === ownerId) return fromScope;
    // Scope y owner divergen:
    // - Trabajador / sesión tablet (no eres el owner del selector) → confiar en el scope.
    // - CEO que cambió de empresa en el selector → owner de la empresa activa.
    if (selfId && ownerId && selfId !== ownerId) return fromScope;
    if (invitedBy && (invitedBy === fromScope || selfId === fromScope)) return fromScope;
    return ownerId;
  }

  if (ownerId) return ownerId;

  const candidate = fromBusiness || invitedBy || selfId;
  if (invitedBy && candidate === selfId) return invitedBy;
  return candidate;
}
