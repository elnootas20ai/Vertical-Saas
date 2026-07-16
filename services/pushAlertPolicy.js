/**
 * Política de push móvil — avisos urgentes al CEO (críticas + dinero/caja).
 * No enviamos el catálogo completo: el iPhone debe sonar por lo que importa al dueño.
 */
import { resolveAlertPlanTier } from './alertPlanTiers.js';
import { resolvePlanTier } from './subscriptionAddons.js';
import { findAccountByUserId } from './couchdb.js';

const PLAN_TIER_RANK = { basic: 0, normal: 1, pro: 2 };

/**
 * Reglas que llegan al iPhone del CEO con banner + sonido.
 * Enfoque: críticas + caja + impagos (poco ruido operativo).
 */
export const CEO_MOBILE_PUSH_RULE_IDS = new Set([
  // ── Críticas ──
  'delivery_cash_discrepancy',
  'payment_overdue',
  'negative_cash_flow',
  'tax_deadline_overdue',

  // ── Caja / TPV ──
  'delivery_cash_pending_close',
  'delivery_register_not_opened',
  'register_high_return',
  'delivery_driver_mismatch',
  'butcher_register_pending',

  // ── Impagos / cobros ──
  'delivery_unpaid_order',
  'delivery_unpaid',
  'client_payment_overdue',
  'overdue_client_invoice',
  'supplier_invoice_overdue',
  'sale_cancelled',
  'cv_sale_unpaid',
  'scrapyard_sale_unpaid',
  'cleaning_client_unpaid',
  'construction_collection_overdue',
  'construction_payment_overdue',
]);

/** Alias usado por pushService / tests. */
export const MOBILE_PUSH_RULE_IDS = CEO_MOBILE_PUSH_RULE_IDS;

export function resolveRuleKey(ruleId, category) {
  const id = String(ruleId || category || '').trim();
  return id || null;
}

export function isMobilePushWhitelisted(ruleId, category) {
  const key = resolveRuleKey(ruleId, category);
  if (!key) return false;
  return CEO_MOBILE_PUSH_RULE_IDS.has(key);
}

/** Alias semántico: alerta urgente de dinero/caja al CEO. */
export function isCeoUrgentMobilePushRule(ruleId, category) {
  return isMobilePushWhitelisted(ruleId, category);
}

export async function userMeetsPushPlanTier(req, userId, ruleId, category) {
  if (!userId) return false;
  try {
    const account = await findAccountByUserId(req, userId);
    if (!account) return true;
    const sub = account.subscription || {};
    if (sub.billingExempt || sub.adminProAccess) return true;
    const userTier = resolvePlanTier(sub.selectedPlanId, sub.planName);
    const ruleTier = resolveAlertPlanTier(ruleId || category, 'operaciones');
    return (PLAN_TIER_RANK[userTier] ?? 0) >= (PLAN_TIER_RANK[ruleTier] ?? 1);
  } catch {
    return true;
  }
}

/**
 * ¿Enviar push móvil a este usuario para esta alerta?
 * Requiere: canal push activo + whitelist CEO + plan del usuario.
 */
export async function shouldSendMobilePush(req, {
  userId,
  ruleId,
  category,
  channels = [],
}) {
  if (!channels.includes('push')) return false;
  if (!isMobilePushWhitelisted(ruleId, category)) return false;
  return userMeetsPushPlanTier(req, userId, ruleId, category);
}
