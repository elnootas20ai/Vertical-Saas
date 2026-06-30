import { getCatalogDbName, ensureDatabase, getAllDocuments } from './couchdb.js';
import { recordMovement } from './stockMovementService.js';
import { findVertialStockTemplate, resolveOrderChannelStockRules } from './vertialStockDefaults.js';
import logger from './logger.js';

async function findStockItemByTemplateId(req, userId, templateId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.find(
    (doc) =>
      doc?.type === 'catalog_item' &&
      doc?.user_id === userId &&
      !doc?.deletedAt &&
      doc?.module === 'stock' &&
      String(doc?.customFields?.vertialStockTemplateId || '') === templateId,
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
}) {
  const rules = resolveOrderChannelStockRules(deliveryType);
  if (rules.length === 0) return { deducted: [], warnings: [] };

  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const existing = docs.filter(
    (doc) =>
      doc?.type === 'stock_movement' &&
      doc?.user_id === userId &&
      doc?.referenceId === orderId &&
      doc?.referenceType === orderType &&
      doc?.movementType === 'recipe_consumption',
  );

  const deducted = [];
  const warnings = [];

  for (const rule of rules) {
    const tplKey = `channel:${rule.templateId}`;
    const already = existing.some((m) => String(m?.notes || '').includes(tplKey));
    if (already) continue;

    const stockItem = await findStockItemByTemplateId(req, userId, rule.templateId);
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
