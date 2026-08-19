/**
 * Lista de compra sugerida a partir de una revisión de stock (stock_count).
 * Vertical-agnóstico: usa líneas contadas + catálogo de inventario.
 *
 * TODO(fase-2): fusionar con getSmartPurchaseList (consumo histórico, campañas).
 */

import {
  getCatalogDbName,
  ensureDatabase,
  putDocument,
  buildPurchaseOrderDocument,
  sanitizePurchaseOrder,
  listCatalogItemsByUser,
  findAccountByUserId,
  logAccountActivity,
  listPurchaseOrdersByUser,
} from './couchdb.js';
import { filterStockInventoryItems } from './stockInventoryScope.js';
import { nextPurchaseOrderNumber } from './purchaseOrderNumber.js';

const URGENCY_ORDER = { critical: 0, high: 1, normal: 2 };

function urgencyForLine(counted, min, diff) {
  if (counted === 0) return 'critical';
  if (min > 0 && counted < min * 0.5) return 'high';
  if (diff < 0) return 'high';
  return 'normal';
}

/**
 * @param {object} stockCount - documento stock_count completado o en curso
 * @param {object[]} catalogItems - ítems de catálogo (inventario)
 */
export function buildPurchaseListFromStockCount(stockCount, catalogItems = []) {
  const itemsById = new Map(
    (catalogItems || []).map((item) => [String(item._id || item.id || ''), item]),
  );
  const lines = stockCount?.lines || [];
  const suggestions = [];

  for (const line of lines) {
    if (line.countedStock === null || line.countedStock === undefined) continue;

    const counted = Number(line.countedStock ?? 0);
    const min = Number(line.minStock ?? 0);
    const diff = line.difference !== null && line.difference !== undefined ? Number(line.difference) : null;
    const reasons = [];
    let suggestedQty = 0;

    if (diff !== null && diff < 0) {
      suggestedQty = Math.max(suggestedQty, Math.abs(diff));
      reasons.push('inventario_faltante');
    }
    if (min > 0 && counted < min) {
      suggestedQty = Math.max(suggestedQty, min - counted);
      reasons.push('bajo_minimo');
    }
    if (counted === 0) {
      reasons.push('agotado');
      suggestedQty = Math.max(suggestedQty, min > 0 ? min : 1);
    }

    if (suggestedQty <= 0) continue;

    const cat = itemsById.get(String(line.catalogItemId || '')) || {};
    const costPrice = Number(line.costPrice ?? cat.costPrice ?? 0);
    const qty = Math.ceil(suggestedQty);

    suggestions.push({
      catalogItemId: line.catalogItemId,
      name: line.catalogItemName || cat.name || '',
      sku: line.sku || cat.sku || '',
      currentStock: counted,
      minStock: min,
      difference: diff,
      suggestedQuantity: qty,
      unit: line.unit || cat.unit || 'ud',
      costPrice,
      estimatedTotal: Math.round(qty * costPrice * 100) / 100,
      supplierId: String(cat.supplierId || ''),
      supplierName: String(cat.supplierName || ''),
      urgency: urgencyForLine(counted, min, diff ?? 0),
      reasons,
      source: 'stock_count',
      stockCountId: stockCount._id || stockCount.id,
    });
  }

  suggestions.sort(
    (a, b) => (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2),
  );

  const supplierGroupsMap = new Map();
  for (const item of suggestions) {
    const key = item.supplierId || '__no_supplier__';
    if (!supplierGroupsMap.has(key)) {
      supplierGroupsMap.set(key, {
        supplierId: item.supplierId,
        supplierName: item.supplierName || 'Sin proveedor asignado',
        items: [],
        estimatedTotal: 0,
      });
    }
    const group = supplierGroupsMap.get(key);
    group.items.push(item);
    group.estimatedTotal = Math.round((group.estimatedTotal + item.estimatedTotal) * 100) / 100;
  }

  const totalEstimated = Math.round(
    suggestions.reduce((sum, item) => sum + item.estimatedTotal, 0) * 100,
  ) / 100;

  return {
    countId: stockCount._id || stockCount.id || '',
    countName: stockCount.name || '',
    generatedAt: new Date().toISOString(),
    items: suggestions,
    itemCount: suggestions.length,
    totalEstimated,
    supplierGroups: Array.from(supplierGroupsMap.values()),
  };
}

/** Crea borradores de pedido agrupados por proveedor a partir de una revisión de stock. */
export async function createPurchaseOrdersFromStockList(req, userId, countId, stockCount) {
  const catalogItems = filterStockInventoryItems(await listCatalogItemsByUser(req, userId));
  const purchaseList = buildPurchaseListFromStockCount(stockCount, catalogItems);

  if (!purchaseList.items.length) {
    return {
      ok: true,
      created: 0,
      orders: [],
      message: 'No hay productos que requieran pedido.',
    };
  }

  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const countName = stockCount?.name || 'revisión de stock';
  const countRef = countId || stockCount?._id || stockCount?.id || '';
  const createdOrders = [];
  const usedNumbers = (await listPurchaseOrdersByUser(req, userId)).map((o) => o.orderNumber);

  for (const group of purchaseList.supplierGroups) {
    const orderItems = group.items.map((item) => ({
      catalogItemId: item.catalogItemId,
      sku: item.sku,
      name: item.name,
      quantity: item.suggestedQuantity,
      unitCost: item.costPrice,
      notes: `Sugerido tras inventario (${countName})`,
    }));

    const orderNumber = nextPurchaseOrderNumber(usedNumbers);
    usedNumbers.push(orderNumber);
    const doc = buildPurchaseOrderDocument(userId, {
      supplierId: group.supplierId && group.supplierId !== '__no_supplier__' ? group.supplierId : '',
      supplierName: group.supplierName || 'Sin proveedor asignado',
      status: 'draft',
      source: 'stock_count',
      notes: `Generado desde lista de compra del inventario "${countName}". Ref: ${countRef}`,
      items: orderItems,
      orderNumber,
    });

    const result = await putDocument(req, db, doc._id, doc);
    createdOrders.push(sanitizePurchaseOrder({ ...doc, _rev: result.rev }));
  }

  const account = await findAccountByUserId(req, userId);
  if (account) {
    logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName || '',
      targetUserId: userId,
      type: 'purchase_order',
      action: `Creó ${createdOrders.length} pedido(s) desde inventario`,
      entityId: countRef,
      entityLabel: countName,
      metadata: { countId: countRef, orderCount: createdOrders.length },
    }).catch(() => null);
  }

  return {
    ok: true,
    created: createdOrders.length,
    orders: createdOrders,
  };
}
