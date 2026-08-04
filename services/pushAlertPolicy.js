/**
 * Política de push móvil — avisos urgentes al CEO (caja + pack gerente).
 * No enviamos el catálogo completo: el iPhone debe sonar por lo que importa al dueño.
 */
import {
  DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS,
  MANAGER_FOCUS_ENABLED_RULE_IDS,
} from './alertRulesCatalog.js';
import { resolveAlertPlanTier } from './alertPlanTiers.js';
import { resolvePlanTier } from './subscriptionAddons.js';
import { findAccountByUserId } from './couchdb.js';

const PLAN_TIER_RANK = { basic: 0, normal: 1, pro: 2 };

/**
 * Reglas que llegan al iPhone/Web Push del CEO con banner + sonido.
 * Pack gerente + dinero/caja + operación delivery crítica.
 * Fuera: retrasos normales, stock, CRM, login… (in-app sí, push no).
 */
const EXTRA_CEO_PUSH = [
  'payment_overdue',
  'negative_cash_flow',
  'tax_deadline_overdue',
  'delivery_register_closed_ok',
  'register_high_return',
  'delivery_driver_mismatch',
  'butcher_register_pending',
  'butcher_batch_expired',
  'butcher_stock_critical',
  'butcher_waste_high',
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
];

/** Docs: in-app sí; push no (ruido). Retraso leve: in-app; muy retrasado: push (está en CEO pack). */
const CEO_PUSH_EXCLUDE = new Set([
  'document_missing_required',
  'document_expired',
  'document_expiring_soon',
  'delivery_delayed_order',
]);

function buildCeoMobilePushRuleIds() {
  const ids = new Set([
    ...MANAGER_FOCUS_ENABLED_RULE_IDS,
    ...DELIVERY_CEO_DEFAULT_ENABLED_RULE_IDS,
    ...EXTRA_CEO_PUSH,
  ]);
  for (const id of CEO_PUSH_EXCLUDE) ids.delete(id);
  return ids;
}

export const CEO_MOBILE_PUSH_RULE_IDS = buildCeoMobilePushRuleIds();

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
 * Solo CEO/titular: trabajadores (código / invitedBy) nunca.
 * Requiere: canal push + whitelist CEO + plan + no haber rechazado permiso.
 */
export async function shouldSendMobilePush(req, {
  userId,
  ruleId,
  category,
  channels = [],
}) {
  if (!channels.includes('push')) return false;
  if (!isMobilePushWhitelisted(ruleId, category)) return false;
  if (!userId) return false;

  try {
    const account = await findAccountByUserId(req, userId);
    if (!account) return false;
    // Trabajador (login con código / invitado) → sin push de momento
    if (String(account.accountType || '') === 'user') return false;
    if (String(account.invitedBy || '').trim()) return false;

    const decision = account?.notificationPreferences?.pushConsent?.decision;
    if (decision === 'declined') return false;
  } catch {
    /* si no se puede leer la cuenta, no bloqueamos el envío al titular */
  }

  return userMeetsPushPlanTier(req, userId, ruleId, category);
}
