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

/** Al invitar: Admin / Administrador / Gestor / Encargado usan panel SaaS (no «Mi trabajo»). */
export function inviteRoleUsesCeoAdminPanel(role?: string | null): boolean {
  return TEAM_MANAGER_ROLES.has(String(role || '').trim());
}

export function canManageTeam(
  user?: {
    user_id?: string;
    role?: string;
    permissions?: Record<string, { view?: boolean; edit?: boolean }>;
  } | null,
  businesses?: { owner_user_id?: string }[] | null,
): boolean {
  if (!user?.user_id) return false;
  if (userOwnsAnyBusiness(user.user_id, businesses)) return true;
  if (user.permissions?.team?.edit) return true;
  if (TEAM_MANAGER_ROLES.has(String(user.role || '').trim())) return true;
  return false;
}

/** Invitado de RRHH (Administrador, Gestor, Encargado…): usa el panel SaaS como el titular. */
export function canUseCeoAdminPanel(
  user?: {
    user_id?: string;
    role?: string;
    permissions?: Record<string, { view?: boolean; edit?: boolean }>;
  } | null,
  businesses?: { owner_user_id?: string }[] | null,
): boolean {
  return canManageTeam(user, businesses);
}

/** Misma regla: quien gestiona equipo puede ver nóminas de la empresa y subir el ZIP. */
export function canManagePayroll(
  user?: {
    user_id?: string;
    role?: string;
    permissions?: Record<string, { view?: boolean; edit?: boolean }>;
  } | null,
  businesses?: { owner_user_id?: string }[] | null,
): boolean {
  return canManageTeam(user, businesses);
}
