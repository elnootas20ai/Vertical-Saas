import {
  buildDeliveryOrderDocument,
  ensureDatabase,
  getDeliveryDbName,
  getDocument,
  listDeliveryOrdersByUser,
  putDocument,
  sanitizeDeliveryOrder,
} from '../couchdb.js';
import { broadcastToBusiness, broadcastToUser } from '../sseService.js';

export async function acceptDeliveryPublicOrder(req, context) {
  const { order: publicOrder, ownerUserId, businessId } = context;
  const existingOrders = await listDeliveryOrdersByUser(req, ownerUserId, { maxDocs: 10_000 });
  const existing = existingOrders.find(
    (item) => String(item.sourcePublicOrderId || '') === String(publicOrder._id),
  );
  if (existing) {
    return {
      linkedDeliveryOrderId: existing._id,
      deliveryOrder: sanitizeDeliveryOrder(existing),
    };
  }

  const deliveryOrder = buildDeliveryOrderDocument(ownerUserId, {
    _id: `dord-public-${publicOrder._id}`,
    business_id: businessId,
    sourcePublicOrderId: publicOrder._id,
    externalOrderId: publicOrder._id,
    channel: 'web',
    deliveryType: publicOrder.orderType === 'pickup' ? 'recogida' : 'domicilio',
    status: 'nuevo',
    salesPointId: publicOrder.salesPointId,
    salesPointName: publicOrder.salesPointName,
    customerName: publicOrder.customerName,
    customerPhone: publicOrder.customerPhone,
    customerEmail: publicOrder.customerEmail,
    customerAddress: publicOrder.customerAddress,
    customerZone: publicOrder.shippingZoneName,
    items: publicOrder.items,
    deliveryFee: publicOrder.deliveryFee,
    discountAmount: Number(publicOrder.promoDiscount || 0) + Number(publicOrder.volumeDiscount || 0),
    totalAmount: publicOrder.totalAmount,
    notes: publicOrder.notes,
    estimatedDelivery: publicOrder.estimatedTime,
    paymentMethod: publicOrder.paymentMethod,
    paymentStatus: publicOrder.paymentStatus,
  });

  const db = getDeliveryDbName();
  await ensureDatabase(req, db);
  let savedResult;
  try {
    savedResult = await putDocument(req, db, deliveryOrder._id, deliveryOrder);
  } catch (error) {
    if (Number(error?.statusCode) === 409 || /conflict/i.test(String(error?.message || ''))) {
      const saved = await getDocument(req, db, deliveryOrder._id);
      return {
        linkedDeliveryOrderId: saved._id,
        deliveryOrder: sanitizeDeliveryOrder(saved),
      };
    }
    throw error;
  }
  const saved = { ...deliveryOrder, _rev: savedResult.rev };
  const sanitized = sanitizeDeliveryOrder(saved);

  broadcastToUser(ownerUserId, 'delivery_order_created', sanitized);
  broadcastToBusiness(businessId, 'delivery:order_created', {
    order: sanitized,
    userId: ownerUserId,
  });

  return {
    linkedDeliveryOrderId: saved._id,
    deliveryOrder: sanitized,
  };
}
