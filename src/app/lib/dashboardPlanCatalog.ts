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
 * Plan Básico: operativa mínima (ventas, alertas, accesos).
 * Normal: finanzas, gráficas, CRM, equipo.
 * Pro: bloques avanzados.
 */
export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetPlanEntry[] = [
  { id: 'kpis_main', label: 'KPIs principales', minPlan: 'basic', basicPreview: true },
  { id: 'quick_access', label: 'Accesos rápidos', minPlan: 'basic', basicPreview: true },
  { id: 'alertas', label: 'Alertas', minPlan: 'basic', basicPreview: true },
  { id: 'operations', label: 'Operativa del negocio', minPlan: 'basic', basicPreview: true },
  { id: 'charts', label: 'Gráficas principales', minPlan: 'normal' },
  { id: 'quick_finance', label: 'Resumen financiero', minPlan: 'normal' },
  { id: 'funnel', label: 'Embudo CRM', minPlan: 'normal' },
  { id: 'clockins', label: 'Fichajes del equipo', minPlan: 'normal' },
];

export function isDashboardWidgetUnlocked(
  id: DashboardWidgetId,
  planTier: SubscriptionPlanTier,
): boolean {
  const entry = DASHBOARD_WIDGET_CATALOG.find((w) => w.id === id);
  if (!entry) return true;
  return planMeetsReportTier(planTier, entry.minPlan, entry.basicPreview);
}

/** KPI EBITDA en la fila principal — Normal+. */
export function canViewDashboardEbitda(planTier: SubscriptionPlanTier): boolean {
  return planTier !== 'basic';
}

/** Widget Finanzas (saldo, spark chart) — Normal+. */
export function canViewDashboardFinanceWidget(planTier: SubscriptionPlanTier): boolean {
  return planTier !== 'basic';
}

export function getUnlockedDashboardWidgets(planTier: SubscriptionPlanTier): DashboardWidgetPlanEntry[] {
  return DASHBOARD_WIDGET_CATALOG.filter((w) => isDashboardWidgetUnlocked(w.id, planTier));
}

export function getLockedDashboardWidgets(planTier: SubscriptionPlanTier): DashboardWidgetPlanEntry[] {
  return DASHBOARD_WIDGET_CATALOG.filter((w) => !isDashboardWidgetUnlocked(w.id, planTier));
}
