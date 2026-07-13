/**
 * Política de push móvil — NO enviamos las 80+ reglas del catálogo.
 * Solo alertas operativas críticas, filtradas por plan Básico · Normal · Pro.
 */
import { resolveAlertPlanTier } from './alertPlanTiers.js';
import { resolvePlanTier } from './subscriptionAddons.js';
import { findAccountByUserId } from './couchdb.js';

const PLAN_TIER_RANK = { basic: 0, normal: 1, pro: 2 };

/** Reglas que pueden generar push al móvil (whitelist curada). */
export const MOBILE_PUSH_RULE_IDS = new Set([
  // ── Básico: mínimo operativo ──
  'worker_no_clockin',
  'delivery_register_not_opened',
  'delivery_product_out_of_stock',
  'lead_new',
  'sale_cancelled',
  'stock_low',
  'low_stock',
  'delivery_no_address',

  // ── Normal: gestión diaria del local ──
  'delivery_delayed_order',
  'delivery_cash_pending_close',
  'delivery_cash_discrepancy',
  'delivery_order_cancelled',
  'delivery_failed_delivery',
  'delivery_unpaid_order',
  'delivery_unpaid',
  'worker_late_clockin',
  'client_payment_overdue',
  'payment_overdue',
  'delivery_channel_incident',
  'sala_slow_kitchen_comanda',
  'delivery_product_low_stock',
  'register_high_return',
  'delivery_unattended',

  // ── Pro: finanzas, fiscal, RRHH avanzado ──
  'tax_deadline_overdue',
  'overdue_client_invoice',
  'document_expired',
  'itv_expired',
  'worker_absent_pattern',
  'negative_cash_flow',
  'supplier_invoice_overdue',
  'delivery_low_margin',
]);

export function resolveRuleKey(ruleId, category) {
  const id = String(ruleId || category || '').trim();
  return id || null;
}

export function isMobilePushWhitelisted(ruleId, category) {
  const key = resolveRuleKey(ruleId, category);
  if (!key) return false;
  return MOBILE_PUSH_RULE_IDS.has(key);
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
 * Requiere: canal push activo + whitelist + plan del usuario.
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
