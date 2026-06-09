import type { AlertRule, AlertRuleDepartment } from './settingsApi';
import { ruleDepartment } from './settingsApi';
import type { SubscriptionPlanTier } from './pointOfSaleLimits';
import { PLAN_TIER_LABELS } from './pointOfSaleLimits';

export type AlertPlanTier = 'basic' | 'normal' | 'pro';

export const ALERT_PLAN_TIER_ORDER: AlertPlanTier[] = ['basic', 'normal', 'pro'];

export const ALERT_PLAN_TIER_LABELS: Record<AlertPlanTier, string> = {
  basic: PLAN_TIER_LABELS.basic,
  normal: PLAN_TIER_LABELS.normal,
  pro: PLAN_TIER_LABELS.pro,
};

const TIER_RANK: Record<AlertPlanTier, number> = {
  basic: 0,
  normal: 1,
  pro: 2,
};

const PRO_DEPARTMENTS = new Set<AlertRuleDepartment>(['limpieza', 'construccion', 'verticales', 'sistema']);

const BASIC_RULE_IDS = new Set([
  'delivery_delayed_order',
  'delivery_kitchen_saturated',
  'delivery_product_out_of_stock',
  'delivery_no_active_riders',
  'delivery_cash_pending_close',
  'delivery_register_not_opened',
  'delivery_cash_discrepancy',
  'stale_delivery',
  'delivery_unattended',
  'stock_low',
  'out_of_stock',
  'low_stock',
  'negative_stock',
  'worker_no_clockin',
  'payment_overdue',
  'client_payment_overdue',
  'sale_cancelled',
  'lead_new',
]);

export function inferRulePlanTier(rule: Pick<AlertRule, 'id' | 'planTier' | 'department' | 'category'>): AlertPlanTier {
  if (rule.planTier === 'basic' || rule.planTier === 'normal' || rule.planTier === 'pro') {
    return rule.planTier;
  }
  if (BASIC_RULE_IDS.has(rule.id)) return 'basic';
  const dept = ruleDepartment(rule);
  if (PRO_DEPARTMENTS.has(dept)) return 'pro';
  return 'normal';
}

export function canAccessAlertTier(userTier: SubscriptionPlanTier, ruleTier: AlertPlanTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[ruleTier];
}

export function alertTierDescription(tier: AlertPlanTier): string {
  if (tier === 'basic') {
    return 'Esenciales de caja, pedidos, stock y cobros. Incluidas en todos los planes.';
  }
  if (tier === 'normal') {
    return 'Finanzas, RRHH, operaciones avanzadas, push y más departamentos.';
  }
  return 'Verticales, limpieza, construcción, email y catálogo completo de alertas.';
}
