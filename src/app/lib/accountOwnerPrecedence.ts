/**
 * Titular de cuenta vs Admin/Administrador invitado.
 * El propietario (owner_user_id / cuenta empresa) prevalece en acciones peligrosas.
 */

/** Roles «casi CEO»: solo el titular puede invitarlos / expulsarlos / cambiarles el rol. */
export const OWNER_ONLY_PEER_ROLES = new Set([
  'Admin',
  'Gerente',
  'GerenteGrupo',
  'Administrador',
  'Superadmin',
]);

/**
 * @deprecated Preferir OWNER_ONLY_PEER_ROLES / isOwnerOnlyPeerRole.
 * Encargado/Gestor ya no bloquean al Admin invitado.
 */
export const OWNER_GATED_TEAM_ROLES = new Set([
  ...OWNER_ONLY_PEER_ROLES,
  'Encargado',
  'Gestor',
]);

export function isOwnerOnlyPeerRole(role?: string | null): boolean {
  return OWNER_ONLY_PEER_ROLES.has(String(role || '').trim());
}

/** Compat: ahora = peers Admin (no Encargado/Gestor). */
export function isOwnerGatedTeamRole(role?: string | null): boolean {
  return isOwnerOnlyPeerRole(role);
}

export function isBusinessOwner(
  business?: { owner_user_id?: string } | null,
  userId?: string | null,
): boolean {
  const uid = String(userId || '').replace(/^account:/, '').trim();
  const owner = String(business?.owner_user_id || '').replace(/^account:/, '').trim();
  return Boolean(uid && owner && uid === owner);
}

const PURCHASE_DOC_DELETE_ROLES = new Set([
  'Admin',
  'Administrador',
  'Gerente',
  'GerenteGrupo',
  'Superadmin',
]);

/**
 * Borrar facturas/albaranes de compra: titular de la empresa o admin/gerente.
 * (Encargado con motivo = fase posterior.)
 */
export function canDeletePurchaseDocuments(
  business:
    | {
        owner_user_id?: string;
        members?: { user_id?: string; role?: string }[];
      }
    | null
    | undefined,
  user?: { user_id?: string; role?: string } | null,
): boolean {
  const uid = String(user?.user_id || '').replace(/^account:/, '').trim();
  if (!uid) return false;
  if (isBusinessOwner(business, uid)) return true;
  const accountRole = String(user?.role || '').trim();
  if (PURCHASE_DOC_DELETE_ROLES.has(accountRole)) return true;
  const memberRole = String(
    business?.members?.find(
      (m) => String(m.user_id || '').replace(/^account:/, '').trim() === uid,
    )?.role || '',
  ).trim();
  return PURCHASE_DOC_DELETE_ROLES.has(memberRole);
}

/** Puede expulsar a este miembro (Admin invitado no echa a otros Admin/Administrador). */
export function canOwnerPrecedenceRemoveMember(
  business: { owner_user_id?: string; members?: { user_id?: string; role?: string }[] } | null | undefined,
  actorUserId: string | null | undefined,
  targetUserId: string | null | undefined,
  targetRole?: string | null,
): boolean {
  const actor = String(actorUserId || '').replace(/^account:/, '').trim();
  const target = String(targetUserId || '').replace(/^account:/, '').trim();
  if (!actor || !target || !business) return false;
  if (isBusinessOwner(business, target)) return false;
  if (isBusinessOwner(business, actor)) return true;
  const memberRole =
    targetRole
    || business.members?.find(
      (m) => String(m.user_id || '').replace(/^account:/, '').trim() === target,
    )?.role
    || '';
  if (isOwnerOnlyPeerRole(memberRole)) return false;
  return true;
}
