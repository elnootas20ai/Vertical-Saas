import {
  getButcherDbName,
  buildButcherOrderDocument,
  sanitizeButcherOrder,
  sanitizeButcherSale,
  listButcherOrdersByUser,
  getNextButcherOrderNumber,
  buildButcherSaleDocument,
  getNextButcherTicketNumber,
  updateButcherClientCounters,
  analyzeButcherClientHabitsAsync,
} from '../services/butcherShop.js';
import { ensureDatabase, getDocument, putDocument, getCatalogDbName } from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function bad(res, error) { return res.status(400).json({ ok: false, error }); }

async function reserveStockForOrder(req, userId, items) {
  const catalogDb = getCatalogDbName();
  try {
    await ensureDatabase(req, catalogDb);
    for (const item of items) {
      if (!item.productId) continue;
      try {
        const product = await getDocument(req, catalogDb, item.productId);
        if (!product || product.type !== 'catalog_item' || product.user_id !== userId) continue;
        const current = Number(product.stockQuantity || 0);
        product.stockQuantity = Math.max(0, current - Number(item.quantity || 0));
        product.updatedAt = new Date().toISOString();
        await putDocument(req, catalogDb, product._id, product);
      } catch { /* non-blocking per item */ }
    }
  } catch { /* non-blocking */ }
}

async function releaseStockForOrder(req, userId, items) {
  const catalogDb = getCatalogDbName();
  try {
    await ensureDatabase(req, catalogDb);
    for (const item of items) {
      if (!item.productId) continue;
      try {
        const product = await getDocument(req, catalogDb, item.productId);
        if (!product || product.type !== 'catalog_item' || product.user_id !== userId) continue;
        product.stockQuantity = (Number(product.stockQuantity || 0)) + Number(item.quantity || 0);
        product.updatedAt = new Date().toISOString();
        await putDocument(req, catalogDb, product._id, product);
      } catch { /* non-blocking per item */ }
    }
  } catch { /* non-blocking */ }
}

export async function listButcherOrders(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const raw = await listButcherOrdersByUser(req, userId);
    const sanitized = raw.map(sanitizeButcherOrder).filter(Boolean);
    const { items, meta } = applyQueryOptions(sanitized, req.query);
    return res.json({ ok: true, orders: items, meta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar pedidos' });
  }
}

export async function createButcherOrder(req, res) {
  try {
    const { userId } = req.params;
    const { order } = req.body || {};
    if (!userId) return bad(res, 'Falta userId');
    if (!order) return bad(res, 'Falta el objeto order');

    const orderNumber = await getNextButcherOrderNumber(req, userId, order.orderType || 'simple');
    const total = (order.items || []).reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.pricePerUnit || 0)), 0);

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const hasProductIds = (order.items || []).some((it) => it.productId);
    const doc = buildButcherOrderDocument(userId, { ...order, orderNumber, total, stockReserved: hasProductIds });
    await putDocument(req, db, doc._id, doc);

    if (hasProductIds) {
      reserveStockForOrder(req, userId, doc.items).catch(() => {});
    }

    return res.json({ ok: true, order: sanitizeButcherOrder(doc) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al crear pedido' });
  }
}

export async function getButcherOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    if (!userId || !orderId) return bad(res, 'Faltan parámetros');
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const doc = await getDocument(req, db, orderId);
    if (!doc || doc.type !== 'butcher_order' || doc.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }
    return res.json({ ok: true, order: sanitizeButcherOrder(doc) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar pedido' });
  }
}

export async function updateButcherOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { order } = req.body || {};
    if (!userId || !orderId) return bad(res, 'Faltan parámetros');
    if (!order) return bad(res, 'Falta el objeto order');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, orderId);
    if (!existing || existing.type !== 'butcher_order' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }

    if (order.items) {
      order.total = order.items.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.pricePerUnit || 0)), 0);
    }

    const updated = buildButcherOrderDocument(userId, order, existing);
    await putDocument(req, db, updated._id, updated);
    return res.json({ ok: true, order: sanitizeButcherOrder(updated) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al actualizar pedido' });
  }
}

export async function updateButcherOrderStatus(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { status, preparedBy } = req.body || {};
    if (!userId || !orderId) return bad(res, 'Faltan parámetros');
    if (!status) return bad(res, 'Falta el campo status');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, orderId);
    if (!existing || existing.type !== 'butcher_order' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }
    existing.status = status;
    if (preparedBy) existing.preparedBy = preparedBy;
    existing.updatedAt = new Date().toISOString();
    await putDocument(req, db, existing._id, existing);

    if (status === 'cancelled' && existing.stockReserved) {
      releaseStockForOrder(req, userId, existing.items || []).catch(() => {});
      existing.stockReserved = false;
      await putDocument(req, db, existing._id, existing);
    }

    return res.json({ ok: true, order: sanitizeButcherOrder(existing) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cambiar estado' });
  }
}

export async function deleteButcherOrder(req, res) {
  try {
    const { userId, orderId } = req.params;
    if (!userId || !orderId) return bad(res, 'Faltan parámetros');
    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, orderId);
    if (!existing || existing.type !== 'butcher_order' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }
    existing.deletedAt = new Date().toISOString();
    existing.updatedAt = new Date().toISOString();
    await putDocument(req, db, existing._id, existing);

    if (existing.stockReserved && existing.status !== 'picked_up') {
      releaseStockForOrder(req, userId, existing.items || []).catch(() => {});
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al eliminar pedido' });
  }
}

export async function getButcherOrdersToday(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    const today = new Date().toISOString().slice(0, 10);
    const all = await listButcherOrdersByUser(req, userId);
    const todayOrders = all
      .filter((o) => o.pickupDate === today && o.status !== 'cancelled')
      .map(sanitizeButcherOrder)
      .sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''));
    return res.json({ ok: true, orders: todayOrders, date: today });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al cargar pedidos de hoy' });
  }
}

export async function convertOrderToSale(req, res) {
  try {
    const { userId, orderId } = req.params;
    const { paymentMethod, paymentDetails, soldBy } = req.body || {};
    if (!userId || !orderId) return bad(res, 'Faltan parámetros');

    const db = getButcherDbName();
    await ensureDatabase(req, db);
    const order = await getDocument(req, db, orderId);
    if (!order || order.type !== 'butcher_order' || order.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }
    if (order.linkedSaleId) return bad(res, 'Este pedido ya fue convertido a venta');

    const ticketNumber = await getNextButcherTicketNumber(req, userId);
    const totalWeight = (order.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);

    const saleDoc = buildButcherSaleDocument(userId, {
      ticketNumber,
      clientId: order.clientId,
      clientName: order.clientName,
      clientPhone: order.clientPhone,
      items: order.items,
      totalWeight,
      total: order.total,
      paymentMethod: paymentMethod || 'cash',
      paymentDetails: paymentDetails || null,
      fromOrderId: order._id,
      soldBy: soldBy || '',
    });
    await putDocument(req, db, saleDoc._id, saleDoc);

    order.status = 'picked_up';
    order.linkedSaleId = saleDoc._id;
    order.updatedAt = new Date().toISOString();
    await putDocument(req, db, order._id, order);

    updateButcherClientCounters(req, userId, order.clientId, order.total).catch(() => {});
    if (order.clientId) {
      analyzeButcherClientHabitsAsync(req, userId, order.clientId).catch(() => {});
    }

    return res.json({ ok: true, sale: sanitizeButcherSale(saleDoc), order: sanitizeButcherOrder(order) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Error al convertir pedido' });
  }
}
