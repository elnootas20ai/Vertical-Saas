/**
 * Gate servidor: cerrar revisión / preparar compra.
 * Alineado con src/app/lib/stockInventoryAccess.ts
 */

import { findAccountByUserId, listBusinessesByUser, normalizePermissionMatrix } from './couchdb.js';

const STOCK_INVENTORY_MANAGER_ROLES = new Set([
  'Admin',
  'Gerente',
  'GerenteGrupo',
  'Administrador',
  'Encargado',
  'Gestor',
  'Superadmin',
]);

function bareUserId(value) {
  return String(value || '').replace(/^account:/, '').trim();
}

function actorIdFromRequest(req) {
  return bareUserId(
    req.authUser?.userId
      || req.authUser?.user_id
      || req.callerUserId
      || '',
  );
}

/**
 * @returns {Promise<{ ok: true, actorId: string } | { ok: false, status: number, error: string }>}
 */
export async function assertCanManageStockInventory(req, dataUserId) {
  const dataUid = bareUserId(dataUserId);
  const actorId = actorIdFromRequest(req);

  if (!actorId) {
    return { ok: false, status: 401, error: 'Sesión requerida para gestionar inventario' };
  }

  // Dueño de los datos (CEO / cuenta del negocio).
  if (dataUid && actorId === dataUid) {
    return { ok: true, actorId };
  }

  let account = null;
  try {
    account = await findAccountByUserId(req, actorId);
  } catch {
    account = null;
  }
  if (!account || account.deletedAt) {
    return { ok: false, status: 403, error: 'Sin permiso de Inventario' };
  }

  const role = String(account.role || req.authUser?.role || '').trim();
  const matrix = normalizePermissionMatrix(account.permissions, role || 'Usuario');
  const inv = matrix?.inventory;

  if (inv?.edit) {
    return { ok: true, actorId };
  }
  // Toggle explícito OFF
  if (inv && inv.edit === false && inv.view === false) {
    return { ok: false, status: 403, error: 'Sin permiso de Inventario. Pídeselo en Equipo / RRHH.' };
  }
  if (inv && inv.edit === false) {
    return { ok: false, status: 403, error: 'Sin permiso de Inventario. Pídeselo en Equipo / RRHH.' };
  }

  if (STOCK_INVENTORY_MANAGER_ROLES.has(role)) {
    return { ok: true, actorId };
  }

  // Rol en business.members (Encargado invitado).
  try {
    const businesses = await listBusinessesByUser(req, actorId);
    for (const b of businesses || []) {
      if (b?.deletedAt) continue;
      const owner = bareUserId(b.owner_user_id);
      if (dataUid && owner && owner !== dataUid) continue;
      for (const m of b.members || []) {
        if (bareUserId(m?.user_id) !== actorId) continue;
        if (STOCK_INVENTORY_MANAGER_ROLES.has(String(m?.role || '').trim())) {
          return { ok: true, actorId };
        }
      }
    }
  } catch {
    // ignore
  }

  return {
    ok: false,
    status: 403,
    error: 'Solo el encargado (o quien tenga permiso de Inventario) puede hacer esto',
  };
}
