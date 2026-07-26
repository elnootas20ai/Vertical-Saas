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
 * Misma idea que el contador «Tienes N clientes» (AppContext):
 * invitedBy (trabajador) → owner de la empresa → scope caja → resolveBusiness → self.
 *
 * Importante: no buscar con la cuenta vacía del dispositivo/tablet.
 */
export function resolveTpvClientSearchUserId(params: {
  currentBusiness?: BusinessLike;
  scopeDataUserId?: string | null;
  authUser?: AuthLike;
}): string {
  const invitedBy = String(params.authUser?.invitedBy || '').trim();
  if (invitedBy) return invitedBy;

  const ownerId = String(params.currentBusiness?.owner_user_id || '').trim();
  if (ownerId) return ownerId;

  const fromScope = String(params.scopeDataUserId || '').trim();
  if (fromScope) return fromScope;

  const fromBusiness = resolveBusinessDataUserId(params.authUser, params.currentBusiness);
  const selfId = String(params.authUser?.user_id || params.authUser?.id || '').trim();
  return fromBusiness || selfId;
}
