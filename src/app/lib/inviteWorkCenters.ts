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
import {
  filterRetailWorkCentersForScope,
  resolveRetailScopeKind,
} from '../verticals/retailScopeRegistry';

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

function scopeInviteWorkCenters(
  all: WorkCenter[],
  business: Business,
  allBusinesses: Business[],
  accountBusinessCount?: number,
): WorkCenter[] {
  const businessId = resolveBusinessScopeId(business);
  const kind = resolveRetailScopeKind(business.businessType);
  const ctx = {
    business,
    businesses: allBusinesses,
    accountBusinessCount: accountBusinessCount ?? allBusinesses.length,
  };

  const retailTypes = new Set<WorkCenterType>(['punto_de_venta', 'almacen']);
  const retail = all.filter((wc) => retailTypes.has(wc.centerType));
  const nonRetail = all.filter((wc) => !retailTypes.has(wc.centerType));

  const scopedRetail =
    kind === 'restaurant' || kind === 'delivery' || kind === 'strict'
      ? filterRetailWorkCentersForScope(retail, ctx)
      : filterWorkCentersForBusinessScope(retail, businessId, {
          accountBusinessCount: ctx.accountBusinessCount,
        });

  const scopedNonRetail = filterWorkCentersForBusinessScope(nonRetail, businessId, {
    accountBusinessCount: ctx.accountBusinessCount,
  });

  return [...scopedRetail, ...scopedNonRetail];
}

/**
 * Fuente única de centros/tiendas para invitar trabajadores en todo el SaaS.
 * Restaurante (p. ej. bodegeta) usa scope retail aislado — sin tiendas de otros negocios.
 */
export async function loadInviteWorkCenters(
  authUser: AuthLike,
  business: Business | null | undefined,
  options?: { accountBusinessCount?: number; allBusinesses?: Business[] },
): Promise<WorkCenter[]> {
  const dataUserId = resolveBusinessDataUserId(authUser, business);
  if (!dataUserId || !business) return [];

  const allBusinesses = options?.allBusinesses?.length
    ? options.allBusinesses
    : business
      ? [business]
      : [];

  const all = await listWorkCentersForDelivery(dataUserId, business);
  const scoped = scopeInviteWorkCenters(
    all,
    business,
    allBusinesses,
    options?.accountBusinessCount,
  );

  return scoped
    .filter(isAssignableWorkCenter)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function loadInviteWorkCenterOptions(
  authUser: AuthLike,
  business: Business | null | undefined,
  options?: { accountBusinessCount?: number; allBusinesses?: Business[] },
): Promise<InviteWorkCenterOption[]> {
  const centers = await loadInviteWorkCenters(authUser, business, options);
  return centers.map((wc) => ({
    id: wc._id || wc.id,
    label: formatInviteWorkCenterLabel(wc),
    businessId: wc.businessId,
    centerType: wc.centerType,
  }));
}
