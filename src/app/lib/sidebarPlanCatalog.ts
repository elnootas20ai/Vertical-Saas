import type { SubscriptionPlanTier } from './pointOfSaleLimits';
import { planMeetsMinTier, type VertialPlanId } from './planCatalog';

export type SidebarPlanEntry = {
  minPlan: VertialPlanId;
};

/**
 * Plan mínimo por ítem del menú lateral.
 * Alineado a docs/VERTIAL-PRECIOS-PACKING.md (§1f / §1e):
 * - Básico: TPV + catálogo mínimo + dashboard 1 + clientes básicos
 * - Mediano: + inventario, escandallo, compras OCR (1 local)
 * - Pro: OPS, finanzas, alertas, RRHH, chat, calendario, canales, IMAP, API…
 * Ítems no listados → basic (operativa del vertical).
 */
export const SIDEBAR_PLAN_CATALOG: Record<string, SidebarPlanEntry> = {
  // ── Básico / suelo operativo ──
  dashboard: { minPlan: 'basic' },
  settings: { minPlan: 'basic' },
  configuracion: { minPlan: 'basic' },
  billing: { minPlan: 'basic' },
  clients: { minPlan: 'basic' },
  'delivery-clients': { minPlan: 'basic' },
  catalog: { minPlan: 'basic' },
  team: { minPlan: 'basic' },
  tpv: { minPlan: 'basic' },
  'tpv-rapido': { minPlan: 'basic' },
  'tpv-locales': { minPlan: 'basic' },
  caja: { minPlan: 'basic' },
  sala: { minPlan: 'basic' },
  cocina: { minPlan: 'basic' },
  reservas: { minPlan: 'basic' },
  'lista-espera': { minPlan: 'basic' },
  'delivery-ops': { minPlan: 'basic' },
  vehicles: { minPlan: 'basic' },
  workshop: { minPlan: 'basic' },
  parts: { minPlan: 'basic' },
  tech: { minPlan: 'basic' },
  sales: { minPlan: 'basic' },
  reservations: { minPlan: 'basic' },
  pipeline: { minPlan: 'basic' },
  'doc-society': { minPlan: 'basic' },
  'doc-other': { minPlan: 'basic' },

  // ── Mediano: inventario + escandallo + compras (OCR foto) ──
  'catalog-stock': { minPlan: 'normal' },
  costing: { minPlan: 'normal' },
  suppliers: { minPlan: 'normal' },
  verifactu: { minPlan: 'normal' },

  // ── Pro (o SVA en packing; hasta existir compra SVA = Pro) ──
  alertas: { minPlan: 'pro' },
  calendar: { minPlan: 'pro' },
  chat: { minPlan: 'pro' },
  clockins: { minPlan: 'pro' },
  'horarios-vacaciones': { minPlan: 'pro' },
  'hr-requests': { minPlan: 'pro' },
  commissions: { minPlan: 'pro' },
  payroll: { minPlan: 'pro' },
  gestoria: { minPlan: 'pro' },
  quotes: { minPlan: 'pro' },
  promotions: { minPlan: 'pro' },
  finance: { minPlan: 'pro' },
  'income-expenses': { minPlan: 'pro' },
  ebitda: { minPlan: 'pro' },
  taxes: { minPlan: 'pro' },
  reports: { minPlan: 'pro' },
  'sales-metrics': { minPlan: 'pro' },
  'catalog-invoice-email': { minPlan: 'pro' },
  'web-config': { minPlan: 'pro' },
  'web-orders': { minPlan: 'pro' },
  'delivery-integrations': { minPlan: 'pro' },
  'doc-contracts': { minPlan: 'pro' },
  'doc-licenses': { minPlan: 'pro' },
  'doc-financial': { minPlan: 'pro' },
  'doc-user-expenses': { minPlan: 'pro' },
  'client-billing': { minPlan: 'pro' },
  affiliates: { minPlan: 'pro' },
  operations: { minPlan: 'pro' },
  'bank-reconciliation': { minPlan: 'pro' },
  'worker-onboarding': { minPlan: 'pro' },
  api: { minPlan: 'pro' },
  webhooks: { minPlan: 'pro' },
};

/** Solo shell: siempre visibles aunque el plan sea inferior. */
export const SIDEBAR_PLAN_ALWAYS_VISIBLE = new Set([
  'dashboard',
  'settings',
  'configuracion',
  'billing',
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
