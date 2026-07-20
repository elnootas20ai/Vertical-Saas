/**
 * Sync pedido delivery cobrado/devuelto → movimiento financiero (servidor, idempotente).
 */
import {
  ensureDatabase,
  getFinanceDbName,
  buildFinanceDocument,
  listFinanceByUser,
  putDocument,
} from './couchdb.js';
import logger from './logger.js';

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function orderIsPaid(order) {
  const status = String(order?.status || '');
  if (status === 'cancelled' || status === 'devuelto') return false;
  if (String(order?.paymentStatus || '') === 'refunded') return false;
  return order?.paymentStatus === 'paid' || order?.paymentCollected === true;
}

function incomeAmount(order) {
  const gross = Number(order?.paidAmount || order?.totalAmount || 0);
  const refunded = Number(order?.refundAmount || 0);
  return round2(Math.max(0, gross - refunded));
}

function orderRef(orderId) {
  return `PEDIDO-${orderId}`;
}

function refundRef(orderId) {
  return `DEVOLUCION-${orderId}`;
}

function businessIdOf(order) {
  return String(order?.business_id || order?.businessId || '').replace(/^business:/, '').trim();
}

async function hasMovement(req, userId, predicate) {
  const movements = await listFinanceByUser(req, userId);
  return movements.some(predicate);
}

export async function ensureDeliveryOrderIncomeServer(req, userId, order) {
  try {
    if (!userId || !order?._id) return false;
    if (!orderIsPaid(order)) return false;
    const total = incomeAmount(order);
    if (!(total > 0.009)) return false;

    const id = order._id;
    const already = await hasMovement(req, userId, (m) => (
      (m.source === 'delivery_order' && m.sourceRef === id)
      || m.reference === orderRef(id)
      || String(m.notes || '').includes(`delivery_order:${id}`)
    ));
    if (already) return true;

    const finDb = getFinanceDbName();
    await ensureDatabase(req, finDb);
    const dateStr = String(
      order.paidAt || order.deliveredAt || order.updatedAt || order.createdAt || new Date().toISOString(),
    ).slice(0, 10);
    const base = round2(total / 1.21);
    const ticket = order.orderNumber || order.ticketNumber || String(id).slice(-6);
    const pdvName = String(order.salesPointName || '').trim();
    const bid = businessIdOf(order);

    const movement = buildFinanceDocument(userId, {
      type: 'cobro',
      concept: `Venta pedido #${ticket}${pdvName ? ` · ${pdvName}` : ''}`,
      reference: orderRef(id),
      category: 'ventas',
      amountBase: base,
      taxRate: 21,
      date: dateStr,
      payMethod: String(order.paymentMethod || 'mixto'),
      notes: `delivery_order:${id}`,
      status: 'paid',
      source: 'delivery_order',
      sourceRef: id,
      businessId: bid || undefined,
      pointOfSaleId: order.salesPointId || undefined,
      pointOfSaleName: pdvName || undefined,
    });

    await putDocument(req, finDb, movement._id, movement);
    return true;
  } catch (err) {
    logger.warn({ tag: 'DELIVERY_FINANCE', err: err?.message, orderId: order?._id }, 'No se pudo crear cobro finance');
    return false;
  }
}

export async function ensureDeliveryOrderRefundServer(req, userId, order) {
  try {
    if (!userId || !order?._id) return false;
    const refundAmount = Number(order.refundAmount || 0);
    if (!(refundAmount > 0.009)) return false;

    const id = order._id;
    const already = await hasMovement(req, userId, (m) => (
      (m.source === 'delivery_order_refund' && m.sourceRef === id)
      || m.reference === refundRef(id)
      || String(m.notes || '').includes(`delivery_order_refund:${id}`)
    ));
    if (already) return true;

    const finDb = getFinanceDbName();
    await ensureDatabase(req, finDb);
    const dateStr = String(
      order.refundedAt || order.updatedAt || order.paidAt || order.createdAt || new Date().toISOString(),
    ).slice(0, 10);
    const base = round2(refundAmount / 1.21);
    const ticket = order.orderNumber || order.ticketNumber || String(id).slice(-6);
    const pdvName = String(order.salesPointName || '').trim();
    const bid = businessIdOf(order);

    const movement = buildFinanceDocument(userId, {
      type: 'pago',
      concept: `Devolución pedido #${ticket}${pdvName ? ` · ${pdvName}` : ''}`,
      reference: refundRef(id),
      category: 'devoluciones',
      amountBase: base,
      taxRate: 21,
      date: dateStr,
      payMethod: String(order.paymentMethod || 'mixto'),
      notes: `delivery_order_refund:${id}${order.refundReason ? ` · ${order.refundReason}` : ''}`,
      status: 'paid',
      source: 'delivery_order_refund',
      sourceRef: id,
      businessId: bid || undefined,
      pointOfSaleId: order.salesPointId || undefined,
      pointOfSaleName: pdvName || undefined,
    });

    await putDocument(req, finDb, movement._id, movement);
    return true;
  } catch (err) {
    logger.warn({ tag: 'DELIVERY_FINANCE', err: err?.message, orderId: order?._id }, 'No se pudo crear devolución finance');
    return false;
  }
}
