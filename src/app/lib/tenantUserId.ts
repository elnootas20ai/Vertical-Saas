import type { Business } from './businessApi';

type AuthLike = { user_id?: string; id?: string } | null | undefined;

/**
 * Clientes y catálogo delivery se guardan bajo el titular del negocio (`owner_user_id`).
 * Un miembro del equipo tiene otro `user_id`; hay que consultar con el del titular para ver los mismos datos que importó el gerente.
 */
export function resolveBusinessDataUserId(authUser: AuthLike, business: Business | null | undefined): string {
  const selfId = String(authUser?.user_id || authUser?.id || '').trim();
  if (!selfId) return '';
  const ownerId = String(business?.owner_user_id || '').trim();
  if (!ownerId || ownerId === selfId) return selfId;
  const members = business?.members || [];
  const isMember = members.some((m) => String(m.user_id || '').trim() === selfId);
  return isMember ? ownerId : selfId;
}
