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
 * Prioridad: owner de la empresa activa → scope caja/tablet → resolveBusiness → invitedBy → self.
 */
export function resolveTpvClientSearchUserId(params: {
  currentBusiness?: BusinessLike;
  scopeDataUserId?: string | null;
  authUser?: AuthLike;
}): string {
  const ownerId = String(params.currentBusiness?.owner_user_id || '').trim();
  if (ownerId) return ownerId;

  const fromScope = String(params.scopeDataUserId || '').trim();
  const fromBusiness = resolveBusinessDataUserId(params.authUser, params.currentBusiness);
  const selfId = String(params.authUser?.user_id || params.authUser?.id || '').trim();
  const invitedBy = String(params.authUser?.invitedBy || '').trim();
  const candidate = fromScope || fromBusiness || invitedBy || selfId;
  if (invitedBy && candidate === selfId) return invitedBy;
  return candidate;
}
