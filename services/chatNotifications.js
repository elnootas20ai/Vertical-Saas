import {
  buildNotificationDocument,
  findBusinessById,
  saveNotification,
  sanitizeNotification,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import logger from './logger.js';

function uniqueIds(ids) {
  return [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

function snippet(text, max = 120) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Destinatarios de un mensaje de chat (sin el remitente).
 * - direct / group: miembros del canal
 * - general: miembros de la empresa (+ owner)
 */
export async function resolveChatMessageRecipients(req, {
  businessId,
  channel,
  senderUserId,
}) {
  const sender = String(senderUserId || '').trim();
  const channelType = String(channel?.channelType || '').trim();

  if (channelType === 'direct' || channelType === 'group') {
    return uniqueIds(channel?.members || []).filter((id) => id !== sender);
  }

  // general u otros: todo el equipo del negocio
  const business = await findBusinessById(req, businessId);
  if (!business) return [];

  const ids = [];
  if (business.owner_user_id) ids.push(business.owner_user_id);
  for (const m of business.members || []) {
    if (m?.user_id) ids.push(m.user_id);
  }
  return uniqueIds(ids).filter((id) => id !== sender);
}

function channelLabel(channel) {
  const type = String(channel?.channelType || '');
  if (type === 'general') return 'Todo el equipo';
  if (type === 'group') return String(channel?.name || 'Grupo').trim() || 'Grupo';
  if (type === 'direct') return 'Mensaje directo';
  return String(channel?.name || 'Chat').trim() || 'Chat';
}

/**
 * Crea notificación in-app (campana + popup arriba) y push al teléfono
 * para cada destinatario. No bloquea el envío del mensaje si falla.
 */
export async function notifyChatMessageRecipients(req, {
  businessId,
  channel,
  message,
}) {
  try {
    const senderUserId = String(message?.userId || '').trim();
    const senderName = String(message?.userName || 'Alguien').trim() || 'Alguien';
    const channelId = String(message?.channelId || channel?.channelId || '').trim();
    if (!businessId || !channelId || !senderUserId) return { notified: 0 };

    const recipients = await resolveChatMessageRecipients(req, {
      businessId,
      channel,
      senderUserId,
    });
    if (!recipients.length) return { notified: 0 };

    const label = channelLabel(channel);
    const body = snippet(message?.text);
    const route = `/saas/chat/${encodeURIComponent(channelId)}`;
    const title =
      String(channel?.channelType || '') === 'direct'
        ? senderName
        : `${senderName} · ${label}`;

    let notified = 0;
    for (const userId of recipients) {
      try {
        const doc = buildNotificationDocument({
          userId,
          level: 'info',
          category: 'chat',
          title,
          message: body || 'Nuevo mensaje',
          entityId: channelId,
          entityType: 'chat',
          route,
          businessId,
          metadata: {
            businessId,
            channelId,
            channelType: channel?.channelType || '',
            messageId: message?.messageId || '',
            senderUserId,
            senderName,
          },
          read: false,
        });
        const saved = await saveNotification(req, doc);
        const sanitized = sanitizeNotification(saved);

        try {
          broadcastToUser(userId, 'notification', sanitized);
        } catch (sseErr) {
          logger.warn({
            tag: 'CHAT_NOTIFY',
            msg: 'SSE error',
            userId,
            error: sseErr?.message,
          });
        }

        // Sin options.category: push siempre (no filtro CEO whitelist)
        sendPushToUser(req, userId, {
          title: sanitized.title,
          body: sanitized.message,
          data: {
            route: sanitized.route || route,
            notificationId: sanitized.id,
            channelId,
          },
        }).catch((pushErr) => {
          logger.warn({
            tag: 'CHAT_NOTIFY',
            msg: 'Push error',
            userId,
            error: pushErr?.message,
          });
        });

        notified += 1;
      } catch (err) {
        logger.warn({
          tag: 'CHAT_NOTIFY',
          msg: 'Error notificando destinatario',
          userId,
          error: err?.message,
        });
      }
    }

    return { notified };
  } catch (err) {
    logger.warn({
      tag: 'CHAT_NOTIFY',
      msg: 'notifyChatMessageRecipients failed',
      error: err?.message,
    });
    return { notified: 0 };
  }
}
