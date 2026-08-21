import type { Business } from './businessApi';

type AuthLike = { user_id?: string; id?: string } | null | undefined;

/** Quita prefijo `account:` si viene en IDs de CouchDB (solo finanzas/APIs que lo requieran). */
export function normalizeTenantUserId(userId: string | null | undefined): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

/**
 * Clientes y catálogo delivery se guardan bajo el titular del negocio (`owner_user_id`).
 * Un miembro del equipo tiene otro `user_id`; hay que consultar con el del titular para ver los mismos datos que importó el gerente.
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
  return isMember ? ownerId : selfId;
}
