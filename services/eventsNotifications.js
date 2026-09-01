/**
 * Notificaciones Eventos → titular + Admin/Gerente invitados, con push fuera de la app.
 * Misma línea que presupuestos por email (campana + Web/APNs).
 */
import {
  buildNotificationDocument,
  findAccountByUserId,
  findBusinessById,
  getDocument,
  saveNotification,
  sanitizeNotification,
  ensureDatabase,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import logger from './logger.js';

function normalizeUserId(value) {
  return String(value || '').replace(/^account:/, '').trim();
}

function bareBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function getEventsDbName() {
  const prefix = String(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-events`;
}

/** Roles de gestión (panel): reciben avisos de negocio. Encargado no. */
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

function eventRoute(eventId) {
  const id = String(eventId || '').trim();
  return id
    ? `/saas/vertical/eventos/${encodeURIComponent(id)}`
    : '/saas/vertical/eventos/contrataciones';
}

/**
 * Destinatarios: titular + miembros Admin/Gerente/Administrador invitados.
 */
export async function resolveEventsNotifyRecipients(req, {
  event = null,
  dataUserId = '',
  businessId = '',
} = {}) {
  const recipients = new Set();
  const bid = bareBusinessId(businessId || event?.business_id || event?.businessId);

  if (bid) {
    const business = await findBusinessById(req, bid).catch(() => null);
    const ownerId = normalizeUserId(business?.owner_user_id);
    if (ownerId) recipients.add(ownerId);
    for (const m of business?.members || []) {
      const uid = normalizeUserId(m?.user_id);
      if (!uid) continue;
      if (isManagementInviteRole(m.role)) recipients.add(uid);
    }
  }

  if (recipients.size === 0) {
    const candidates = [
      normalizeUserId(event?.user_id),
      normalizeUserId(dataUserId),
    ].filter(Boolean);
    for (const uid of candidates) {
      const account = await findAccountByUserId(req, uid).catch(() => null);
      // Titular puro (sin invitedBy) o fallback
      if (account && !String(account.invitedBy || '').trim()) {
        recipients.add(normalizeUserId(account.user_id || uid));
        break;
      }
      if (account?.invitedBy) {
        const owner = normalizeUserId(account.invitedBy);
        if (owner) recipients.add(owner);
      }
      if (!recipients.size) recipients.add(uid);
    }
  }

  return [...recipients];
}

/** Compat: primer destinatario (titular si existe). */
export async function resolveEventsCeoRecipient(req, opts = {}) {
  const list = await resolveEventsNotifyRecipients(req, opts);
  return list[0] || '';
}

/**
 * ¿Puede este usuario disparar un aviso del evento? Titular o miembro del negocio.
 */
export async function canActorTriggerEventsNotify(req, {
  authUserId,
  event,
  dataUserId = '',
}) {
  const actor = normalizeUserId(authUserId);
  if (!actor || !event) return false;

  const eventOwner = normalizeUserId(event.user_id);
  if (eventOwner && actor === eventOwner) return true;
  if (dataUserId && actor === normalizeUserId(dataUserId)) return true;

  // Solo membresía del negocio del evento (no bastar invitedBy del titular:
  // el admin invitado a empresa A no debe actuar sobre eventos de empresa B).
  const bid = bareBusinessId(event.business_id || event.businessId);
  if (!bid) {
    return Boolean(eventOwner && actor === eventOwner);
  }

  const business = await findBusinessById(req, bid).catch(() => null);
  if (!business) return false;
  if (normalizeUserId(business.owner_user_id) === actor) return true;
  const members = Array.isArray(business.members) ? business.members : [];
  return members.some((m) => normalizeUserId(m?.user_id) === actor);
}

export async function loadEventForNotify(req, eventId) {
  const id = String(eventId || '').trim();
  if (!id) return null;
  const db = getEventsDbName();
  await ensureDatabase(req, db);
  try {
    const doc = await getDocument(req, db, id);
    if (!doc || doc.deletedAt) return null;
    if (doc.type && doc.type !== 'ev_event') return null;
    return doc;
  } catch {
    return null;
  }
}

/**
 * Aviso puntual: campana + push (Web/APNs fuera de la app).
 * Sin ruleId en push → no pasa por whitelist urgente.
 * Respeta pushConsent.declined por destinatario.
 */
async function deliverNoticeToUser(req, {
  recipientUserId,
  level = 'success',
  category,
  title,
  message,
  entityId = '',
  entityType = 'event',
  route = '',
  metadata = {},
  dedupKey = '',
}) {
  const uid = normalizeUserId(recipientUserId);
  if (!uid || !title || !message) return null;

  const account = await findAccountByUserId(req, uid).catch(() => null);

  await ensureDatabase(req, 'notifications');

  const docId = dedupKey
    ? `notification:events:${String(dedupKey).trim()}:${uid}`
    : null;

  if (docId) {
    const existing = await getDocument(req, 'notifications', docId).catch(() => null);
    if (existing?._rev && !existing.deletedAt) return sanitizeNotification(existing);
  }

  const isPositive = level === 'success';
  const notification = buildNotificationDocument({
    userId: uid,
    level,
    category,
    title,
    message,
    entityId,
    entityType,
    route,
    metadata: {
      ...metadata,
      ...(isPositive
        ? { polarity: 'positive', kind: 'activity', excludeFromAlertCenter: true }
        : {}),
    },
  });

  const doc = {
    ...notification,
    ...(docId ? { _id: docId } : {}),
    ...(isPositive
      ? { kind: 'positive', polarity: 'positive', excludeFromAlertCenter: true }
      : {}),
  };

  const saved = await saveNotification(req, doc);
  const sanitized = sanitizeNotification(saved);
  broadcastToUser(uid, 'notification', sanitized);

  const declined = account?.notificationPreferences?.pushConsent?.decision === 'declined';
  if (!declined) {
    sendPushToUser(req, uid, {
      title: sanitized.title,
      body: sanitized.message,
      data: { route: sanitized.route || route, notificationId: sanitized.id },
      collapseId: sanitized.id || undefined,
    }).catch((err) => logger.warn({ tag: 'EVENTS_PUSH', err: err?.message }, 'Push eventos falló'));
  }

  return sanitized;
}

async function deliverToAllRecipients(req, opts, resolveOpts) {
  const recipients = await resolveEventsNotifyRecipients(req, resolveOpts);
  if (!recipients.length) return null;
  const results = [];
  for (const uid of recipients) {
    const saved = await deliverNoticeToUser(req, { ...opts, recipientUserId: uid });
    if (saved) results.push(saved);
  }
  return results[0] || null;
}

/** Rechazo de presupuesto de evento → titular + admins (campana + push). */
export async function notifyEventQuoteRejectedCeo(req, {
  event,
  dataUserId = '',
  clientName = '',
} = {}) {
  try {
    if (!event?._id) return null;
    const name = String(event.nombre || 'Evento').trim();
    const client = String(clientName || event.cliente || 'El cliente').trim();
    return deliverToAllRecipients(
      req,
      {
        level: 'warning',
        category: 'events',
        title: 'Presupuesto rechazado',
        message: `${client} ha rechazado el presupuesto de ${name}`,
        entityId: event._id,
        route: eventRoute(event._id),
        dedupKey: `quote-rejected-${event._id}`,
        metadata: { action: 'rejected', eventId: event._id, source: 'email' },
      },
      { event, dataUserId },
    );
  } catch (err) {
    logger.warn({ tag: 'EVENTS_NOTIFY', err: err?.message }, 'No se pudo notificar presupuesto rechazado');
    return null;
  }
}

export async function notifyEventQuoteAcceptedCeo(req, {
  event,
  dataUserId = '',
  source = 'manual',
} = {}) {
  try {
    if (!event?._id) return null;
    const name = String(event.nombre || 'Evento').trim();
    const client = String(event.cliente || 'El cliente').trim();
    return deliverToAllRecipients(
      req,
      {
        level: 'success',
        category: 'events_quote_accepted',
        title: 'Presupuesto aceptado',
        message: source === 'email'
          ? `${client} ha aceptado el presupuesto de ${name}`
          : `${client} · ${name}: presupuesto marcado como aceptado.`,
        entityId: event._id,
        route: eventRoute(event._id),
        dedupKey: `quote-accepted-${event._id}`,
        metadata: { action: 'accepted', eventId: event._id, source },
      },
      { event, dataUserId },
    );
  } catch (err) {
    logger.warn({ tag: 'EVENTS_NOTIFY', err: err?.message }, 'No se pudo notificar presupuesto aceptado');
    return null;
  }
}

export async function notifyEventFullyPaidCeo(req, {
  event,
  dataUserId = '',
  cobradoTotal = 0,
} = {}) {
  try {
    if (!event?._id) return null;
    const name = String(event.nombre || 'Evento').trim();
    const total = Number(cobradoTotal) || 0;
    const totalLabel = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

    return deliverToAllRecipients(
      req,
      {
        level: 'success',
        category: 'events_fully_paid',
        title: 'Evento cobrado al completo',
        message: `${name}: cobrado ${totalLabel}. Sin pendiente.`,
        entityId: event._id,
        route: eventRoute(event._id),
        dedupKey: `fully-paid-${event._id}`,
        metadata: { action: 'fully_paid', eventId: event._id, cobradoTotal: total },
      },
      { event, dataUserId },
    );
  } catch (err) {
    logger.warn({ tag: 'EVENTS_NOTIFY', err: err?.message }, 'No se pudo notificar cobro completo');
    return null;
  }
}
