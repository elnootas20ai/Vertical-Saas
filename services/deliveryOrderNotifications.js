import {
  buildNotificationDocument,
  findAccountByUserId,
  findBusinessById,
  saveNotification,
  sanitizeNotification,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import { resolveTeamManagerRecipients } from './workerProfileNotifications.js';
import logger from './logger.js';

const TAG = 'DELIVERY_ORDER_NOTIFY';

/**
 * Avisa a Admin/Gerente + owner cuando un pedido delivery se elimina/cancela
 * (p. ej. desde la tablet del trabajador con motivo obligatorio).
 */
export async function notifyManagersOrderCancelled(req, {
  order,
  cancelReason,
  actorUserId,
  actorName,
  businessUserId,
}) {
  const ownerAccount = businessUserId
    ? await findAccountByUserId(req, businessUserId)
    : null;
  const actorAccount = actorUserId && actorUserId !== businessUserId
    ? await findAccountByUserId(req, actorUserId)
    : null;

  const businessId = String(
    ownerAccount?.linkedBusinessId
    || ownerAccount?.businessId
    || actorAccount?.linkedBusinessId
    || actorAccount?.businessId
    || '',
  ).trim();
  if (!businessId) return { notified: 0 };

  const business = await findBusinessById(req, businessId);
  if (!business) return { notified: 0 };

  const actorId = String(actorUserId || businessUserId || '').trim();
  const displayName = String(actorName || 'Un trabajador').trim();
  const recipients = resolveTeamManagerRecipients(business, actorId);
  if (recipients.length === 0) return { notified: 0 };

  const orderNumber = String(order?.orderNumber || order?._id || '').trim();
  const customerName = String(order?.customerName || 'Cliente').trim();
  const total = Number(order?.totalAmount || 0);
  const reason = String(cancelReason || '').trim();
  const title = `Pedido #${orderNumber} eliminado`;
  const message = `${displayName} eliminó el pedido de ${customerName} (${total.toFixed(2)}€). Motivo: ${reason}`;
  const route = '/saas/delivery-ops';

  const metadata = {
    businessId,
    orderId: order?._id,
    orderNumber,
    customerName,
    cancelReason: reason,
    cancelledBy: displayName,
    cancelledByUserId: actorId,
    previousStatus: order?.status,
    totalAmount: total,
    eventType: 'delivery_order_cancelled',
  };

  let totalCreated = 0;

  for (const userId of recipients) {
    try {
      const doc = buildNotificationDocument({
        userId,
        level: 'warning',
        category: 'delivery_order_cancelled',
        title,
        message,
        entityId: String(order?._id || ''),
        entityType: 'delivery_order',
        route,
        businessId,
        metadata,
        read: false,
        source: 'delivery',
        priority: 'high',
      });
      const saved = await saveNotification(req, doc);
      const sanitized = sanitizeNotification(saved);
      try {
        broadcastToUser(userId, 'notification', sanitized);
      } catch (sseErr) {
        logger.warn({ tag: TAG, userId, err: sseErr?.message }, 'SSE error notificando cancelación pedido');
      }
      sendPushToUser(req, userId, {
        title: sanitized.title,
        body: sanitized.message,
        data: { route: sanitized.route, notificationId: sanitized.id },
      }).catch((pushErr) => {
        logger.warn({ tag: TAG, userId, err: pushErr?.message }, 'Push error notificando cancelación pedido');
      });
      totalCreated += 1;
    } catch (notifyErr) {
      logger.warn({ tag: TAG, userId, err: notifyErr?.message }, 'Error creando notificación cancelación pedido');
    }
  }

  return { notified: totalCreated };
}
