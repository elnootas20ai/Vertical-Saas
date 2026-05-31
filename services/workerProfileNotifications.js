import {
  buildNotificationDocument,
  findAccountByUserId,
  findBusinessById,
  normalizeNotificationPreferences,
  saveNotification,
  sanitizeNotification,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';

const ADMIN_ROLES = new Set(['Admin', 'Gerente', 'Administrador', 'Encargado']);

const PROFILE_EVENT_COPY = {
  identity_completed: {
    prefKey: 'onIdentityCompleted',
    level: 'success',
    title: (name) => `${name} completó su identidad`,
    message: (name) => `${name} ha rellenado DNI, teléfono y dirección.`,
  },
  worker_profile_completed: {
    prefKey: 'onWorkerProfileCompleted',
    level: 'success',
    title: (name) => `${name} completó su ficha de nómina`,
    message: (name) => `${name} ha añadido IBAN, Seguridad Social y datos de emergencia.`,
  },
};

export function resolveTeamManagerRecipients(business, excludeUserId) {
  const recipients = new Set();
  if (business?.owner_user_id && business.owner_user_id !== excludeUserId) {
    recipients.add(business.owner_user_id);
  }
  for (const m of business?.members || []) {
    if (!m.user_id || m.user_id === excludeUserId) continue;
    if (ADMIN_ROLES.has(String(m.role || ''))) recipients.add(m.user_id);
  }
  return Array.from(recipients);
}

function detectProfileCompletionEvents(before, after) {
  const events = [];
  const beforeIdentity = Boolean(before?.workerIdentityCompleted);
  const afterIdentity = Boolean(after?.workerIdentityCompleted);
  const beforeWorker = Boolean(before?.workerProfileCompletion?.workerCompleted);
  const afterWorker = Boolean(after?.workerProfileCompletion?.workerCompleted);

  if (!beforeIdentity && afterIdentity) {
    events.push('identity_completed');
  }
  if (!beforeWorker && afterWorker) {
    events.push('worker_profile_completed');
  }
  return events;
}

/**
 * Avisa a Admin/Gerente + owner cuando un trabajador completa hitos de su ficha.
 * Respeta las preferencias personales `team.*` de cada destinatario.
 */
export async function notifyManagersWorkerProfileEvents(req, { accountBefore, accountAfter }) {
  const businessId = accountAfter?.linkedBusinessId;
  if (!businessId) return { notified: 0 };

  const events = detectProfileCompletionEvents(accountBefore, accountAfter);
  if (events.length === 0) return { notified: 0 };

  const business = await findBusinessById(req, businessId);
  if (!business) return { notified: 0 };

  const workerId = accountAfter.user_id;
  const recipients = resolveTeamManagerRecipients(business, workerId);
  if (recipients.length === 0) return { notified: 0 };

  const displayName = String(accountAfter.fullName || 'Un trabajador').trim();
  let totalCreated = 0;

  for (const eventType of events) {
    const copy = PROFILE_EVENT_COPY[eventType];
    if (!copy) continue;

    const route = `/saas/equipo/${encodeURIComponent(workerId)}`;
    const metadata = {
      businessId,
      memberId: workerId,
      memberName: displayName,
      eventType,
    };

    for (const userId of recipients) {
      try {
        const managerAccount = await findAccountByUserId(req, userId);
        const teamPrefs = normalizeNotificationPreferences(managerAccount?.notificationPreferences).team;
        if (!teamPrefs[copy.prefKey]) continue;

        const doc = buildNotificationDocument({
          userId,
          level: copy.level,
          category: 'team',
          title: copy.title(displayName),
          message: copy.message(displayName),
          entityId: workerId,
          entityType: 'team',
          route,
          businessId,
          metadata,
          read: false,
        });
        const saved = await saveNotification(req, doc);
        const sanitized = sanitizeNotification(saved);
        try {
          broadcastToUser(userId, 'notification', sanitized);
        } catch (sseErr) {
          console.warn('[WorkerProfile notify] SSE error:', sseErr?.message);
        }
        sendPushToUser(req, userId, {
          title: sanitized.title,
          body: sanitized.message,
          data: { route: sanitized.route, notificationId: sanitized.id },
        }).catch((pushErr) => console.warn('[WorkerProfile notify] Push error:', pushErr?.message));
        totalCreated += 1;
      } catch (notifyErr) {
        console.warn('[WorkerProfile notify]', eventType, userId, notifyErr?.message);
      }
    }
  }

  return { notified: totalCreated };
}
