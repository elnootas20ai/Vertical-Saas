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
import { findAccountByUserId, listBusinessesByUser } from './couchdb.js';

const PLAN_TIER_RANK = { basic: 0, normal: 1, pro: 2 };

function isManagementInviteRole(role) {
  const r = String(role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    r === 'admin'
    || r === 'administrador'
    || r === 'owner'
    || r === 'gerente'
    || r === 'gerentogrupo'
    || r === 'manager'
    || r === 'encargado'
    || r === 'gestor'
    || r === 'superadmin'
  );
}

/** Admin/Gerente invitado al panel: sí push. Trabajador de piso: no. */
async function userIsManagementInvite(req, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  try {
    const businesses = await listBusinessesByUser(req, uid);
    for (const b of businesses || []) {
      if (String(b.owner_user_id || '').trim() === uid) return true;
      const members = Array.isArray(b.members) ? b.members : [];
      if (members.some((m) => String(m?.user_id || '').trim() === uid && isManagementInviteRole(m.role))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Reglas que llegan al iPhone/Web Push del CEO con banner + sonido.
 * Pack gerente + dinero/caja + operación delivery crítica.
 * Fuera: retrasos normales, stock, CRM, login… (in-app sí, push no).
 */
const EXTRA_CEO_PUSH = [
  'payment_overdue',
  'negative_cash_flow',
  'tax_deadline_overdue',
  // Cierre OK no es alerta urgente: solo descuadre / caja pendiente.
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
 * Titular + Admin/Gerente invitados. Trabajadores de piso: no.
 * Requiere: canal push + whitelist + plan + no haber rechazado permiso.
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

    const decision = account?.notificationPreferences?.pushConsent?.decision;
    if (decision === 'declined') return false;

    const isInvitedOrWorker =
      String(account.accountType || '') === 'user'
      || Boolean(String(account.invitedBy || '').trim());
    if (isInvitedOrWorker) {
      const allowed = await userIsManagementInvite(req, userId);
      if (!allowed) return false;
      // El plan es del titular del negocio; el admin invitado hereda el aviso.
      return true;
    }
  } catch {
    /* si no se puede leer la cuenta, no bloqueamos el envío al titular */
  }

  return userMeetsPushPlanTier(req, userId, ruleId, category);
}
