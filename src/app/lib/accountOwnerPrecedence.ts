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
