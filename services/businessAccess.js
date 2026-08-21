import { findAccountByUserId, findBusinessById, listBusinessesByUser } from './couchdb.js';
import { getAuthUserId, getMember } from './clockinsAccess.js';
import { isManagerRole } from './managerRoles.js';
import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';

function normalizeBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function normalizeUserId(value) {
  return String(value || '').replace(/^account:/, '').trim();
}

export function isBusinessOwner(business, userId) {
  const uid = normalizeUserId(userId);
  if (!uid || !business) return false;
  return normalizeUserId(business.owner_user_id) === uid;
}

export function canAccessBusiness(business, userId) {
  const uid = normalizeUserId(userId);
  if (!uid || !business) return false;
  if (isBusinessOwner(business, uid)) return true;
  return Boolean(getMember(business, uid));
}

export function isBusinessTeamMember(business, userId) {
  return canAccessBusiness(business, userId);
}

export function canManageBusinessTeam(business, userId) {
  const uid = normalizeUserId(userId);
  if (!uid || !business) return false;
  if (isBusinessOwner(business, uid)) return true;
  const member = getMember(business, uid);
  return Boolean(member && isManagerRole(member.role));
}

/**
 * Roles de confianza «casi CEO»: solo el propietario de la empresa puede
 * invitarlos, expulsarlos o cambiarles el rol (Admin invitado no puede).
 * Encargado/Gestor sí los gestiona el Admin del negocio.
 */
export const OWNER_ONLY_PEER_ROLES = new Set([
  'Admin',
  'Gerente',
  'GerenteGrupo',
  'Administrador',
  'Superadmin',
]);

/** @deprecated Preferir OWNER_ONLY_PEER_ROLES / isOwnerOnlyPeerRole. */
export const OWNER_GATED_TEAM_ROLES = new Set([
  ...OWNER_ONLY_PEER_ROLES,
  'Encargado',
  'Gestor',
]);

export function isOwnerOnlyPeerRole(role) {
  return OWNER_ONLY_PEER_ROLES.has(String(role || '').trim());
}

export function isOwnerGatedTeamRole(role) {
  return isOwnerOnlyPeerRole(role);
}

/** Titular de cuenta SaaS (no trabajador invitado). */
export function isTenantAccountOwner(account) {
  if (!account || account.deletedAt) return false;
  if (isVertialSuperAdminEmail(account.email)) return true;
  if (String(account.invitedBy || '').trim()) return false;
  if (String(account.accountType || '').trim() === 'user') return false;
  return true;
}

export function canRemoveBusinessMember(business, actorUserId, targetUserId) {
  const actor = normalizeUserId(actorUserId);
  const target = normalizeUserId(targetUserId);
  if (!actor || !target || !business) return false;
  if (isBusinessOwner(business, target)) return false;
  if (!canManageBusinessTeam(business, actor)) return false;
  if (isBusinessOwner(business, actor)) return true;
  const member = getMember(business, target);
  if (isOwnerOnlyPeerRole(member?.role)) return false;
  return true;
}

export function canChangeBusinessMemberRole(business, actorUserId, currentRole, nextRole) {
  const actor = normalizeUserId(actorUserId);
  if (!actor || !business) return false;
  if (!canManageBusinessTeam(business, actor)) return false;
  if (isBusinessOwner(business, actor)) return true;
  if (isOwnerOnlyPeerRole(currentRole) || isOwnerOnlyPeerRole(nextRole)) return false;
  return true;
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
    try {
      const account = await findAccountByUserId(req, userId);
      const linked = normalizeBusinessId(account?.linkedBusinessId);
      if (linked && linked === bid) {
        return { ok: true, business, userId };
      }
    } catch {
      /* ignore */
    }
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

/** Solo el creador/propietario de la empresa. */
export async function assertBusinessOwner(req, businessId) {
  const base = await assertBusinessTeamAccess(req, businessId);
  if (!base.ok) return base;
  if (!isBusinessOwner(base.business, base.userId)) {
    return {
      ok: false,
      status: 403,
      error: 'Solo el creador de la cuenta (propietario) puede hacer esta acción',
      code: 'OWNER_ONLY',
    };
  }
  return base;
}

/**
 * Acciones de facturación / crear empresas / grupos:
 * el actor debe ser el propio userId y titular de cuenta (no invitado).
 */
export async function assertTenantAccountOwnerSelf(req, targetUserId) {
  const actorId = getAuthUserId(req);
  if (!actorId) {
    return { ok: false, status: 401, error: 'No autenticado' };
  }
  const target = normalizeUserId(targetUserId);
  if (!target) {
    return { ok: false, status: 400, error: 'Falta userId' };
  }
  if (isVertialSuperAdminEmail(req.authUser?.email)) {
    const account = await findAccountByUserId(req, target);
    if (!account) return { ok: false, status: 404, error: 'Usuario no encontrado' };
    return { ok: true, userId: target, account };
  }
  if (actorId !== target) {
    return {
      ok: false,
      status: 403,
      error: 'Solo el titular de la cuenta puede hacer esta acción',
      code: 'OWNER_ONLY',
    };
  }
  const account = await findAccountByUserId(req, actorId);
  if (!account) {
    return { ok: false, status: 404, error: 'Usuario no encontrado' };
  }
  if (!isTenantAccountOwner(account)) {
    return {
      ok: false,
      status: 403,
      error: 'Solo el creador de la cuenta puede gestionar facturación, empresas o grupos',
      code: 'OWNER_ONLY',
    };
  }
  return { ok: true, userId: actorId, account };
}

export async function listAccessibleBusinesses(req) {
  const userId = getAuthUserId(req);
  if (!userId) return [];
  return listBusinessesByUser(req, userId);
}

export function businessMemberUserIds(business) {
  const ids = new Set();
  const ownerId = normalizeUserId(business?.owner_user_id);
  if (ownerId) ids.add(ownerId);
  for (const member of business?.members || []) {
    const uid = String(member?.user_id || '').trim();
    if (uid) ids.add(uid);
  }
  return ids;
}
