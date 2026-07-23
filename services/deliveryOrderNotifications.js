import {
  findAccountByUserId,
  findBusinessById,
  listTpvRegisterSessionsByUser,
  findOpenTpvRegisterSessionForPointOfSale,
  buildTpvRegisterSessionDocument,
  putDocument,
  getDeliveryDbName,
  sanitizeTpvRegisterSession,
} from './couchdb.js';
import { emitGlobalAlert } from './alertEmitter.js';
import { broadcastToUser, broadcastToBusiness } from './sseService.js';
import logger from './logger.js';

const TAG = 'DELIVERY_ORDER_NOTIFY';

function bareBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

/**
 * Avisa a Admin/Gerente + owner cuando un pedido delivery se elimina/cancela
 * (p. ej. desde la tablet del trabajador con motivo obligatorio).
 * Siempre intenta crear la alerta en el Centro de alertas del admin.
 */
export async function notifyManagersOrderCancelled(req, {
  order,
  cancelReason,
  actorUserId,
  actorName,
  businessUserId,
  previousStatus = '',
  cajaReturnAmount = 0,
}) {
  const ownerAccount = businessUserId
    ? await findAccountByUserId(req, businessUserId)
    : null;
  const actorAccount = actorUserId && actorUserId !== businessUserId
    ? await findAccountByUserId(req, actorUserId)
    : null;

  const businessId = bareBusinessId(
    order?.business_id
    || order?.businessId
    || ownerAccount?.linkedBusinessId
    || ownerAccount?.businessId
    || actorAccount?.linkedBusinessId
    || actorAccount?.businessId
    || '',
  );
  if (!businessId) {
    logger.warn({
      tag: TAG,
      orderId: order?._id,
      businessUserId,
    }, 'Sin businessId: no se pudo emitir alerta de pedido eliminado');
    return { notified: 0, alertId: null };
  }

  const business = await findBusinessById(req, businessId);
  if (!business) {
    logger.warn({ tag: TAG, businessId }, 'Negocio no encontrado para alerta de cancelación');
    return { notified: 0, alertId: null };
  }

  const actorId = String(actorUserId || businessUserId || '').trim();
  const displayName = String(actorName || 'Un trabajador').trim();
  const orderNumber = String(order?.orderNumber || order?._id || '').trim();
  const customerName = String(order?.customerName || 'Cliente').trim();
  const total = Number(order?.totalAmount || 0);
  const reason = String(cancelReason || '').trim();
  const prev = String(previousStatus || order?.status || '').trim();
  const refunded = Number(cajaReturnAmount || 0);
  const title = `Incidencia: pedido #${orderNumber} eliminado`;
  const message = [
    `${displayName} eliminó el pedido de ${customerName} (${total.toFixed(2)}€).`,
    prev ? `Estado anterior: ${prev}.` : '',
    `Motivo: ${reason}`,
    refunded > 0.001 ? `Restado de caja: ${refunded.toFixed(2)}€.` : '',
  ].filter(Boolean).join(' ');

  const cancelledAt = String(order?.cancelledAt || new Date().toISOString());

  try {
    const saved = await emitGlobalAlert({
      businessId,
      userId: business.owner_user_id || businessUserId,
      source: 'delivery',
      ruleId: 'delivery_order_cancelled',
      category: 'delivery_order_cancelled',
      priority: 'high',
      level: 'alert',
      title,
      message,
      entityId: String(order?._id || ''),
      entityType: 'delivery_order',
      route: '/saas/alerts',
      // Una alerta por eliminación (si reabren y vuelven a borrar, nueva incidencia).
      dedupKey: `cancel-${order?._id || orderNumber}-${cancelledAt}`,
      force: true,
      metadata: {
        orderId: order?._id,
        orderNumber,
        customerName,
        cancelReason: reason,
        cancelledBy: displayName,
        cancelledByUserId: actorId,
        previousStatus: prev,
        totalAmount: total,
        cajaReturnAmount: refunded,
        salesPointName: order?.salesPointName || '',
        eventType: 'delivery_order_cancelled',
        isIncident: true,
      },
    });

    if (!saved) {
      logger.warn({ tag: TAG, businessId, orderId: order?._id }, 'emitGlobalAlert no guardó la alerta de cancelación');
      return { notified: 0, alertId: null };
    }

    logger.info({
      tag: TAG,
      businessId,
      orderId: order?._id,
      alertId: saved.id || saved._id,
    }, 'Alerta de pedido eliminado emitida al admin');

    return { notified: 1, alertId: saved.id || saved._id || null };
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error notificando cancelación pedido');
    return { notified: 0, alertId: null };
  }
}

/**
 * Deja la eliminación también como incidencia en la caja TPV abierta (revisión admin).
 */
export async function appendTpvIncidentForOrderCancel(req, {
  userId,
  order,
  cancelReason,
  actorName,
  callerAccount,
  amount = 0,
  resolveOrderPdvIdForCaja,
}) {
  try {
    if (typeof resolveOrderPdvIdForCaja !== 'function') return { status: 'skipped' };
    const orderPdvId = await resolveOrderPdvIdForCaja(req, userId, order, callerAccount);
    if (!orderPdvId) return { status: 'no_pdv' };

    const allSessions = await listTpvRegisterSessionsByUser(req, userId);
    const openSession = findOpenTpvRegisterSessionForPointOfSale(allSessions, orderPdvId);
    if (!openSession) return { status: 'no_open_session' };

    const now = new Date().toISOString();
    const incident = {
      id: `inc-cancel-${String(order?._id || '').slice(-8)}-${Date.now().toString(36)}`,
      type: 'void_transaction',
      severity: 'high',
      description: `Pedido #${order?.orderNumber || ''} eliminado. Motivo: ${String(cancelReason || '').trim()}`,
      reportedBy: String(actorName || 'Sistema').trim(),
      amount: Number(amount || 0) > 0 ? Number(amount) : undefined,
      orderId: order?._id || '',
      orderNumber: order?.orderNumber || '',
      date: now,
    };

    const sessionDoc = buildTpvRegisterSessionDocument(userId, {
      ...openSession,
      incidents: [...(openSession.incidents || []), incident],
    }, openSession);

    const db = getDeliveryDbName();
    const saved = await putDocument(req, db, sessionDoc._id, sessionDoc);
    const sanitized = sanitizeTpvRegisterSession({ ...sessionDoc, _rev: saved.rev });
    broadcastToUser(userId, 'tpv_session_updated', sanitized);
    const biz = bareBusinessId(
      order?.business_id
      || order?.businessId
      || callerAccount?.linkedBusinessId
      || callerAccount?.businessId
      || '',
    );
    if (biz) {
      try { broadcastToBusiness(biz, 'tpv_session_updated', sanitized); } catch { /* ignore */ }
    }
    return { status: 'registered', session: sanitized, incident };
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message, orderId: order?._id }, 'No se pudo registrar incidencia TPV al eliminar pedido');
    return { status: 'error', message: err?.message };
  }
}
