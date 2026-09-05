import type { Business } from './businessApi';
import { isVertialSuperAdminEmail } from './superAdmin';

type AuthLike = { user_id?: string; id?: string; email?: string } | null | undefined;

/** Quita prefijo `account:` si viene en IDs de CouchDB (solo finanzas/APIs que lo requieran). */
export function normalizeTenantUserId(userId: string | null | undefined): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

/**
 * Clientes y catálogo delivery se guardan bajo el titular del negocio (`owner_user_id`).
 * Un miembro del equipo tiene otro `user_id`; hay que consultar con el del titular para ver los mismos datos que importó el gerente.
 *
 * Superadmin Vertial (`uriel@admin.com`): al abrir una empresa ajena tampoco es `members[]`,
 * pero los centros ya se listan con `owner_user_id` (listWorkCentersForDelivery). Los PDV
 * deben usar el mismo titular; si no, el sidebar muestra «Sin PDV» con tiendas huérfanas.
 */
export function resolveBusinessDataUserId(authUser: AuthLike, business: Business | null | undefined): string {
  const selfId = normalizeTenantUserId(authUser?.user_id || authUser?.id);
  if (!selfId) return '';
  const ownerId = normalizeTenantUserId(business?.owner_user_id);
  if (!ownerId || ownerId === selfId) return selfId;
  const members = business?.members || [];
  const isMember = members.some(
    (m) => normalizeTenantUserId(m.user_id) === selfId,
  );
  if (isMember) return ownerId;
  if (isVertialSuperAdminEmail(authUser?.email)) return ownerId;
  return selfId;
}
