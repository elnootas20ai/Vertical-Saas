import logger from './logger.js';
import {
  getCatalogDbName,
  getDeliveryDbName,
  NOTIFICATIONS_DB,
  ACCOUNTS_DB,
  ensureDatabase,
  getAllDocuments,
  putDocument,
  couchRequest,
  buildPurchaseOrderDocument,
  buildNotificationDocument,
  saveNotification,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';

const TAG = 'AUTO_ORDER';

async function getAllUserIds(req) {
  await ensureDatabase(req, ACCOUNTS_DB);
  const docs = await getAllDocuments(req, ACCOUNTS_DB);
  return [...new Set(
    docs
      .filter((d) => d?.type === 'account' && !d?.deletedAt && d?.user_id)
      .map((d) => d.user_id),
  )];
}

function detectLowStockItems(catalogItems) {
  const results = [];
  for (const item of catalogItems) {
    if (!item.active || item.deletedAt) continue;
    if (!item.autoReorder) continue;

    if (item.minStock > 0 && item.stockQuantity < item.minStock) {
      results.push(item);
      continue;
    }

    if (Array.isArray(item.warehouseStock)) {
      const hasWarehouseLow = item.warehouseStock.some(
        (ws) => ws.minStock > 0 && Number(ws.quantity || 0) < ws.minStock,
      );
      if (hasWarehouseLow) {
        results.push(item);
      }
    }
  }
  return results;
}

function groupItemsBySupplier(items, weekendMultiplier, promotions) {
  const groups = {};
  for (const item of items) {
    const supplierKey = item.supplierId || '__no_supplier__';
    const siteKey = item.workCenterId || '__no_site__';
    const key = `${supplierKey}::${siteKey}`;
    if (!groups[key]) {
      groups[key] = {
        supplierId: item.supplierId || '',
        supplierName: item.supplierName || '',
        workCenterId: item.workCenterId || '',
        workCenterName: item.workCenterName || '',
        items: [],
      };
    }

    let reorderQty = item.reorderQuantity > 0
      ? item.reorderQuantity
      : Math.max(item.minStock * 2, 1) - item.stockQuantity;

    reorderQty = Math.ceil(reorderQty * weekendMultiplier);

    const { boost, campaignIds } = getActiveCampaignBoost(item, promotions);
    reorderQty = Math.ceil(reorderQty * boost);

    groups[key].items.push({
      catalogItemId: item._id,
      sku: item.sku || '',
      name: item.name,
      quantity: Math.max(reorderQty, 1),
      unitCost: item.costPrice || 0,
      notes: '',
      campaignIds,
    });
  }
  return Object.values(groups);
}

function hasPendingOrderForSupplier(existingOrders, supplierId) {
  return existingOrders.some(
    (o) =>
      o.supplierId === supplierId &&
      !o.deletedAt &&
      ['draft', 'pending'].includes(o.status),
  );
}

async function sendAutoOrderNotification(req, userId, ordersCreated) {
  try {
    const totalItems = ordersCreated.reduce((s, o) => s + (o.items?.length || 0), 0);
    const notification = buildNotificationDocument({
      userId,
      level: 'warning',
      category: 'purchase_order',
      title: 'Pedidos automáticos generados',
      message: `Se han creado ${ordersCreated.length} pedido(s) con ${totalItems} artículo(s) por stock bajo.`,
      entityType: 'purchase_order',
      route: '/saas/compras-stock?tab=pedidos',
      metadata: { orderIds: ordersCreated.map((o) => o._id), totalItems },
    });
    const saved = await saveNotification(req, notification);
    broadcastToUser(userId, 'notification', saved);
    sendPushToUser(req, userId, {
      title: saved.title,
      body: saved.message,
      data: { route: '/saas/compras-stock?tab=pedidos', notificationId: saved._id },
    }).catch(() => null);
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error enviando notificación de pedido automático');
  }
}

async function sendCriticalStockNotification(req, userId, criticalItems) {
  try {
    const names = criticalItems.slice(0, 5).map((i) => i.name).join(', ');
    const extra = criticalItems.length > 5 ? ` y ${criticalItems.length - 5} más` : '';
    const notification = buildNotificationDocument({
      userId,
      level: 'alert',
      category: 'stock_critical',
      title: 'Stock crítico detectado',
      message: `${criticalItems.length} artículo(s) con stock crítico: ${names}${extra}`,
      entityType: 'catalog_item',
      route: '/saas/compras-stock?tab=stock',
      metadata: { itemIds: criticalItems.map((i) => i._id) },
    });
    const saved = await saveNotification(req, notification);
    broadcastToUser(userId, 'notification', saved);
    sendPushToUser(req, userId, {
      title: saved.title,
      body: saved.message,
      data: { route: '/saas/compras-stock?tab=stock', notificationId: saved._id },
    }).catch(() => null);
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message }, 'Error enviando notificación de stock crítico');
  }
}

function calculateWeekendMultiplier(deliveryOrders) {
  if (!deliveryOrders || deliveryOrders.length === 0) return 1;

  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86_400_000);

  const recentOrders = deliveryOrders.filter((o) => {
    const d = new Date(o.createdAt);
    return !Number.isNaN(d.getTime()) && d >= fourWeeksAgo && o.status === 'delivered';
  });

  if (recentOrders.length < 5) return 1;

  let weekdayItems = 0, weekdayDays = 0;
  let weekendItems = 0, weekendDays = 0;
  const dayCounts = { weekday: new Set(), weekend: new Set() };

  for (const order of recentOrders) {
    const d = new Date(order.createdAt);
    const dayOfWeek = d.getDay();
    const dateKey = d.toISOString().slice(0, 10);
    const totalQty = (order.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0);

    if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
      weekendItems += totalQty;
      dayCounts.weekend.add(dateKey);
    } else {
      weekdayItems += totalQty;
      dayCounts.weekday.add(dateKey);
    }
  }

  weekdayDays = Math.max(dayCounts.weekday.size, 1);
  weekendDays = Math.max(dayCounts.weekend.size, 1);

  const weekdayAvg = weekdayItems / weekdayDays;
  const weekendAvg = weekendItems / weekendDays;

  if (weekdayAvg <= 0) return 1;
  return Math.max(1, weekendAvg / weekdayAvg);
}

function isPreWeekend() {
  const day = new Date().getDay();
  return day === 3 || day === 4;
}

function getActiveCampaignBoost(catalogItem, promotions) {
  if (!promotions || promotions.length === 0) return { boost: 1, campaignIds: [] };

  const now = new Date();
  const activeCampaigns = promotions.filter((p) => {
    if (!p.active && p.status !== 'active') return false;
    const start = p.startDate ? new Date(p.startDate) : null;
    const end = p.endDate ? new Date(p.endDate) : null;
    if (start && start > now) return false;
    if (end && end < now) return false;
    return true;
  });

  const matched = activeCampaigns.filter((p) => {
    const productIds = p.productIds || p.catalogItemIds || [];
    const categories = p.categories || [];
    return productIds.includes(catalogItem._id) || categories.includes(catalogItem.category);
  });

  if (matched.length === 0) return { boost: 1, campaignIds: [] };
  return { boost: 1.3, campaignIds: matched.map((p) => p._id) };
}

function calculateUrgency(item) {
  const stock = Number(item.stockQuantity || 0);
  const min = Number(item.minStock || 0);
  if (stock === 0 || item.isCritical) return 'critical';
  if (min > 0 && stock < min * 0.5) return 'high';
  return 'normal';
}

function buildAutoNotes(items, weekendMultiplier, campaignIds, promotions) {
  const parts = [];
  const lowStockCount = items.filter((i) => i.reason === 'low_stock').length || items.length;
  parts.push(`${lowStockCount} producto(s) por stock bajo`);

  if (weekendMultiplier > 1) {
    parts.push(`previsión fin de semana (×${weekendMultiplier.toFixed(1)})`);
  }

  if (campaignIds.length > 0) {
    const names = campaignIds.slice(0, 3).map((id) => {
      const promo = promotions.find((p) => p._id === id);
      return promo?.name || promo?.title || id.slice(-6);
    });
    parts.push(`campaña(s): ${names.join(', ')}`);
  }

  return `Auto-generado: ${parts.join(', ')}`;
}

export async function generateAutoOrders(req, userId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const allDocs = await getAllDocuments(req, db);

  const catalogItems = allDocs.filter(
    (d) => d?.type === 'catalog_item' && d?.user_id === userId && !d?.deletedAt,
  );
  const existingOrders = allDocs.filter(
    (d) => d?.type === 'purchase_order' && d?.user_id === userId && !d?.deletedAt,
  );

  let deliveryOrders = [];
  let promotions = [];
  try {
    const deliveryDb = getDeliveryDbName();
    await ensureDatabase(req, deliveryDb);
    const deliveryDocs = await getAllDocuments(req, deliveryDb);
    deliveryOrders = deliveryDocs.filter((d) => d?.type === 'delivery_order' && d?.user_id === userId && !d?.deletedAt);
  } catch { /* delivery DB may not exist */ }

  try {
    promotions = allDocs.filter((d) => d?.type === 'promotion' && d?.user_id === userId && !d?.deletedAt);
  } catch { /* ignore */ }

  const weekendMultiplier = isPreWeekend() ? calculateWeekendMultiplier(deliveryOrders) : 1;

  const lowStockItems = detectLowStockItems(catalogItems);
  if (lowStockItems.length === 0) return { created: 0, orders: [] };

  const criticalItems = lowStockItems.filter((i) => i.stockQuantity === 0);
  if (criticalItems.length > 0) {
    await sendCriticalStockNotification(req, userId, criticalItems);
  }

  const supplierGroups = groupItemsBySupplier(lowStockItems, weekendMultiplier, promotions);
  const ordersCreated = [];

  for (const group of supplierGroups) {
    if (group.supplierId && hasPendingOrderForSupplier(existingOrders, group.supplierId)) {
      logger.info({ tag: TAG, userId, supplierId: group.supplierId }, 'Pedido pendiente existente, omitiendo');
      continue;
    }

    const maxUrgency = group.items.reduce((u, i) => {
      const itemUrgency = calculateUrgency(catalogItems.find((c) => c._id === i.catalogItemId) || i);
      if (itemUrgency === 'critical') return 'critical';
      if (itemUrgency === 'high' && u !== 'critical') return 'high';
      return u;
    }, 'normal');

    const allCampaignIds = [...new Set(group.items.flatMap((i) => i.campaignIds || []))];

    const orderDoc = buildPurchaseOrderDocument(userId, {
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      workCenterId: group.workCenterId || '',
      workCenterName: group.workCenterName || '',
      status: 'draft',
      source: 'auto',
      items: group.items,
      urgency: maxUrgency,
      campaignIds: allCampaignIds,
      notes: buildAutoNotes(group.items, weekendMultiplier, allCampaignIds, promotions),
    });

    const result = await putDocument(req, db, orderDoc._id, orderDoc);
    ordersCreated.push({ ...orderDoc, _rev: result.rev });
    logger.info(
      { tag: TAG, userId, orderId: orderDoc._id, supplier: group.supplierName, itemCount: group.items.length },
      'Pedido automático creado',
    );
  }

  if (ordersCreated.length > 0) {
    await sendAutoOrderNotification(req, userId, ordersCreated);
  }

  return { created: ordersCreated.length, orders: ordersCreated };
}

export async function runAutoOrdersForAllUsers() {
  try {
    const fakeReq = { headers: {} };
    const userIds = await getAllUserIds(fakeReq);

    let totalCreated = 0;
    for (const userId of userIds) {
      try {
        const result = await generateAutoOrders(fakeReq, userId);
        totalCreated += result.created;
      } catch (err) {
        logger.error({ tag: TAG, userId, err: err?.message }, 'Error generando pedidos para usuario');
      }
    }

    if (totalCreated > 0) {
      logger.info({ tag: TAG, totalCreated }, 'Ejecución de pedidos automáticos completada');
    }
  } catch (err) {
    logger.error({ tag: TAG, err: err?.message }, 'Error en ejecución global de pedidos automáticos');
  }
}
