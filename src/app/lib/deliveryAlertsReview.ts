/**
 * Primera revisión de alertas Delivery: pack CEO activo por defecto;
 * el resto queda apagado pero pendiente de revisar/activar.
 */

import type { AlertRule } from './settingsApi';

/** Alineado con services/alertRulesCatalog.js — DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS */
export const DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS = [
  'delivery_cash_pending_close',
  'delivery_register_not_opened',
  'delivery_cash_discrepancy',
  'register_high_return',
  'delivery_unpaid_order',
  'delivery_failed_delivery',
  'delivery_delayed_order',
  'delivery_no_address',
  'delivery_product_out_of_stock',
  'delivery_order_cancelled',
  'worker_no_clockin',
] as const;

const CEO_SET = new Set<string>(DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS);

const LEGACY_IDS = new Set([
  'stale_delivery',
  'delivery_unpaid',
  'delivery_unattended',
]);

export const DELIVERY_ALERTS_REVIEW_ENTITY_TYPE = 'alerts_review';
export const DELIVERY_ALERTS_REVIEW_ROUTE = '/saas/alerts?tab=ajustes&focus=delivery-review';

export interface DeliveryAlertsReviewState {
  completedAt?: string | null;
  notifSentAt?: string | null;
}

export function deliveryAlertsReviewEntityId(businessId: string): string {
  return `delivery-alerts-review-${String(businessId || '').trim()}`;
}

export function isDeliveryAlertsReviewPending(
  review?: DeliveryAlertsReviewState | null,
): boolean {
  return !review?.completedAt;
}

/** Reglas de operación delivery/sala/caja (excluye legacy). */
export function isDeliveryReviewRule(rule: Pick<AlertRule, 'id' | 'category' | 'department'>): boolean {
  const id = String(rule.id || '');
  if (!id || LEGACY_IDS.has(id)) return false;
  if (CEO_SET.has(id)) return true;
  if (id.startsWith('delivery_') || id.startsWith('sala_')) return true;
  if (id === 'register_high_return') return true;
  if (rule.category === 'delivery' || rule.category === 'sala') return true;
  if (rule.department === 'delivery' || rule.department === 'pdvs') return true;
  return false;
}

export function isCeoDefaultRuleId(ruleId: string): boolean {
  return CEO_SET.has(String(ruleId || ''));
}

export function splitDeliveryReviewRules(rules: AlertRule[]): {
  recommended: AlertRule[];
  optionalPending: AlertRule[];
  optionalEnabled: AlertRule[];
} {
  const deliveryRules = rules.filter(isDeliveryReviewRule);
  const recommended = deliveryRules.filter((r) => isCeoDefaultRuleId(r.id));
  const optional = deliveryRules.filter((r) => !isCeoDefaultRuleId(r.id));
  return {
    recommended,
    optionalPending: optional.filter((r) => !r.enabled),
    optionalEnabled: optional.filter((r) => r.enabled),
  };
}

export function countDeliveryPendingActivation(rules: AlertRule[]): number {
  return splitDeliveryReviewRules(rules).optionalPending.length;
}
