import {
  buildButcherOrderDocument,
  getButcherDbName,
  getNextButcherOrderNumber,
  listButcherOrdersByUser,
  sanitizeButcherOrder,
} from '../butcherShop.js';
import { ensureDatabase, getDocument, putDocument } from '../couchdb.js';
import { broadcastToBusiness, broadcastToUser } from '../sseService.js';

export async function acceptButcherPublicOrder(req, context) {
  const { order: publicOrder, ownerUserId, businessId } = context;
  const orders = await listButcherOrdersByUser(req, ownerUserId);
  const existing = orders.find(
    (item) => String(item.sourcePublicOrderId || '') === String(publicOrder._id),
  );
  if (existing) {
    return {
      linkedButcherOrderId: existing._id,
      butcherOrder: sanitizeButcherOrder(existing),
    };
  }

  const orderNumber = await getNextButcherOrderNumber(req, ownerUserId, 'simple');
  const doc = buildButcherOrderDocument(ownerUserId, {
    _id: `butcher-order-public-${publicOrder._id}`,
    business_id: businessId,
    salesPointId: publicOrder.salesPointId,
    sourcePublicOrderId: publicOrder._id,
    orderNumber,
    orderType: 'simple',
    clientName: publicOrder.customerName,
    clientPhone: publicOrder.customerPhone,
    items: (publicOrder.items || []).map((item) => ({
      productId: item.id,
      productName: item.name,
      quantity: item.quantity,
      unit: item.unit || 'ud',
      pricePerUnit: item.unitPrice,
      subtotal: item.total,
      notes: item.notes,
    })),
    total: publicOrder.totalAmount,
    fulfillmentMode: publicOrder.orderType === 'delivery' ? 'delivery' : 'pickup',
    deliveryAddress: publicOrder.customerAddress,
    deliveryNotes: publicOrder.notes,
    cashOnDelivery: true,
    status: 'pending',
  });
  const db = getButcherDbName();
  await ensureDatabase(req, db);
  let result;
  try {
    result = await putDocument(req, db, doc._id, doc);
  } catch (error) {
    if (Number(error?.statusCode) === 409 || /conflict/i.test(String(error?.message || ''))) {
      const saved = await getDocument(req, db, doc._id);
      return {
        linkedButcherOrderId: saved._id,
        butcherOrder: sanitizeButcherOrder(saved),
      };
    }
    throw error;
  }
  const saved = sanitizeButcherOrder({ ...doc, _rev: result.rev });
  broadcastToUser(ownerUserId, 'butcher_order_created', saved);
  broadcastToBusiness(businessId, 'butcher:order_created', { order: saved });
  return { linkedButcherOrderId: saved._id, butcherOrder: saved };
}
