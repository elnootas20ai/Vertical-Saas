import { isWorkerAccount } from './authApi';
import { isDeliveryBusinessType } from './deliverySetup';

type EncargadoUser = {
  user_id?: string;
  role?: string;
  accountType?: string;
  invitedBy?: string;
  linkedBusinessId?: string;
} | null | undefined;

type EncargadoBusiness = {
  business_id?: string;
  id?: string;
  businessType?: string;
  owner_user_id?: string;
  members?: { user_id?: string; role?: string }[];
} | null | undefined;

function bareUserId(value: string | null | undefined): string {
  return String(value || '').replace(/^account:/, '').trim();
}

function businessScopeId(business?: EncargadoBusiness | null): string {
  return String(business?.business_id || business?.id || '').trim();
}

function userOwnsAnyBusiness(
  userId?: string | null,
  businesses?: ReadonlyArray<{ owner_user_id?: string | null }> | null,
): boolean {
  const uid = String(userId || '').trim();
  if (!uid || !businesses?.length) return false;
  return businesses.some((b) => String(b.owner_user_id || '').trim() === uid);
}

function deliveryBusinessesForUser(
  user?: EncargadoUser,
  businesses?: EncargadoBusiness[] | null,
): EncargadoBusiness[] {
  if (!Array.isArray(businesses)) return [];
  const linkedId = String(user?.linkedBusinessId || '').trim();
  if (linkedId) {
    const linked = businesses.filter((b) => businessScopeId(b) === linkedId);
    if (linked.length) return linked.filter((b) => isDeliveryBusinessType(b?.businessType));
  }
  return businesses.filter((b) => isDeliveryBusinessType(b?.businessType));
}

function userIsEncargadoInBusiness(
  user?: EncargadoUser,
  business?: EncargadoBusiness | null,
): boolean {
  if (!user?.user_id || !business) return false;
  const uid = bareUserId(user.user_id);
  if (String(user.role || '').trim() === 'Encargado') return true;
  for (const m of business.members || []) {
    if (bareUserId(m?.user_id) !== uid) continue;
    if (String(m?.role || '').trim() === 'Encargado') return true;
  }
  return false;
}

/**
 * Encargado invitado en delivery: opera en tienda como trabajador (Mi trabajo),
 * sin panel CEO, selector de tiendas ni RRHH de empresa.
 */
export function isDeliveryInvitedEncargadoWorker(
  user?: EncargadoUser,
  businesses?: EncargadoBusiness[] | null,
): boolean {
  if (!user?.user_id || !isWorkerAccount(user)) return false;
  if (userOwnsAnyBusiness(user.user_id, businesses)) return false;
  const deliveryBusinesses = deliveryBusinessesForUser(user, businesses);
  if (!deliveryBusinesses.length) return false;
  return deliveryBusinesses.some((b) => userIsEncargadoInBusiness(user, b));
}
