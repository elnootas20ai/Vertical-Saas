import type { Business } from './businessApi';
import { resolveBusinessDataUserId } from './tenantUserId';
import {
  filterWorkCentersForBusinessScope,
  resolveBusinessScopeId,
} from './deliverySetup';
import {
  listWorkCentersForDelivery,
  WORK_CENTER_TYPE_SHORT,
  type WorkCenter,
  type WorkCenterType,
} from './workCentersApi';

type AuthLike = { user_id?: string; id?: string } | null | undefined;

/** Tipos asignables al invitar (tienda, almacén, oficina operativa). */
const INVITE_ASSIGNABLE_TYPES = new Set<WorkCenterType>([
  'punto_de_venta',
  'almacen',
  'oficina',
  'custom',
]);

export interface InviteWorkCenterOption {
  id: string;
  label: string;
  businessId?: string;
  centerType: WorkCenterType;
}

function isAssignableWorkCenter(wc: WorkCenter): boolean {
  if (wc.deletedAt) return false;
  if (wc.active === false) return false;
  return INVITE_ASSIGNABLE_TYPES.has(wc.centerType);
}

function formatInviteWorkCenterLabel(wc: WorkCenter): string {
  const name = String(wc.name || '').trim() || 'Sin nombre';
  const typeShort = WORK_CENTER_TYPE_SHORT[wc.centerType];
  if (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen') {
    return name;
  }
  return `${name} (${typeShort})`;
}

/**
 * Fuente única de centros/tiendas para invitar trabajadores en todo el SaaS.
 * Usa la misma lectura que delivery/Ajustes → Tiendas (titular + scope por negocio).
 */
export async function loadInviteWorkCenters(
  authUser: AuthLike,
  business: Business | null | undefined,
  options?: { accountBusinessCount?: number },
): Promise<WorkCenter[]> {
  const dataUserId = resolveBusinessDataUserId(authUser, business);
  if (!dataUserId) return [];

  const businessId = resolveBusinessScopeId(business);
  const all = await listWorkCentersForDelivery(dataUserId, business ?? null);
  const scoped = filterWorkCentersForBusinessScope(all, businessId, {
    accountBusinessCount: options?.accountBusinessCount,
  });

  return scoped
    .filter(isAssignableWorkCenter)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function loadInviteWorkCenterOptions(
  authUser: AuthLike,
  business: Business | null | undefined,
): Promise<InviteWorkCenterOption[]> {
  const centers = await loadInviteWorkCenters(authUser, business);
  return centers.map((wc) => ({
    id: wc._id || wc.id,
    label: formatInviteWorkCenterLabel(wc),
    businessId: wc.businessId,
    centerType: wc.centerType,
  }));
}
