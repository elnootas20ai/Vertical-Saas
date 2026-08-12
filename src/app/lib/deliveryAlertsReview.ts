/**
 * Primera revisión de alertas Delivery: pack compacto (solo cableado).
 * Mantener alineado con services/alertRulesCatalog.js
 */

import type { AlertRule } from './settingsApi';

/**
 * 1 fichaje · 2 docs empresa · 3 caja abrir/cerrar · 4 descuadre ·
 * 5 pedido retrasado · 6 sin cobrar/cancelado.
 * Sin producto agotado.
 */
export const DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS = [
  'worker_no_clockin',
  'document_missing_required',
  'document_expired',
  'document_expiring_soon',
  'delivery_register_not_opened',
  'delivery_cash_pending_close',
  'delivery_cash_discrepancy',
  'delivery_register_closed_discrepancy',
  'delivery_delayed_order',
  'delivery_order_very_delayed',
  'delivery_unpaid_order',
  'delivery_order_cancelled',
] as const;

export const DELIVERY_COMPACT_VISIBLE_RULE_IDS = DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS;

const CEO_SET = new Set<string>(DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS);
const COMPACT_SET = new Set<string>(DELIVERY_COMPACT_VISIBLE_RULE_IDS);

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

export function isDeliveryCompactAlertRuleId(ruleId: string): boolean {
  return COMPACT_SET.has(String(ruleId || ''));
}

/** Solo el pack compacto visible/revisable en delivery. */
export function isDeliveryReviewRule(rule: Pick<AlertRule, 'id' | 'category' | 'department'>): boolean {
  const id = String(rule.id || '');
  if (!id || LEGACY_IDS.has(id)) return false;
  return isDeliveryCompactAlertRuleId(id);
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
