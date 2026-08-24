export { isDeliveryInvitedEncargadoWorker } from './deliveryEncargadoAccess';
import { isDeliveryBusinessType } from './deliverySetup';
import { isDeliveryInvitedEncargadoWorker } from './deliveryEncargadoAccess';
import { userOwnsAnyBusiness } from './workerProfileCompletion';

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
  accountType?: string;
  invitedBy?: string;
  linkedBusinessId?: string;
  permissions?: Record<string, { view?: boolean; edit?: boolean }>;
} | null | undefined;

type TeamBusiness = {
  business_id?: string;
  id?: string;
  businessType?: string;
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
      const memberRole = String(m?.role || '').trim();
      if (!TEAM_MANAGER_ROLES.has(memberRole)) continue;
      if (memberRole === 'Encargado' && isDeliveryBusinessType(b.businessType)) continue;
      return true;
    }
  }
  return false;
}

/** Al invitar: Admin / Administrador / Gestor usan panel SaaS. Delivery Encargado → Mi trabajo. */
export function inviteRoleUsesCeoAdminPanel(
  role?: string | null,
  businessType?: string | null,
): boolean {
  const normalizedRole = String(role || '').trim();
  if (normalizedRole === 'Encargado' && isDeliveryBusinessType(businessType)) return false;
  return TEAM_MANAGER_ROLES.has(normalizedRole);
}

export function canManageTeam(
  user?: TeamUser,
  businesses?: TeamBusiness[] | null,
): boolean {
  if (!user?.user_id) return false;
  if (userOwnsAnyBusiness(user.user_id, businesses)) return true;
  if (isDeliveryInvitedEncargadoWorker(user, businesses)) return false;
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
