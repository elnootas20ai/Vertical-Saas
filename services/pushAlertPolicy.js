/**
 * Política de push móvil — por ahora SOLO cierre de caja.
 * Los IDs salen del catálogo de Alertas SaaS (`isCierreCajaAlertRule`), no de listas sueltas.
 */
import {
  listCierreCajaMobilePushRuleIds,
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

function buildCierreOnlyMobilePushRuleIds() {
  return new Set(listCierreCajaMobilePushRuleIds());
}

/** Solo cierre de caja (catálogo Alertas). Ampliaremos cuando Uriel lo diga. */
export const CEO_MOBILE_PUSH_RULE_IDS = buildCierreOnlyMobilePushRuleIds();

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

/** Alias semántico: alerta de cierre / caja al CEO. */
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
 * Por ahora: solo reglas de cierre (catálogo Alertas).
 * Titular + Admin/Gerente invitados. Trabajadores de piso: no.
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
