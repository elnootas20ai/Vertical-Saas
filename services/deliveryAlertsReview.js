/**
 * Primera revisión alertas Delivery — helpers compartidos con el catálogo.
 */

import {
  DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS,
  DELIVERY_LEGACY_DUPLICATE_RULE_IDS,
  isDeliveryCompactAlertRuleId,
} from './alertRulesCatalog.js';

const CEO_SET = new Set(DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS);
const LEGACY_SET = new Set(DELIVERY_LEGACY_DUPLICATE_RULE_IDS);

export function sanitizeDeliveryAlertsReview(raw) {
  if (!raw || typeof raw !== 'object') {
    return { completedAt: null, notifSentAt: null };
  }
  return {
    completedAt: raw.completedAt ? String(raw.completedAt).slice(0, 40) : null,
    notifSentAt: raw.notifSentAt ? String(raw.notifSentAt).slice(0, 40) : null,
  };
}

export function isDeliveryAlertsReviewPending(review) {
  return !review?.completedAt;
}

/** Solo el pack compacto (6 bloques reales). El resto no entra en revisión ni ajustes. */
export function isDeliveryReviewRule(rule) {
  const id = String(rule?.id || '');
  if (!id || LEGACY_SET.has(id)) return false;
  return isDeliveryCompactAlertRuleId(id) || CEO_SET.has(id);
}
