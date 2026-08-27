import {
  getCatalogDbName,
  ensureDatabase,
  getDocument,
  listCatalogItemsByUser,
} from './couchdb.js';
import { listMovementsByReference } from './stockMovementService.js';
import { findRecipeByCatalogItem } from './recipeModel.js';
import { resolveVirtualRecipeFromCatalogCosting } from './recipeCostingFallback.js';
import {
  expandOrderLineForRecipeDeduction,
  mergeHalfHalfIngredientQuantities,
} from './recipeOrderExpansion.js';
import { recordMovement } from './stockMovementService.js';
import { isStockInventoryItem, filterStockInventoryItems } from './stockInventoryScope.js';
import {
  aggregateNetQtyByCatalogItem,
  netQtyByItemWarehousePair,
  parseMovementNetKey,
} from '../shared/stock/movementNetQty.js';
import logger from './logger.js';

export async function findActiveRecipeForItem(req, userId, catalogItemId) {
  const recipes = await findRecipeByCatalogItem(req, userId, catalogItemId);
  return recipes.find(r => r.active) || null;
}

async function resolveRecipeForStockDeduction(req, userId, catalogItemId, inventoryItems = null) {
  const persisted = await findActiveRecipeForItem(req, userId, catalogItemId);
  if (persisted) return persisted;
  return resolveVirtualRecipeFromCatalogCosting(req, userId, catalogItemId, inventoryItems);
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
  skipParentSale = false,
  skipIngredients = false,
  contextLabel = 'Venta',
  inventoryItems = null,
}) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const recipe = skipIngredients
    ? null
    : await resolveRecipeForStockDeduction(req, userId, catalogItemId, inventoryItems);
  const deducted = [];
  const warnings = [];

  if (!recipe) {
    const catItem = await getDocument(req, db, catalogItemId);
    if (skipIngredients) {
      if (skipParentSale) {
        return { deducted, warnings, blocked: false };
      }
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
    if (skipNonInventoryParent && !isStockInventoryItem(catItem)) {
      warnings.push(
        `"${catItem?.name || catalogItemId}" sin receta ni stock de almacén — no se descontó inventario`,
      );
      return { deducted, warnings, blocked: false };
    }
    if (!skipParentSale) {
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
    }
    if (parentMovementType === 'sale' && !skipParentSale) {
      warnings.push(`Producto ${catalogItemId} vendido sin receta — descuento directo`);
      logger.warn({ tag: 'RECIPE_STOCK', catalogItemId }, 'Producto vendido sin receta');
    }
    return { deducted, warnings, blocked: false };
  }

  const catItem = await getDocument(req, db, catalogItemId);
  if (!skipParentSale && (!skipNonInventoryParent || isStockInventoryItem(catItem))) {
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

  if (skipIngredients) {
    return { deducted, warnings, blocked: false };
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

async function deductHalfHalfByRecipe(req, userId, {
  catalogItemId,
  halfHalf,
  quantitySold,
  warehouseId = '',
  referenceId = '',
  referenceType = '',
  performedBy = '',
  inventoryItems = null,
}) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const baseRecipe = await resolveRecipeForStockDeduction(req, userId, catalogItemId, inventoryItems);
  const firstRecipe = await resolveRecipeForStockDeduction(
    req,
    userId,
    halfHalf.firstProductId,
    inventoryItems,
  );
  const secondRecipe = await resolveRecipeForStockDeduction(
    req,
    userId,
    halfHalf.secondProductId,
    inventoryItems,
  );

  const deducted = [];
  const warnings = [];

  const catItem = await getDocument(req, db, catalogItemId);
  const parentMovement = await recordMovement(req, userId, {
    catalogItemId,
    movementType: 'sale',
    quantity: quantitySold,
    warehouseId,
    referenceId,
    referenceType,
    performedBy,
    notes: `Venta mitad y mitad: ${halfHalf.firstProductName} / ${halfHalf.secondProductName}`,
    recipeId: baseRecipe?._id || '',
  });
  deducted.push(parentMovement);

  const merged = mergeHalfHalfIngredientQuantities({
    baseRecipe,
    firstRecipe,
    secondRecipe,
    quantitySold,
  });

  if (merged.size === 0) {
    warnings.push(
      `"${catItem?.name || catalogItemId}" mitad y mitad sin ingredientes de receta — solo venta registrada`,
    );
    return { deducted, warnings, blocked: false };
  }

  for (const ingredient of merged.values()) {
    try {
      const movement = await recordMovement(req, userId, {
        catalogItemId: ingredient.catalogItemId,
        movementType: 'recipe_consumption',
        quantity: ingredient.quantity,
        warehouseId,
        referenceId,
        referenceType,
        performedBy,
        recipeId: baseRecipe?._id || firstRecipe?._id || secondRecipe?._id || '',
        parentItemId: catalogItemId,
        parentItemName: catItem?.name || '',
        unitCost: ingredient.unitCost,
        notes: `Consumo mitad y mitad (x${quantitySold})`,
      });
      deducted.push(movement);
    } catch (err) {
      warnings.push(`Error al descontar ${ingredient.catalogItemName}: ${err.message}`);
    }
  }

  return { deducted, warnings, blocked: false };
}

function isComboExpansionLine(expanded) {
  return expanded.some(
    (line) => line.parentCatalogItemId && line.parentCatalogItemId !== line.catalogItemId,
  );
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
  const movements = await listMovementsByReference(req, userId, referenceId, '', {
    movementTypes: [movementType],
    maxDocs: 200,
  });
  return movements.some(
    (doc) => doc?.catalogItemId === catalogItemId && doc?.movementType === movementType,
  );
}

const DELIVERY_REF_MOVEMENT_TYPES = [
  'sale',
  'sale_reversal',
  'recipe_consumption',
  'recipe_consumption_reversal',
];

async function listDeliveryOrderRefMovements(req, userId, orderId, orderType) {
  return listMovementsByReference(req, userId, orderId, orderType, {
    movementTypes: DELIVERY_REF_MOVEMENT_TYPES,
    maxDocs: 500,
  });
}

async function loadUserCatalogById(req, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return new Map();

  const [stockRows, catalogRows] = await Promise.all([
    listCatalogItemsByUser(req, uid, { module: 'stock' }),
    listCatalogItemsByUser(req, uid, { module: 'catalog' }),
  ]);

  const catalogById = new Map();
  for (const doc of [...stockRows, ...catalogRows]) {
    if (!doc?._id || doc.deletedAt) continue;
    catalogById.set(String(doc._id), doc);
  }
  return catalogById;
}

function netQtyByMovementPair(movements, outboundType, inboundType) {
  return netQtyByItemWarehousePair(movements, outboundType, inboundType);
}

/**
 * Revierte movimientos de stock pendientes para un pedido delivery (venta + consumos de receta),
 * usando los movimientos ya registrados (simétrico al descuento). Idempotente si se llama dos veces.
 * Restaura en el mismo warehouseId de cada movimiento original.
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

  async function reverseNetMap(netMap, movementType, notes) {
    for (const [key, net] of Object.entries(netMap)) {
      if (!(net > 1e-9)) continue;
      const { catalogItemId, warehouseId } = parseMovementNetKey(key);
      if (!catalogItemId) continue;
      try {
        const mov = await recordMovement(req, userId, {
          catalogItemId,
          movementType,
          quantity: net,
          warehouseId,
          referenceId: orderId,
          referenceType: orderType,
          performedBy,
          notes,
        });
        restored.push(mov);
      } catch (err) {
        warnings.push(`${movementType} ${catalogItemId}: ${err?.message || err}`);
        logger.warn(
          { tag: 'RECIPE_STOCK', orderId, catalogItemId, warehouseId, err: err?.message },
          `Error reverso ${movementType} delivery`,
        );
      }
    }
  }

  await reverseNetMap(saleNet, 'sale_reversal', 'Devolución / salida de entregado — reverso venta (delivery)');
  await reverseNetMap(
    recipeNet,
    'recipe_consumption_reversal',
    'Devolución / salida de entregado — reverso consumo receta (delivery)',
  );

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
  const orderLines = (items || []).filter(
    (item) => (item.catalogItemId || item.productId) && Number(item.quantity || 0) > 0,
  );
  if (orderLines.length === 0) {
    return { deducted: [], warnings: [], blocked: false };
  }

  const catalogById = await loadUserCatalogById(req, userId);
  const inventoryItems = filterStockInventoryItems([...catalogById.values()]);

  const movements = await listDeliveryOrderRefMovements(req, userId, orderId, orderType);
  const saleNet = aggregateNetQtyByCatalogItem(
    netQtyByMovementPair(movements, 'sale', 'sale_reversal'),
  );

  const allDeducted = [];
  const allWarnings = [];
  let processedLines = 0;

  for (const line of orderLines) {
    const parentId = String(line.catalogItemId || line.productId || '').trim();
    const reqQty = Number(line.quantity || 0);
    if (!parentId || !(reqQty > 0)) continue;

    const expanded = expandOrderLineForRecipeDeduction(line, catalogById);
    if (expanded.length === 0) continue;

    const soldNet = saleNet[parentId] || 0;
    if (soldNet >= reqQty - 1e-9) continue;

    const remaining = reqQty - soldNet;
    processedLines += 1;
    const scale = remaining / reqQty;

    if (expanded.length === 1 && expanded[0].halfHalf) {
      const result = await deductHalfHalfByRecipe(req, userId, {
        catalogItemId: parentId,
        halfHalf: expanded[0].halfHalf,
        quantitySold: remaining,
        warehouseId,
        referenceId: orderId,
        referenceType: orderType,
        performedBy,
        inventoryItems,
      });
      allDeducted.push(...result.deducted);
      allWarnings.push(...result.warnings);
      continue;
    }

    if (isComboExpansionLine(expanded)) {
      const parentResult = await deductByRecipe(req, userId, {
        catalogItemId: parentId,
        quantitySold: remaining,
        warehouseId,
        referenceId: orderId,
        referenceType: orderType,
        performedBy,
        skipIngredients: true,
        inventoryItems,
      });
      allDeducted.push(...parentResult.deducted);
      allWarnings.push(...parentResult.warnings);

      for (const child of expanded) {
        const childQty = Math.round(Number(child.quantity || 0) * scale * 10000) / 10000;
        if (!(childQty > 0)) continue;
        const childResult = await deductByRecipe(req, userId, {
          catalogItemId: child.catalogItemId,
          quantitySold: childQty,
          warehouseId,
          referenceId: orderId,
          referenceType: orderType,
          performedBy,
          skipParentSale: true,
          inventoryItems,
        });
        allDeducted.push(...childResult.deducted);
        allWarnings.push(...childResult.warnings);
      }
      continue;
    }

    const result = await deductByRecipe(req, userId, {
      catalogItemId: parentId,
      quantitySold: remaining,
      warehouseId,
      referenceId: orderId,
      referenceType: orderType,
      performedBy,
      inventoryItems,
    });
    allDeducted.push(...result.deducted);
    allWarnings.push(...result.warnings);
  }

  if (allDeducted.length === 0 && processedLines === 0 && orderLines.length > 0) {
    logger.info({ tag: 'RECIPE_STOCK', orderId }, 'Descuento ya cubierto por movimientos existentes (idempotencia)');
    return { deducted: [], warnings: ['Descuento ya cubierto por movimientos existentes'], blocked: false };
  }

  return { deducted: allDeducted, warnings: allWarnings, blocked: false };
}
