/**
 * Titular de cuenta vs Admin/Administrador invitado.
 * El propietario (owner_user_id / cuenta empresa) prevalece en acciones peligrosas.
 */

export const OWNER_GATED_TEAM_ROLES = new Set([
  'Admin',
  'Gerente',
  'GerenteGrupo',
  'Administrador',
  'Encargado',
  'Gestor',
  'Superadmin',
]);

export function isOwnerGatedTeamRole(role?: string | null): boolean {
  return OWNER_GATED_TEAM_ROLES.has(String(role || '').trim());
}

export function isBusinessOwner(
  business?: { owner_user_id?: string } | null,
  userId?: string | null,
): boolean {
  const uid = String(userId || '').trim();
  const owner = String(business?.owner_user_id || '').trim();
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
  const uid = String(user?.user_id || '').trim();
  if (!uid) return false;
  if (isBusinessOwner(business, uid)) return true;
  const accountRole = String(user?.role || '').trim();
  if (PURCHASE_DOC_DELETE_ROLES.has(accountRole)) return true;
  const memberRole = String(
    business?.members?.find((m) => String(m.user_id || '').trim() === uid)?.role || '',
  ).trim();
  return PURCHASE_DOC_DELETE_ROLES.has(memberRole);
}

/** Puede expulsar a este miembro (Admin invitado no echa a otros managers). */
export function canOwnerPrecedenceRemoveMember(
  business: { owner_user_id?: string; members?: { user_id?: string; role?: string }[] } | null | undefined,
  actorUserId: string | null | undefined,
  targetUserId: string | null | undefined,
  targetRole?: string | null,
): boolean {
  const actor = String(actorUserId || '').trim();
  const target = String(targetUserId || '').trim();
  if (!actor || !target || !business) return false;
  if (isBusinessOwner(business, target)) return false;
  if (isBusinessOwner(business, actor)) return true;
  const memberRole =
    targetRole
    || business.members?.find((m) => String(m.user_id || '').trim() === target)?.role
    || '';
  if (isOwnerGatedTeamRole(memberRole)) return false;
  return true;
}
