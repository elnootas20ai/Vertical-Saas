import type { SubscriptionPlanTier } from './pointOfSaleLimits';
import { planMeetsReportTier } from './reportPlanCatalog';

/** Widgets del dashboard empresa (/saas/dashboard). */
export type DashboardWidgetId =
  | 'kpis_main'
  | 'quick_access'
  | 'alertas'
  | 'charts'
  | 'operations'
  | 'quick_finance'
  | 'funnel'
  | 'clockins';

export interface DashboardWidgetPlanEntry {
  id: DashboardWidgetId;
  label: string;
  minPlan: SubscriptionPlanTier;
  /** Visible en Básico aunque el mínimo sea Normal (solo KPIs operativos). */
  basicPreview?: boolean;
}

/**
 * Dashboard packing (VERTIAL-PRECIOS-PACKING):
 * - Básico / Mediano: Dashboard 1 — delivery: solo resumen operativo de arriba
 * - Pro: marcas avanzadas, gráficas, finanzas, embudo, fichajes, accesos, etc.
 */
export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetPlanEntry[] = [
  { id: 'kpis_main', label: 'KPIs principales', minPlan: 'basic', basicPreview: true },
  { id: 'operations', label: 'Operativa del negocio', minPlan: 'basic', basicPreview: true },
  { id: 'quick_access', label: 'Accesos rápidos', minPlan: 'pro' },
  { id: 'alertas', label: 'Alertas', minPlan: 'pro' },
  { id: 'charts', label: 'Gráficas principales', minPlan: 'pro' },
  { id: 'quick_finance', label: 'Resumen financiero', minPlan: 'pro' },
  { id: 'funnel', label: 'Embudo CRM', minPlan: 'pro' },
  { id: 'clockins', label: 'Fichajes del equipo', minPlan: 'pro' },
];

/** Delivery Mediano/Básico: solo el bloque superior (PortfolioOpsPulse). */
export function canViewDeliveryDashboardExtras(planTier: SubscriptionPlanTier): boolean {
  return planTier === 'pro';
}

export function isDashboardWidgetUnlocked(
  id: DashboardWidgetId,
  planTier: SubscriptionPlanTier,
): boolean {
  const entry = DASHBOARD_WIDGET_CATALOG.find((w) => w.id === id);
  if (!entry) return true;
  return planMeetsReportTier(planTier, entry.minPlan, entry.basicPreview);
}

/** KPI EBITDA en la fila principal — Pro. */
export function canViewDashboardEbitda(planTier: SubscriptionPlanTier): boolean {
  return planTier === 'pro';
}

/** Widget Finanzas (saldo, spark chart) — Pro. */
export function canViewDashboardFinanceWidget(planTier: SubscriptionPlanTier): boolean {
  return planTier === 'pro';
}

export function getUnlockedDashboardWidgets(planTier: SubscriptionPlanTier): DashboardWidgetPlanEntry[] {
  return DASHBOARD_WIDGET_CATALOG.filter((w) => isDashboardWidgetUnlocked(w.id, planTier));
}

export function getLockedDashboardWidgets(planTier: SubscriptionPlanTier): DashboardWidgetPlanEntry[] {
  return DASHBOARD_WIDGET_CATALOG.filter((w) => !isDashboardWidgetUnlocked(w.id, planTier));
}
