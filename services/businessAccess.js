import { findBusinessById, listBusinessesByUser } from './couchdb.js';
import { getAuthUserId, getMember } from './clockinsAccess.js';
import { isManagerRole } from './managerRoles.js';

function normalizeBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

export function canAccessBusiness(business, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !business) return false;
  if (normalizeBusinessId(business.owner_user_id) === uid) return true;
  return Boolean(getMember(business, uid));
}

export function isBusinessTeamMember(business, userId) {
  return canAccessBusiness(business, userId);
}

export function canManageBusinessTeam(business, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !business) return false;
  if (normalizeBusinessId(business.owner_user_id) === uid) return true;
  const member = getMember(business, uid);
  return Boolean(member && isManagerRole(member.role));
}

export async function assertBusinessTeamAccess(req, businessId) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return { ok: false, status: 401, error: 'No autenticado' };
  }
  const bid = normalizeBusinessId(businessId);
  if (!bid) {
    return { ok: false, status: 400, error: 'Falta businessId' };
  }
  const business = await findBusinessById(req, bid);
  if (!business) {
    return { ok: false, status: 404, error: 'Empresa no encontrada' };
  }
  if (!canAccessBusiness(business, userId)) {
    return { ok: false, status: 403, error: 'No autorizado para esta empresa' };
  }
  return { ok: true, business, userId };
}

export async function assertBusinessTeamManage(req, businessId) {
  const base = await assertBusinessTeamAccess(req, businessId);
  if (!base.ok) return base;
  if (!canManageBusinessTeam(base.business, base.userId)) {
    return { ok: false, status: 403, error: 'No tienes permiso para gestionar este equipo' };
  }
  return base;
}

export async function listAccessibleBusinesses(req) {
  const userId = getAuthUserId(req);
  if (!userId) return [];
  return listBusinessesByUser(req, userId);
}

export function businessMemberUserIds(business) {
  const ids = new Set();
  const ownerId = normalizeBusinessId(business?.owner_user_id);
  if (ownerId) ids.add(ownerId);
  for (const member of business?.members || []) {
    const uid = String(member?.user_id || '').trim();
    if (uid) ids.add(uid);
  }
  return ids;
}
