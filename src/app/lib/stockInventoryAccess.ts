import { userOwnsAnyBusiness } from './workerProfileCompletion';

/** Roles que por defecto gestionan inventario (cerrar revisión + preparar compra). */
export const STOCK_INVENTORY_MANAGER_ROLES = new Set([
  'Admin',
  'Gerente',
  'GerenteGrupo',
  'Administrador',
  'Encargado',
  'Gestor',
  'Superadmin',
]);

type StockAccessUser = {
  user_id?: string;
  id?: string;
  role?: string;
  permissions?: Record<string, { view?: boolean; edit?: boolean }>;
} | null | undefined;

type StockAccessBusiness = {
  business_id?: string;
  id?: string;
  owner_user_id?: string;
  members?: { user_id?: string; role?: string }[];
} | null | undefined;

function bareUserId(value: string | null | undefined): string {
  return String(value || '').replace(/^account:/, '').trim();
}

function memberHasInventoryManagerRole(
  businesses: StockAccessBusiness[] | null | undefined,
  userId: string,
): boolean {
  const uid = bareUserId(userId);
  if (!uid || !Array.isArray(businesses)) return false;
  for (const b of businesses) {
    if (!b) continue;
    for (const m of b.members || []) {
      if (bareUserId(m?.user_id) !== uid) continue;
      if (STOCK_INVENTORY_MANAGER_ROLES.has(String(m?.role || '').trim())) return true;
    }
  }
  return false;
}

/**
 * Cerrar revisión de stock y preparar compra.
 * RRHH: permiso `inventory.edit` en Equipo. Por defecto ON en Encargado/Admin/CEO.
 * El Encargado de delivery (Mi trabajo) también puede si tiene el permiso o el rol.
 */
export function canManageStockInventory(
  user?: StockAccessUser,
  businesses?: StockAccessBusiness[] | null,
): boolean {
  if (!user) return false;
  const uid = bareUserId(user.user_id || user.id);
  if (!uid) return false;

  if (userOwnsAnyBusiness(uid, businesses)) return true;

  const inv = user.permissions?.inventory;
  if (inv) {
    if (inv.edit) return true;
    // Toggle explícito en OFF (view false y edit false) → no gestiona.
    if (inv.view === false && inv.edit === false) return false;
    if (inv.edit === false) return false;
  }

  if (STOCK_INVENTORY_MANAGER_ROLES.has(String(user.role || '').trim())) return true;
  if (memberHasInventoryManagerRole(businesses, uid)) return true;
  return false;
}
