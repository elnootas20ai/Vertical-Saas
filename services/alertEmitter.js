/**
 * Alert Emitter — emisión de alertas Vertial.
 *
 * Todo son alertas. Hay dos polaridades:
 * - `emitPositiveAlert()` / `emitActivityNotification()` → POSITIVA (fue bien / info OK).
 *   Solo campana. No Centro de Alertas, no push urgente, no banner de problema.
 * - `emitGlobalAlert()` → NEGATIVA (problema / acción requerida).
 *   Centro de Alertas + push si aplica.
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
import { ALL_ALERT_RULE_DEFINITIONS } from './alertRulesCatalog.js';
import { isCeoUrgentMobilePushRule } from './pushAlertPolicy.js';
import { isWorkerProfileSubject } from './workerProfileCompletion.js';

export const fakeReq = { headers: {} };
const SETTINGS_DB = 'settings';

/** ¿Alerta POSITIVA (fue bien)? No debe ir al Centro de Alertas de problemas. */
export function isPositiveAlertDoc(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (doc.polarity === 'positive' || doc.metadata?.polarity === 'positive') return true;
  if (doc.excludeFromAlertCenter === true) return true;
  if (doc.kind === 'activity' || doc.kind === 'positive') return true;
  if (doc.metadata?.excludeFromAlertCenter === true) return true;
  if (doc.metadata?.kind === 'activity' || doc.metadata?.kind === 'positive') return true;
  return false;
}

/** @deprecated Usar isPositiveAlertDoc */
export function isActivityNotificationDoc(doc) {
  return isPositiveAlertDoc(doc);
}

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

/**
 * Destinatarios de alertas: titular + Admin/Gerente invitados del negocio.
 * Trabajadores de piso (sin rol de gestión) NO reciben alertas ni push.
 */
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

/**
 * Excluye cuentas de trabajador de piso de alertas/correos de gestión (caja, finanzas, etc.).
 */
export async function filterManagementRecipientIds(userIds = []) {
  const out = [];
  for (const raw of userIds) {
    const uid = String(raw || '').trim();
    if (!uid) continue;
    try {
      const account = await findAccountByUserId(fakeReq, uid);
      if (!account || isWorkerProfileSubject(account)) continue;
      out.push(uid);
    } catch {
      /* cuenta desconocida: no enviar */
    }
  }
  return out;
}

async function resolveRecipients(businessId, ruleId, category, fallbackUserId, { force = false } = {}) {
  if (!businessId) {
    if (!fallbackUserId) return [];
    return filterManagementRecipientIds([fallbackUserId]);
  }
  try {
    // Si la regla está desactivada en el negocio, no emitir (salvo force).
    if (!force && (ruleId || category)) {
      const config = await getBusinessAlertConfig(businessId);
      const rules = config?.rules || [];
      const rule = rules.find((r) => r.id === ruleId || r.id === category) || null;
      if (rule && rule.enabled === false) return [];
    }

    const business = await findBusinessById(fakeReq, businessId);
    const recipients = new Set();
    const ownerId = String(business?.owner_user_id || '').trim();
    if (ownerId) recipients.add(ownerId);
    for (const m of business?.members || []) {
      const uid = String(m?.user_id || '').trim();
      if (!uid) continue;
      if (isManagementInviteRole(m.role)) recipients.add(uid);
    }
    if (recipients.size > 0) return filterManagementRecipientIds([...recipients]);
    if (fallbackUserId) return filterManagementRecipientIds([fallbackUserId]);
    return [];
  } catch {
    return [];
  }
}

async function resolveChannels(businessId, ruleId, category, { force = false } = {}) {
  if (!businessId) {
    return force || isCeoUrgentMobilePushRule(ruleId, category)
      ? ['inApp', 'push']
      : ['inApp', 'push'];
  }
  try {
    const config = await getBusinessAlertConfig(businessId);
    if (!config) {
      // Sin doc de settings: mismo default que seed (push + inApp).
      return ['inApp', 'push'];
    }
    if (config.global?.muteAll && !force) return [];
    const rules = config.rules || [];
    const rule = rules.find((r) => r.id === ruleId || r.id === category);
    const channels = rule?.channels?.length
      ? [...rule.channels]
      : [...(config.global?.defaultChannels || ['push', 'inApp'])];

    if (!channels.includes('inApp')) channels.push('inApp');

    // CEO urgentes (caja / impagos / pack gerente): forzar push aunque el negocio solo tenga inApp.
    if ((force || isCeoUrgentMobilePushRule(ruleId, category)) && !channels.includes('push')) {
      channels.push('push');
    }
    return channels;
  } catch {
    return ['inApp', 'push'];
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
  force = false,
}) {
  try {
    const resolvedSource = normalizeSource(source || deriveSourceFromCategory(category));
    const resolvedPriority = normalizePriority(priority || derivePriorityFromLevel(level || 'warning'));
    const resolvedLevel = level || PRIORITY_TO_LEVEL[resolvedPriority] || 'warning';

    const channels = await resolveChannels(businessId, ruleId, category, { force });
    if (channels.length === 0) return null;

    if (businessId && !force) {
      const business = await findBusinessById(fakeReq, businessId);
      if (business && !(await businessOwnerMeetsAlertRule(business, ruleId, category))) {
        return null;
      }
    }

    const recipientUserIds = await resolveRecipients(businessId, ruleId, category, userId, { force });
    if (recipientUserIds.length === 0) return null;

    const quiet = await isQuietHours(businessId);
    // Dinero/caja / pedido eliminado al CEO: suenan aunque sea horario silencioso.
    const bypassQuiet = force || (quiet && isCeoUrgentMobilePushRule(ruleId, category));

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
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        polarity: 'negative',
      },
      priority: resolvedPriority,
      status: 'new',
      businessId,
      source: resolvedSource,
      channels,
      assignedTo: { userIds: recipientUserIds, roles: [] },
    });
    notifBase.polarity = 'negative';
    notifBase.kind = 'negative';

    if (dedupKey) {
      const existing = await findOpenAlertDoc(category, dedupKey);
      if (existing) {
        // Alerta ya abierta: actualizar in-app, NUNCA reenviar push (1 vez y listo).
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
        // Solo persistir el refresh. NO reenviar SSE/popup: si no, cada ciclo
        // del motor (cientos de alertas abiertas) dispara el banner de arriba.
        await saveNotification(fakeReq, refreshed);
        return sanitizeNotification(refreshed);
      }
      if (!force && await hasLegacyDatedAlertToday(category, dedupKey)) return null;
      notifBase._id = buildStableAlertId(category, dedupKey);
    }

    const saved = await saveNotification(fakeReq, notifBase);
    const sanitized = sanitizeNotification(saved);

    // Push móvil: una sola vez por alerta (no reenviar si ya se envió).
    const alreadyPushed = Boolean(saved?.mobilePushSentAt);
    let didQueuePush = false;

    for (const uid of recipientUserIds) {
      broadcastToUser(uid, 'notification', sanitized);

      if (
        !alreadyPushed
        && (!quiet || bypassQuiet)
        && channels.includes('push')
      ) {
        didQueuePush = true;
        const pushRoute = sanitized.route || '/saas/alerts';
        const pushId = String(sanitized.id || saved?._id || '');
        sendPushToUser(fakeReq, uid, {
          title: sanitized.title,
          body: sanitized.message,
          data: {
            route: pushRoute,
            notificationId: pushId,
          },
          // Misma alerta = mismo collapse → iOS sustituye, no apila.
          collapseId: pushId || undefined,
        }, { ruleId, category, channels }).catch(() => null);
      }

      if ((!quiet || bypassQuiet) && channels.includes('email')) {
        try {
          const { findAccountByUserId } = await import('./couchdb.js');
          const account = await findAccountByUserId(fakeReq, uid);
          if (account?.email && !isWorkerProfileSubject(account)) {
            sendEmail({
              to: account.email,
              subject: `[Alerta] ${sanitized.title}`,
              html: `<h2>${sanitized.title}</h2><p>${sanitized.message}</p><p><a href="${route || '/saas/alerts'}">Ver detalle</a></p>`,
            }).catch(() => null);
          }
        } catch { /* email best-effort */ }
      }
    }

    if (didQueuePush && saved?._id) {
      try {
        await saveNotification(fakeReq, {
          ...saved,
          mobilePushSentAt: now,
          updatedAt: now,
        });
      } catch {
        /* best-effort: el dedup de alerta abierta ya evita re-push */
      }
    }

    return sanitized;
  } catch (err) {
    logger.warn({ tag: 'ALERT_EMITTER', err: err?.message }, 'Error emitiendo alerta global');
    return null;
  }
}

/**
 * Alerta POSITIVA (“fue bien” / info OK).
 * Solo campana. No Centro de problemas, no push urgente, no banner rojo.
 *
 * Usar para: caja cerrada OK, tarea hecha, sync correcto, etc.
 * NO usar para: descuadres, impagos, stock crítico, retrasos graves → emitGlobalAlert.
 *
 * @returns {Promise<object[]>} alertas positivas sanitizadas
 */
export async function emitPositiveAlert({
  userIds = [],
  userId = '',
  businessId = '',
  category = 'positive',
  source = 'sistema',
  title,
  message,
  entityId = '',
  entityType = '',
  route = '',
  metadata = {},
  dedupKey = '',
} = {}) {
  const recipients = await filterManagementRecipientIds(Array.from(
    new Set(
      [...(Array.isArray(userIds) ? userIds : []), userId]
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ));
  if (!recipients.length || !String(title || '').trim()) return [];

  const resolvedSource = normalizeSource(source || deriveSourceFromCategory(category));
  const now = new Date().toISOString();
  const created = [];

  for (const uid of recipients) {
    try {
      const docId = dedupKey
        ? `notification:positive:${String(dedupKey).trim()}:${uid}`
        : undefined;

      if (docId) {
        const existing = await getDocument(fakeReq, NOTIFICATIONS_DB, docId).catch(() => null);
        if (existing?._rev) continue;
      }

      const base = buildNotificationDocument({
        userId: uid,
        level: 'success',
        category: String(category || 'positive').trim() || 'positive',
        title,
        message,
        entityId,
        entityType,
        route,
        priority: 'low',
        status: 'new',
        businessId: String(businessId || '').trim(),
        source: resolvedSource,
        channels: ['inApp'],
        metadata: {
          ...(metadata && typeof metadata === 'object' ? metadata : {}),
          kind: 'positive',
          polarity: 'positive',
          excludeFromAlertCenter: true,
        },
      });

      const doc = {
        ...base,
        ...(docId ? { _id: docId } : {}),
        kind: 'positive',
        polarity: 'positive',
        excludeFromAlertCenter: true,
        createdAt: now,
        updatedAt: now,
      };

      const saved = await saveNotification(fakeReq, doc);
      const sanitized = sanitizeNotification(saved);
      if (sanitized) {
        broadcastToUser(uid, 'notification', sanitized);
        created.push(sanitized);
      }
    } catch (err) {
      logger.warn(
        { tag: 'POSITIVE_ALERT', err: err?.message, userId: uid },
        'Error emitiendo alerta positiva',
      );
    }
  }

  return created;
}

/** @deprecated Usar emitPositiveAlert — mismo contrato (alerta positiva). */
export async function emitActivityNotification(params) {
  return emitPositiveAlert(params);
}
