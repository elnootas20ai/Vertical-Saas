import {
  getCatalogDbName,
  ensureDatabase,
  getAllDocuments,
  getDocument,
} from './couchdb.js';
import { findRecipeByCatalogItem } from './recipeModel.js';
import { recordMovement } from './stockMovementService.js';
import { isStockInventoryItem } from './stockInventoryScope.js';
import logger from './logger.js';

export async function findActiveRecipeForItem(req, userId, catalogItemId) {
  const recipes = await findRecipeByCatalogItem(req, userId, catalogItemId);
  return recipes.find(r => r.active) || null;
}

export async function deductByRecipe(req, userId, {
  catalogItemId,
  quantitySold,
  warehouseId = '',
  referenceId = '',
  referenceType = '',
  performedBy = '',
  parentMovementType = 'sale',
  skipNonInventoryParent = false,
  contextLabel = 'Venta',
}) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const recipe = await findActiveRecipeForItem(req, userId, catalogItemId);
  const deducted = [];
  const warnings = [];

  if (!recipe) {
    const catItem = await getDocument(req, db, catalogItemId);
    if (skipNonInventoryParent && !isStockInventoryItem(catItem)) {
      warnings.push(
        `"${catItem?.name || catalogItemId}" sin receta ni stock de almacén — no se descontó inventario`,
      );
      return { deducted, warnings, blocked: false };
    }
    const movement = await recordMovement(req, userId, {
      catalogItemId,
      movementType: parentMovementType,
      quantity: quantitySold,
      warehouseId,
      referenceId,
      referenceType,
      performedBy,
      notes: `${contextLabel} sin receta — descuento directo`,
    });
    deducted.push(movement);
    if (parentMovementType === 'sale') {
      warnings.push(`Producto ${catalogItemId} vendido sin receta — descuento directo`);
      logger.warn({ tag: 'RECIPE_STOCK', catalogItemId }, 'Producto vendido sin receta');
    }
    return { deducted, warnings, blocked: false };
  }

  const catItem = await getDocument(req, db, catalogItemId);
  if (!skipNonInventoryParent || isStockInventoryItem(catItem)) {
    const parentMovement = await recordMovement(req, userId, {
      catalogItemId,
      movementType: parentMovementType,
      quantity: quantitySold,
      warehouseId,
      referenceId,
      referenceType,
      performedBy,
      notes: `${contextLabel} con receta: ${recipe.name}`,
      recipeId: recipe._id,
    });
    deducted.push(parentMovement);
  }

  const recipeNoteSuffix = referenceType === 'staff_consumption' ? ' (consumo equipo)' : '';

  for (const ingredient of recipe.ingredients) {
    const quantityPerUnit = ingredient.quantity / (recipe.portions || 1);
    let quantityToDeduct = quantityPerUnit * quantitySold;

    if (ingredient.wastePercent > 0) {
      quantityToDeduct = quantityToDeduct / (1 - ingredient.wastePercent / 100);
    }

    quantityToDeduct = Math.round(quantityToDeduct * 10000) / 10000;

    if (quantityToDeduct <= 0) continue;

    try {
      const movement = await recordMovement(req, userId, {
        catalogItemId: ingredient.catalogItemId,
        movementType: 'recipe_consumption',
        quantity: quantityToDeduct,
        warehouseId,
        referenceId,
        referenceType,
        performedBy,
        recipeId: recipe._id,
        parentItemId: catalogItemId,
        parentItemName: recipe.catalogItemName,
        unitCost: ingredient.costPerUnit,
        notes: `Consumo por receta "${recipe.name}" (x${quantitySold})${recipeNoteSuffix}`,
      });
      deducted.push(movement);
    } catch (err) {
      if (ingredient.optional) {
        warnings.push(`Ingrediente opcional ${ingredient.catalogItemName} no descontado: ${err.message}`);
      } else {
        warnings.push(`Error al descontar ${ingredient.catalogItemName}: ${err.message}`);
      }
    }
  }

  logger.info({
    tag: 'RECIPE_STOCK',
    recipeId: recipe._id,
    catalogItemId,
    quantitySold,
    ingredientsDeducted: deducted.length - 1,
  }, 'Descuento por receta completado');

  return { deducted, warnings, blocked: false };
}

async function hasReferenceStockMovements(req, userId, referenceId, referenceType) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.some(
    (doc) =>
      doc?.type === 'stock_movement' &&
      doc?.user_id === userId &&
      doc?.referenceId === referenceId &&
      doc?.referenceType === referenceType,
  );
}

/** Descuenta stock al registrar un consumo de equipo (receta → ingredientes; sin receta → artículo de almacén). */
export async function deductStaffConsumptionStock(req, userId, {
  catalogItemId,
  quantity,
  consumptionId,
  workerId = '',
  workerName = '',
  itemName = '',
  warehouseId = '',
  performedBy = '',
}) {
  if (await hasReferenceStockMovements(req, userId, consumptionId, 'staff_consumption')) {
    return { deducted: [], warnings: ['Stock ya descontado para este consumo'], blocked: false };
  }

  const actor = String(performedBy || workerId || '').trim();
  const label = `Consumo equipo${workerName ? `: ${workerName}` : ''}${itemName ? ` · ${itemName}` : ''}`;

  const result = await deductByRecipe(req, userId, {
    catalogItemId,
    quantitySold: quantity,
    warehouseId,
    referenceId: consumptionId,
    referenceType: 'staff_consumption',
    performedBy: actor,
    parentMovementType: 'internal_consumption',
    skipNonInventoryParent: true,
    contextLabel: label,
  });

  if (result.deducted.length > 0) {
    logger.info({
      tag: 'STAFF_CONSUMPTION_STOCK',
      consumptionId,
      catalogItemId,
      quantity,
      movements: result.deducted.length,
    }, 'Stock descontado por consumo de equipo');
  }

  return result;
}

export async function checkIdempotency(req, userId, referenceId, catalogItemId, movementType) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.some(
    (doc) =>
      doc?.type === 'stock_movement' &&
      doc?.user_id === userId &&
      doc?.referenceId === referenceId &&
      doc?.catalogItemId === catalogItemId &&
      doc?.movementType === movementType,
  );
}

const DELIVERY_REF_MOVEMENT_TYPES = [
  'sale',
  'sale_reversal',
  'recipe_consumption',
  'recipe_consumption_reversal',
];

async function listDeliveryOrderRefMovements(req, userId, orderId, orderType) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.filter(
    (d) =>
      d?.type === 'stock_movement' &&
      d?.user_id === userId &&
      d?.referenceId === orderId &&
      d?.referenceType === orderType &&
      DELIVERY_REF_MOVEMENT_TYPES.includes(d.movementType),
  );
}

function netQtyByMovementPair(movements, outboundType, inboundType) {
  const map = Object.create(null);
  for (const m of movements) {
    const id = m.catalogItemId;
    if (!id) continue;
    const q = Number(m.quantity || 0);
    if (q <= 0) continue;
    if (m.movementType === outboundType) map[id] = (map[id] || 0) + q;
    else if (m.movementType === inboundType) map[id] = (map[id] || 0) - q;
  }
  return map;
}

function aggregateItemsByCatalog(items) {
  const map = new Map();
  for (const item of items || []) {
    const id = item.catalogItemId;
    if (!id) continue;
    const q = Number(item.quantity || 0);
    if (q <= 0) continue;
    map.set(id, (map.get(id) || 0) + q);
  }
  return [...map.entries()].map(([catalogItemId, quantity]) => ({ catalogItemId, quantity }));
}

/**
 * Revierte movimientos de stock pendientes para un pedido delivery (venta + consumos de receta),
 * usando los movimientos ya registrados (simétrico al descuento). Idempotente si se llama dos veces.
 */
export async function restoreDeliveryOrderStockFromMovements(req, userId, {
  orderId,
  orderType = 'delivery_order',
  performedBy = 'system',
}) {
  const movements = await listDeliveryOrderRefMovements(req, userId, orderId, orderType);
  const saleNet = netQtyByMovementPair(movements, 'sale', 'sale_reversal');
  const recipeNet = netQtyByMovementPair(movements, 'recipe_consumption', 'recipe_consumption_reversal');

  const restored = [];
  const warnings = [];

  for (const catalogItemId of Object.keys(saleNet)) {
    const net = saleNet[catalogItemId];
    if (net <= 1e-9) continue;
    try {
      const mov = await recordMovement(req, userId, {
        catalogItemId,
        movementType: 'sale_reversal',
        quantity: net,
        referenceId: orderId,
        referenceType: orderType,
        performedBy,
        notes: 'Devolución / salida de entregado — reverso venta (delivery)',
      });
      restored.push(mov);
    } catch (err) {
      warnings.push(`sale_reversal ${catalogItemId}: ${err?.message || err}`);
      logger.warn({ tag: 'RECIPE_STOCK', orderId, catalogItemId, err: err?.message }, 'Error reverso venta delivery');
    }
  }

  for (const catalogItemId of Object.keys(recipeNet)) {
    const net = recipeNet[catalogItemId];
    if (net <= 1e-9) continue;
    try {
      const mov = await recordMovement(req, userId, {
        catalogItemId,
        movementType: 'recipe_consumption_reversal',
        quantity: net,
        referenceId: orderId,
        referenceType: orderType,
        performedBy,
        notes: 'Devolución / salida de entregado — reverso consumo receta (delivery)',
      });
      restored.push(mov);
    } catch (err) {
      warnings.push(`recipe_consumption_reversal ${catalogItemId}: ${err?.message || err}`);
      logger.warn({ tag: 'RECIPE_STOCK', orderId, catalogItemId, err: err?.message }, 'Error reverso receta delivery');
    }
  }

  if (restored.length === 0) {
    logger.info({ tag: 'RECIPE_STOCK', orderId }, 'Sin stock neto a revertir para este pedido');
    return { restored: [], warnings: warnings.length ? warnings : ['Sin movimientos de salida pendientes de reverso'] };
  }

  logger.info({ tag: 'RECIPE_STOCK', orderId, movements: restored.length }, 'Stock delivery revertido desde movimientos');
  return { restored, warnings };
}

export async function deductOrderByRecipe(req, userId, {
  orderId,
  orderType,
  items,
  warehouseId = '',
  performedBy = '',
}) {
  const aggregated = aggregateItemsByCatalog(items);
  if (aggregated.length === 0) {
    return { deducted: [], warnings: [], blocked: false };
  }

  const movements = await listDeliveryOrderRefMovements(req, userId, orderId, orderType);
  const saleNet = netQtyByMovementPair(movements, 'sale', 'sale_reversal');

  const allDeducted = [];
  const allWarnings = [];

  for (const item of aggregated) {
    const reqQty = item.quantity;
    const soldNet = saleNet[item.catalogItemId] || 0;
    if (soldNet >= reqQty - 1e-9) continue;

    const remaining = reqQty - soldNet;
    const result = await deductByRecipe(req, userId, {
      catalogItemId: item.catalogItemId,
      quantitySold: remaining,
      warehouseId,
      referenceId: orderId,
      referenceType: orderType,
      performedBy,
    });
    allDeducted.push(...result.deducted);
    allWarnings.push(...result.warnings);
  }

  if (allDeducted.length === 0 && aggregated.length > 0) {
    logger.info({ tag: 'RECIPE_STOCK', orderId }, 'Descuento ya cubierto por movimientos existentes (idempotencia)');
    return { deducted: [], warnings: ['Descuento ya cubierto por movimientos existentes'], blocked: false };
  }

  return { deducted: allDeducted, warnings: allWarnings, blocked: false };
}
