/**
 * Alert Emitter — Servicio universal de emisión de alertas globales.
 *
 * Cualquier módulo puede importar `emitGlobalAlert()` para emitir alertas
 * que respetan la config del negocio (canales, roles, quietHours, mute).
 *
 * También exporta helpers compartidos para los motores de alertas verticales.
 */

import {
  ACCOUNTS_DB,
  BUSINESSES_DB,
  NOTIFICATIONS_DB,
  buildNotificationDocument,
  saveNotification,
  sanitizeNotification,
  findBusinessById,
  findAccountByUserId,
  ensureDatabase,
  couchRequest,
  getAllDocuments,
  getDocument,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import { sendEmail } from './email.js';
import logger from './logger.js';
import {
  normalizePriority,
  normalizeSource,
  deriveSourceFromCategory,
  derivePriorityFromLevel,
  PRIORITY_TO_LEVEL,
} from './alertConstants.js';
import { resolveAlertPlanTier } from './alertPlanTiers.js';
import { resolvePlanTier } from './subscriptionAddons.js';
import { MANAGER_RECIPIENT_ROLES, ALL_ALERT_RULE_DEFINITIONS } from './alertRulesCatalog.js';

export const fakeReq = { headers: {} };
const SETTINGS_DB = 'settings';

const PLAN_TIER_RANK = { basic: 0, normal: 1, pro: 2 };

// ─── Shared helpers ─────────────────────────────────────────────────────────

export function daysBetween(dateStr, now) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return -1;
  return Math.floor(((now instanceof Date ? now.getTime() : Date.now()) - d.getTime()) / 86_400_000);
}

export function minutesBetween(dateStr, now) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return -1;
  return Math.floor(((now instanceof Date ? now.getTime() : Date.now()) - d.getTime()) / 60_000);
}

export async function fetchAllDocsOfType(dbName, type) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d?.type === type && !d?.deletedAt);
  } catch {
    return [];
  }
}

export async function fetchAllDocs(dbName) {
  try {
    await ensureDatabase(fakeReq, dbName);
    const docs = await getAllDocuments(fakeReq, dbName);
    return docs.filter((d) => d && !String(d._id || '').startsWith('_design/') && !d.deletedAt);
  } catch {
    return [];
  }
}

export async function getBusinessesOfType(businessType) {
  try {
    await ensureDatabase(fakeReq, BUSINESSES_DB);
    const docs = await getAllDocuments(fakeReq, BUSINESSES_DB);
    return docs.filter((d) => d?.type === 'business' && d?.businessType === businessType && !d?.deletedAt);
  } catch {
    return [];
  }
}

async function getBusinessAlertConfig(businessId) {
  if (!businessId) return null;
  try {
    await ensureDatabase(fakeReq, SETTINGS_DB);
    const docId = `alerts:${businessId}`;
    const res = await couchRequest(fakeReq, `/${encodeURIComponent(SETTINGS_DB)}/${encodeURIComponent(docId)}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const doc = await res.json();
    return doc?._id ? doc : null;
  } catch {
    return null;
  }
}

function memberMatchesRecipientRoles(memberRole, configuredRoles) {
  const role = String(memberRole || '').trim();
  if (!role) return false;
  const configured = new Set((configuredRoles || []).map((r) => String(r || '').trim()));
  if (configured.has(role)) return true;
  const wantsManagers = ['Admin', 'Gerente', 'manager', 'gerente', 'owner'].some((r) => configured.has(r));
  if (wantsManagers && MANAGER_RECIPIENT_ROLES.includes(role)) return true;
  return false;
}

async function businessOwnerMeetsAlertRule(business, ruleId, category) {
  const ownerId = business?.owner_user_id;
  if (!ownerId) return true;
  try {
    const account = await findAccountByUserId(fakeReq, ownerId);
    if (!account) return true;
    const sub = account.subscription || {};
    if (sub.billingExempt || sub.adminProAccess) return true;
    const userTier = resolvePlanTier(sub.selectedPlanId, sub.planName);
    const def = ALL_ALERT_RULE_DEFINITIONS.find((r) => r.id === ruleId || r.id === category);
    const ruleTier = resolveAlertPlanTier(ruleId || category, def?.department || 'operaciones');
    return (PLAN_TIER_RANK[userTier] ?? 0) >= (PLAN_TIER_RANK[ruleTier] ?? 1);
  } catch {
    return true;
  }
}

async function resolveRecipients(businessId, ruleId, category, fallbackUserId) {
  if (!businessId) return fallbackUserId ? [fallbackUserId] : [];
  try {
    const business = await findBusinessById(fakeReq, businessId);
    if (!business?.members?.length) {
      return business?.owner_user_id
        ? [business.owner_user_id]
        : (fallbackUserId ? [fallbackUserId] : []);
    }
    const config = await getBusinessAlertConfig(businessId);
    const rules = config?.rules || [];
    const rule = rules.find((r) => r.id === ruleId || r.id === category) || null;
    if (rule && !rule.enabled) return [];

    const userIds = new Set();
    if (business.owner_user_id) userIds.add(business.owner_user_id);

    if (rule?.recipientRoles?.length) {
      for (const m of business.members) {
        if (!m.user_id) continue;
        if (memberMatchesRecipientRoles(m.role, rule.recipientRoles)) {
          userIds.add(m.user_id);
        }
      }
      if (rule.customRecipients?.length) {
        for (const uid of rule.customRecipients) {
          if (uid) userIds.add(uid);
        }
      }
    } else {
      for (const m of business.members) {
        if (!m.user_id) continue;
        if (MANAGER_RECIPIENT_ROLES.includes(String(m.role || ''))) {
          userIds.add(m.user_id);
        }
      }
    }

    if (userIds.size > 0) return Array.from(userIds);
    return fallbackUserId ? [fallbackUserId] : [business.owner_user_id].filter(Boolean);
  } catch {
    return fallbackUserId ? [fallbackUserId] : [];
  }
}

async function resolveChannels(businessId, ruleId, category) {
  if (!businessId) return ['inApp'];
  try {
    const config = await getBusinessAlertConfig(businessId);
    if (!config) return ['inApp'];
    if (config.global?.muteAll) return [];
    const rules = config.rules || [];
    const rule = rules.find((r) => r.id === ruleId || r.id === category);
    return rule?.channels?.length ? rule.channels : (config.global?.defaultChannels || ['inApp']);
  } catch {
    return ['inApp'];
  }
}

async function isQuietHours(businessId) {
  if (!businessId) return false;
  try {
    const config = await getBusinessAlertConfig(businessId);
    if (!config?.global?.quietHoursEnabled) return false;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const from = config.global.quietHoursFrom || '22:00';
    const to = config.global.quietHoursTo || '08:00';
    if (from <= to) return hhmm >= from && hhmm <= to;
    return hhmm >= from || hhmm <= to;
  } catch {
    return false;
  }
}

function buildStableAlertId(category, dedupKey) {
  return `alert:${category}:${dedupKey}`;
}

function buildLegacyDatedAlertId(category, dedupKey, dateStr) {
  return `alert:${category}:${dedupKey}:${dateStr}`;
}

async function findOpenAlertDoc(category, dedupKey) {
  if (!category || !dedupKey) return null;
  try {
    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const stableId = buildStableAlertId(category, dedupKey);
    const doc = await getDocument(fakeReq, NOTIFICATIONS_DB, stableId);
    if (!doc || doc.deletedAt) return null;
    const status = doc.status || (doc.read ? 'seen' : 'new');
    if (status === 'resolved') return null;
    return doc;
  } catch {
    return null;
  }
}

async function hasLegacyDatedAlertToday(category, dedupKey) {
  if (!category || !dedupKey) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const notifId = buildLegacyDatedAlertId(category, dedupKey, today);
    const resp = await couchRequest(fakeReq, `/${encodeURIComponent(NOTIFICATIONS_DB)}/${encodeURIComponent(notifId)}`);
    if (!resp?.ok) return false;
    const doc = await resp.json();
    if (!doc?._id || doc.deletedAt) return false;
    const status = doc.status || (doc.read ? 'seen' : 'new');
    return status !== 'resolved';
  } catch {
    return false;
  }
}

// ─── Main emission function ─────────────────────────────────────────────────

export async function emitGlobalAlert({
  businessId = '', userId = '', source, ruleId, category = '', priority, level,
  title, message, entityId = '', entityType = '', route = '', metadata = {}, dedupKey,
}) {
  try {
    const resolvedSource = normalizeSource(source || deriveSourceFromCategory(category));
    const resolvedPriority = normalizePriority(priority || derivePriorityFromLevel(level || 'warning'));
    const resolvedLevel = level || PRIORITY_TO_LEVEL[resolvedPriority] || 'warning';

    const channels = await resolveChannels(businessId, ruleId, category);
    if (channels.length === 0) return null;

    if (businessId) {
      const business = await findBusinessById(fakeReq, businessId);
      if (business && !(await businessOwnerMeetsAlertRule(business, ruleId, category))) {
        return null;
      }
    }

    const recipientUserIds = await resolveRecipients(businessId, ruleId, category, userId);
    if (recipientUserIds.length === 0) return null;

    const quiet = await isQuietHours(businessId);
    const bypassQuiet = quiet && (
      ruleId === 'delivery_cash_pending_close'
      || category === 'delivery_cash_pending_close'
    ) && (resolvedPriority === 'high' || resolvedPriority === 'critical');

    const now = new Date().toISOString();
    const notifBase = buildNotificationDocument({
      userId: recipientUserIds[0],
      level: resolvedLevel,
      category,
      title,
      message,
      entityId,
      entityType,
      route,
      metadata,
      priority: resolvedPriority,
      status: 'new',
      businessId,
      source: resolvedSource,
      channels,
      assignedTo: { userIds: recipientUserIds, roles: [] },
    });

    if (dedupKey) {
      const existing = await findOpenAlertDoc(category, dedupKey);
      if (existing) {
        const refreshed = {
          ...existing,
          title,
          message,
          priority: resolvedPriority,
          level: resolvedLevel,
          metadata: { ...(existing.metadata || {}), ...metadata },
          updatedAt: now,
          channels,
        };
        const saved = await saveNotification(fakeReq, refreshed);
        const sanitized = sanitizeNotification(saved);
        for (const uid of recipientUserIds) {
          broadcastToUser(uid, 'notification', sanitized);
        }
        return sanitized;
      }
      if (await hasLegacyDatedAlertToday(category, dedupKey)) return null;
      notifBase._id = buildStableAlertId(category, dedupKey);
    }

    const saved = await saveNotification(fakeReq, notifBase);
    const sanitized = sanitizeNotification(saved);

    for (const uid of recipientUserIds) {
      broadcastToUser(uid, 'notification', sanitized);

      if ((!quiet || bypassQuiet) && channels.includes('push')) {
        sendPushToUser(fakeReq, uid, {
          title: sanitized.title,
          body: sanitized.message,
          data: { route: sanitized.route || '/saas/alerts', notificationId: sanitized.id },
        }, { ruleId, category, channels }).catch(() => null);
      }

      if ((!quiet || bypassQuiet) && channels.includes('email')) {
        try {
          const { findAccountByUserId } = await import('./couchdb.js');
          const account = await findAccountByUserId(fakeReq, uid);
          if (account?.email) {
            sendEmail({
              to: account.email,
              subject: `[Alerta] ${sanitized.title}`,
              html: `<h2>${sanitized.title}</h2><p>${sanitized.message}</p><p><a href="${route || '/saas/alerts'}">Ver detalle</a></p>`,
            }).catch(() => null);
          }
        } catch { /* email best-effort */ }
      }
    }

    return sanitized;
  } catch (err) {
    logger.warn({ tag: 'ALERT_EMITTER', err: err?.message }, 'Error emitiendo alerta global');
    return null;
  }
}
