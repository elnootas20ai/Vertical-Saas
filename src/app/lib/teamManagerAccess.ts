import { userOwnsAnyBusiness } from '../lib/workerProfileCompletion';

/** Roles de backoffice RRHH / equipo (invitar, nóminas, ZIP). */
export const TEAM_MANAGER_ROLES = new Set([
  'Admin',
  'Gerente',
  'GerenteGrupo',
  'Administrador',
  'Encargado',
  'Gestor',
  'Superadmin',
]);

type TeamUser = {
  user_id?: string;
  role?: string;
  permissions?: Record<string, { view?: boolean; edit?: boolean }>;
} | null | undefined;

type TeamBusiness = {
  owner_user_id?: string;
  members?: { user_id?: string; role?: string }[];
} | null | undefined;

function bareUserId(value: string | null | undefined): string {
  return String(value || '').replace(/^account:/, '').trim();
}

/** Rol de gestión en la ficha de miembro (2º Admin invitado). */
function memberHasManagerRole(businesses: TeamBusiness[] | null | undefined, userId: string): boolean {
  const uid = bareUserId(userId);
  if (!uid || !Array.isArray(businesses)) return false;
  for (const b of businesses) {
    if (!b) continue;
    for (const m of b.members || []) {
      if (bareUserId(m?.user_id) !== uid) continue;
      if (TEAM_MANAGER_ROLES.has(String(m?.role || '').trim())) return true;
    }
  }
  return false;
}

/** Al invitar: Admin / Administrador / Gestor / Encargado usan panel SaaS (no «Mi trabajo»). */
export function inviteRoleUsesCeoAdminPanel(role?: string | null): boolean {
  return TEAM_MANAGER_ROLES.has(String(role || '').trim());
}

export function canManageTeam(
  user?: TeamUser,
  businesses?: TeamBusiness[] | null,
): boolean {
  if (!user?.user_id) return false;
  if (userOwnsAnyBusiness(user.user_id, businesses)) return true;
  if (user.permissions?.team?.edit) return true;
  if (TEAM_MANAGER_ROLES.has(String(user.role || '').trim())) return true;
  // 2º Admin: el rol vive en business.members aunque account.role falle.
  if (memberHasManagerRole(businesses, user.user_id)) return true;
  return false;
}

/** Invitado de RRHH (Administrador, Gestor, Encargado…): usa el panel SaaS como el titular. */
export function canUseCeoAdminPanel(
  user?: TeamUser,
  businesses?: TeamBusiness[] | null,
): boolean {
  return canManageTeam(user, businesses);
}

/** Misma regla: quien gestiona equipo puede ver nóminas de la empresa y subir el ZIP. */
export function canManagePayroll(
  user?: TeamUser,
  businesses?: TeamBusiness[] | null,
): boolean {
  return canManageTeam(user, businesses);
}
