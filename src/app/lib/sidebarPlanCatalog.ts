import type { SubscriptionPlanTier } from './pointOfSaleLimits';
import { planMeetsMinTier, type VertialPlanId } from './planCatalog';

export type SidebarPlanEntry = {
  minPlan: VertialPlanId;
};

/**
 * Plan mínimo por ítem del menú lateral (core transversal).
 * Verticales específicos: operativa base = basic; informes avanzados del vertical = normal.
 * Ítems no listados → basic (operativa del negocio).
 */
export const SIDEBAR_PLAN_CATALOG: Record<string, SidebarPlanEntry> = {
  // ── Básico: operativa mínima ──
  dashboard: { minPlan: 'basic' },
  alertas: { minPlan: 'basic' },
  calendar: { minPlan: 'basic' },
  chat: { minPlan: 'basic' },
  clients: { minPlan: 'basic' },
  'delivery-clients': { minPlan: 'basic' },
  catalog: { minPlan: 'basic' },
  'catalog-stock': { minPlan: 'basic' },
  team: { minPlan: 'basic' },
  clockins: { minPlan: 'basic' },
  tpv: { minPlan: 'basic' },
  'tpv-rapido': { minPlan: 'basic' },
  'tpv-locales': { minPlan: 'basic' },
  caja: { minPlan: 'basic' },
  sala: { minPlan: 'basic' },
  reservas: { minPlan: 'basic' },
  'lista-espera': { minPlan: 'basic' },
  'delivery-ops': { minPlan: 'basic' },
  'web-orders': { minPlan: 'basic' },
  vehicles: { minPlan: 'basic' },
  workshop: { minPlan: 'basic' },
  parts: { minPlan: 'basic' },
  tech: { minPlan: 'basic' },
  sales: { minPlan: 'basic' },
  reservations: { minPlan: 'basic' },
  pipeline: { minPlan: 'basic' },
  'doc-society': { minPlan: 'basic' },
  'doc-other': { minPlan: 'basic' },
  settings: { minPlan: 'basic' },
  configuracion: { minPlan: 'basic' },

  // ── Mediano: finanzas, informes, RRHH ampliado ──
  quotes: { minPlan: 'normal' },
  promotions: { minPlan: 'normal' },
  finance: { minPlan: 'normal' },
  'income-expenses': { minPlan: 'normal' },
  ebitda: { minPlan: 'normal' },
  taxes: { minPlan: 'normal' },
  reports: { minPlan: 'normal' },
  'sales-metrics': { minPlan: 'normal' },
  commissions: { minPlan: 'normal' },
  payroll: { minPlan: 'normal' },
  'horarios-vacaciones': { minPlan: 'normal' },
  suppliers: { minPlan: 'normal' },
  costing: { minPlan: 'normal' },
  'web-config': { minPlan: 'normal' },
  'delivery-integrations': { minPlan: 'normal' },
  'doc-contracts': { minPlan: 'normal' },
  'doc-licenses': { minPlan: 'normal' },
  'doc-financial': { minPlan: 'normal' },
  'doc-user-expenses': { minPlan: 'normal' },
  'client-billing': { minPlan: 'normal' },
  billing: { minPlan: 'normal' },
  affiliates: { minPlan: 'normal' },
  operations: { minPlan: 'normal' },

  // ── Pro: multi-empresa, API, conciliación ──
  'bank-reconciliation': { minPlan: 'pro' },
  'worker-onboarding': { minPlan: 'pro' },
  api: { minPlan: 'pro' },
  webhooks: { minPlan: 'pro' },
};

/** Siempre visibles aunque el plan sea inferior (ajustes, facturación). */
export const SIDEBAR_PLAN_ALWAYS_VISIBLE = new Set([
  'dashboard',
  'settings',
  'configuracion',
  'chat',
  'team',
]);

export function getSidebarItemMinPlan(itemId: string): VertialPlanId {
  return SIDEBAR_PLAN_CATALOG[itemId]?.minPlan ?? 'basic';
}

export function isSidebarItemUnlockedForPlan(
  itemId: string,
  planTier: SubscriptionPlanTier,
): boolean {
  if (SIDEBAR_PLAN_ALWAYS_VISIBLE.has(itemId)) return true;
  const minPlan = getSidebarItemMinPlan(itemId);
  return planMeetsMinTier(planTier as VertialPlanId, minPlan);
}

export function sidebarPlanUpgradeLabel(minPlan: VertialPlanId): string {
  if (minPlan === 'pro') return 'Pro';
  if (minPlan === 'normal') return 'Mediano';
  return 'Básico';
}
