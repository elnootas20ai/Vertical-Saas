/**
 * MAT-07: Automatización de stock para materiales de limpieza.
 *
 * Descuenta stock al confirmar una entrega (material_delivery → delivered).
 * Suma stock al aceptar una devolución (material_return → accepted) para items reusables.
 */

import { recordMovement } from './stockMovementService.js';
import {
  getCleaningDbName,
  ensureDatabase,
  getDocument,
  putDocument,
} from './couchdb.js';
import logger from './logger.js';

export async function processDeliveryStockDeduction(req, userId, delivery) {
  if (!delivery || delivery.status !== 'delivered') return [];
  const results = [];

  for (const line of (delivery.lines || [])) {
    if (!line.catalogItemId || line.quantity <= 0) continue;
    try {
      const movement = await recordMovement(req, userId, {
        catalogItemId: line.catalogItemId,
        catalogItemName: line.materialName,
        sku: line.sku || '',
        warehouseId: delivery.warehouseId || '',
        movementType: 'material_delivery',
        quantity: line.quantity,
        unitCost: line.unitCost || 0,
        totalCost: (line.unitCost || 0) * line.quantity,
        referenceId: delivery._id,
        referenceType: 'material_delivery',
        notes: `Entrega ${delivery.deliveryNumber} → ${delivery.workerName}`,
        performedBy: delivery.deliveredBy || userId,
      });
      results.push(movement);
    } catch (err) {
      logger.warn({ tag: 'MAT_STOCK', catalogItemId: line.catalogItemId, err: err.message },
        'No se pudo descontar stock para entrega');
    }
  }

  return results;
}

export async function processReturnStockAddition(req, userId, materialReturn) {
  if (!materialReturn) return [];
  const results = [];

  for (const line of (materialReturn.lines || [])) {
    if (!line.catalogItemId || line.quantityReturned <= 0) continue;
    if (!line.reusable) continue;
    try {
      const movement = await recordMovement(req, userId, {
        catalogItemId: line.catalogItemId,
        catalogItemName: line.materialName,
        warehouseId: materialReturn.warehouseId || '',
        movementType: 'material_return',
        quantity: line.quantityReturned,
        unitCost: 0,
        totalCost: 0,
        referenceId: materialReturn._id,
        referenceType: 'material_return',
        notes: `Devolución ${materialReturn.returnNumber} ← ${materialReturn.workerName} (${line.condition})`,
        performedBy: materialReturn.inspectedBy || userId,
      });
      results.push(movement);
    } catch (err) {
      logger.warn({ tag: 'MAT_STOCK', catalogItemId: line.catalogItemId, err: err.message },
        'No se pudo sumar stock para devolución');
    }
  }

  if (materialReturn.deliveryId) {
    try {
      await updateDeliveryReturnQuantities(req, userId, materialReturn);
    } catch (err) {
      logger.warn({ tag: 'MAT_STOCK', err: err.message }, 'No se pudo actualizar returnedQuantity en delivery');
    }
  }

  return results;
}

async function updateDeliveryReturnQuantities(req, userId, materialReturn) {
  const db = getCleaningDbName();
  await ensureDatabase(req, db);
  const delivery = await getDocument(req, db, materialReturn.deliveryId);
  if (!delivery || delivery.type !== 'material_delivery') return;

  let changed = false;
  const updatedLines = (delivery.lines || []).map((dl) => {
    const returnLine = materialReturn.lines.find((rl) => rl.catalogItemId === dl.catalogItemId);
    if (!returnLine) return dl;
    changed = true;
    const newReturned = (dl.returnedQuantity || 0) + returnLine.quantityReturned;
    return {
      ...dl,
      returnedQuantity: newReturned,
      returnStatus: newReturned >= dl.quantity ? 'returned' : 'partial',
    };
  });

  if (!changed) return;

  const allReturned = updatedLines.every((l) => !l.requiresReturn || l.returnStatus === 'returned' || l.returnStatus === 'not_applicable');
  const someReturned = updatedLines.some((l) => l.returnStatus === 'partial' || l.returnStatus === 'returned');

  await putDocument(req, db, delivery._id, {
    ...delivery,
    lines: updatedLines,
    status: allReturned ? 'returned' : (someReturned ? 'partial_return' : delivery.status),
    updatedAt: new Date().toISOString(),
  });
}
