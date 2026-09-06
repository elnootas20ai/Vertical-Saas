import logger from './logger.js';
import {
  acceptUberOrder,
  cancelUberOrder,
  denyUberOrder,
  getUberEatsAppAccessToken,
  markUberOrderReady,
} from './uberEatsApi.js';

function isUberChannel(order) {
  const ch = String(order?.channel || '').toLowerCase();
  return ch === 'ubereats' || ch === 'uber' || ch === 'uber_eats';
}

function externalUberOrderId(order) {
  return String(order?.externalOrderId || order?.uberOrderId || '').trim();
}

/**
 * Tras crear/actualizar un pedido Vertial de canal Uber, sincroniza con Marketplace.
 */
export async function syncUberOrderLifecycle({
  order,
  previousStatus = '',
  action = 'status',
  cancelReason = '',
}) {
  if (!isUberChannel(order)) return { skipped: true, reason: 'not_uber' };
  const orderId = externalUberOrderId(order);
  if (!orderId) return { skipped: true, reason: 'no_external_id' };

  const prev = String(previousStatus || '').toLowerCase();
  const next = String(order.status || '').toLowerCase();
  const done = [];

  try {
    const { accessToken } = await getUberEatsAppAccessToken();

    if (action === 'deny') {
      await denyUberOrder(accessToken, orderId, {
        explanation: String(cancelReason || 'Denied in Vertial'),
        code: 'POS_NOT_READY',
      });
      return { ok: true, actions: ['deny'], orderId };
    }

    if (action === 'cancel' || next === 'cancelled') {
      await cancelUberOrder(accessToken, orderId, {
        reason: 'OTHER',
        details: String(cancelReason || order.cancelReason || 'Cancelled in Vertial').slice(0, 250),
      });
      return { ok: true, actions: ['cancel'], orderId };
    }

    const needsAccept = action === 'accept'
      || (!order.uberAcceptedAt && prev === 'nuevo' && (next === 'cocina' || next === 'listo' || next === 'en_reparto'));
    if (needsAccept) {
      await acceptUberOrder(accessToken, orderId, {
        reason: 'Accepted by Vertial',
        externalReferenceId: String(order.orderNumber || order._id || ''),
      });
      done.push('accept');
    }

    const needsReady = action === 'ready'
      || next === 'listo'
      || next === 'en_reparto'
      || next === 'entregado';
    if (needsReady && prev !== 'listo' && prev !== 'en_reparto' && prev !== 'entregado') {
      await markUberOrderReady(accessToken, orderId);
      done.push('ready');
    }

    if (!done.length) return { skipped: true, reason: 'no_mapping', prev, next };
    return { ok: true, actions: done, orderId };
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), orderId, prev, next, action, done },
      'Uber order lifecycle sync failed',
    );
    return { ok: false, error: err?.message || String(err), orderId, actions: done };
  }
}

/** Auto-accept justo después de ingerir el webhook (SLA Uber). */
export async function autoAcceptUberOrderAfterIngest({ orderId, externalReferenceId }) {
  if (!orderId) return { skipped: true };
  try {
    const { accessToken } = await getUberEatsAppAccessToken();
    await acceptUberOrder(accessToken, orderId, {
      reason: 'Accepted by Vertial',
      externalReferenceId: String(externalReferenceId || ''),
    });
    return { ok: true, orderId };
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err), orderId },
      'Uber auto-accept after ingest failed',
    );
    return { ok: false, error: err?.message || String(err), orderId };
  }
}
