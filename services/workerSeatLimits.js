/**
 * Cupo de trabajadores por suscripción de la cuenta dueña de la empresa.
 * Usado = miembros (sin owner) + invitaciones pending.
 */
import {
  getEffectiveWorkerSeatLimit,
  resolvePlanTier,
} from '../shared/billing/entitlements.js';
import {
  findAccountByUserId,
  listInvitationsByBusiness,
} from './couchdb.js';

export function countActiveWorkerMembers(business) {
  const ownerId = String(business?.owner_user_id || '').trim();
  const members = Array.isArray(business?.members) ? business.members : [];
  return members.filter((m) => {
    const uid = String(m?.user_id || '').trim();
    if (!uid) return false;
    if (ownerId && uid === ownerId) return false;
    return true;
  }).length;
}

export function countPendingWorkerInvitations(invitations = []) {
  return (invitations || []).filter(
    (inv) => inv && !inv.deletedAt && String(inv.status || '') === 'pending',
  ).length;
}

export async function getBusinessWorkerSeatUsage(req, business) {
  const businessId = String(business?.business_id || '').trim();
  const membersUsed = countActiveWorkerMembers(business);
  let pendingInvites = 0;
  if (businessId) {
    try {
      const invites = await listInvitationsByBusiness(req, businessId, { includeAll: false });
      pendingInvites = countPendingWorkerInvitations(invites);
    } catch {
      pendingInvites = 0;
    }
  }
  return {
    membersUsed,
    pendingInvites,
    used: membersUsed + pendingInvites,
  };
}

export async function resolveOwnerSubscriptionForBusiness(req, business) {
  const ownerId = String(business?.owner_user_id || '').trim();
  if (!ownerId) return null;
  try {
    const owner = await findAccountByUserId(req, ownerId);
    return owner?.subscription || null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   code?: string,
 *   error?: string,
 *   limit: number,
 *   used: number,
 *   remaining: number,
 *   membersUsed: number,
 *   pendingInvites: number,
 *   planTier: string,
 * }>}
 */
export async function evaluateWorkerSeatCapacity(req, business, { seatsNeeded = 1 } = {}) {
  const needed = Math.max(1, Math.floor(Number(seatsNeeded) || 1));
  const subscription = await resolveOwnerSubscriptionForBusiness(req, business);
  const usage = await getBusinessWorkerSeatUsage(req, business);
  const limit = getEffectiveWorkerSeatLimit(subscription);
  const remaining = Math.max(0, limit - usage.used);
  const tier = resolvePlanTier(subscription?.selectedPlanId, subscription?.planName);

  if (usage.used + needed > limit) {
    return {
      ok: false,
      code: 'WORKER_SEAT_LIMIT',
      error:
        `Has alcanzado el cupo de trabajadores (${usage.used}/${limit}). `
        + `Si añades más personas, te sube la facturación (+5€/mes por trabajador extra). `
        + 'Amplía el cupo en Mi plan o contacta con Vertial antes de invitar.',
      limit,
      used: usage.used,
      remaining,
      membersUsed: usage.membersUsed,
      pendingInvites: usage.pendingInvites,
      planTier: tier,
    };
  }

  return {
    ok: true,
    limit,
    used: usage.used,
    remaining,
    membersUsed: usage.membersUsed,
    pendingInvites: usage.pendingInvites,
    planTier: tier,
  };
}
