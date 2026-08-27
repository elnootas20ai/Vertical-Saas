import { getCatalogDbName, ensureDatabase, listCatalogItemsByUser } from './couchdb.js';
import { listMovementsByReference } from './stockMovementService.js';
import { recordMovement } from './stockMovementService.js';
import { findVertialStockTemplate, resolveOrderChannelStockRules } from './vertialStockDefaults.js';
import logger from './logger.js';

function findStockItemByTemplateId(stockItems, templateId) {
  const tpl = String(templateId || '').trim();
  if (!tpl || !Array.isArray(stockItems)) return null;
  return stockItems.find(
    (doc) =>
      doc?.type === 'catalog_item' &&
      !doc?.deletedAt &&
      doc?.module === 'stock' &&
      String(doc?.customFields?.vertialStockTemplateId || '') === tpl,
  );
}

/**
 * Descuenta packaging por canal de pedido (ej. 1 bolsa en domicilio).
 * Idempotente por orderId + templateId (marca en notes).
 */
export async function deductOrderChannelPackaging(req, userId, {
  orderId,
  orderType = 'delivery_order',
  deliveryType = 'domicilio',
  warehouseId = '',
  performedBy = '',
  stockItems = null,
}) {
  const rules = resolveOrderChannelStockRules(deliveryType);
  if (rules.length === 0) return { deducted: [], warnings: [] };

  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const stockCatalog =
    Array.isArray(stockItems) && stockItems.length > 0
      ? stockItems
      : await listCatalogItemsByUser(req, userId, { module: 'stock' });

  const existing = await listMovementsByReference(req, userId, orderId, orderType, {
    movementTypes: ['recipe_consumption'],
    maxDocs: 200,
  });

  const deducted = [];
  const warnings = [];

  for (const rule of rules) {
    const tplKey = `channel:${rule.templateId}`;
    const already = existing.some((m) => String(m?.notes || '').includes(tplKey));
    if (already) continue;

    const stockItem = findStockItemByTemplateId(stockCatalog, rule.templateId);
    if (!stockItem) {
      warnings.push(`Packaging canal ${rule.templateId}: artículo de stock no encontrado`);
      continue;
    }

    const tpl = findVertialStockTemplate(rule.templateId);
    try {
      const movement = await recordMovement(req, userId, {
        catalogItemId: stockItem._id,
        catalogItemName: stockItem.name,
        movementType: 'recipe_consumption',
        quantity: rule.quantity,
        warehouseId,
        referenceId: orderId,
        referenceType: orderType,
        performedBy,
        unitCost: Number(stockItem.costPrice) || tpl?.costPrice || 0,
        notes: `Consumo packaging canal (${deliveryType}) ${tplKey}`,
      });
      deducted.push(movement);
    } catch (err) {
      warnings.push(`Packaging canal ${rule.templateId}: ${err?.message || err}`);
      logger.warn({ tag: 'ORDER_CHANNEL_STOCK', orderId, templateId: rule.templateId, err: err?.message });
    }
  }

  return { deducted, warnings };
}
