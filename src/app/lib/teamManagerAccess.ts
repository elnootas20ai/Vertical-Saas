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
