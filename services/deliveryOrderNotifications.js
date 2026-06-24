import {
  findAccountByUserId,
  findBusinessById,
} from './couchdb.js';
import { emitGlobalAlert } from './alertEmitter.js';
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
  const orderNumber = String(order?.orderNumber || order?._id || '').trim();
  const customerName = String(order?.customerName || 'Cliente').trim();
  const total = Number(order?.totalAmount || 0);
  const reason = String(cancelReason || '').trim();
  const title = `Pedido #${orderNumber} eliminado`;
  const message = `${displayName} eliminó el pedido de ${customerName} (${total.toFixed(2)}€). Motivo: ${reason}`;

  try {
    const saved = await emitGlobalAlert({
      businessId,
      userId: business.owner_user_id || businessUserId,
      source: 'delivery',
      ruleId: 'delivery_order_cancelled',
      category: 'delivery_order_cancelled',
      priority: 'high',
      level: 'warning',
      title,
      message,
      entityId: String(order?._id || ''),
      entityType: 'delivery_order',
      route: '/saas/delivery-ops',
      dedupKey: `cancel-${order?._id || orderNumber}`,
      metadata: {
        orderId: order?._id,
        orderNumber,
        customerName,
        cancelReason: reason,
        cancelledBy: displayName,
        cancelledByUserId: actorId,
        previousStatus: order?.status,
        totalAmount: total,
        eventType: 'delivery_order_cancelled',
      },
    });
    return { notified: saved ? 1 : 0 };
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error notificando cancelación pedido');
    return { notified: 0 };
  }
}
