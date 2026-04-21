import {
  getCatalogDbName,
  ensureDatabase,
  getAllDocuments,
} from './couchdb.js';
import { findRecipeByCatalogItem } from './recipeModel.js';
import { recordMovement } from './stockMovementService.js';
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
}) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);

  const recipe = await findActiveRecipeForItem(req, userId, catalogItemId);
  const deducted = [];
  const warnings = [];

  if (!recipe) {
    const movement = await recordMovement(req, userId, {
      catalogItemId,
      movementType: 'sale',
      quantity: quantitySold,
      warehouseId,
      referenceId,
      referenceType,
      performedBy,
    });
    deducted.push(movement);
    warnings.push(`Producto ${catalogItemId} vendido sin receta — descuento directo`);
    logger.warn({ tag: 'RECIPE_STOCK', catalogItemId }, 'Producto vendido sin receta');
    return { deducted, warnings, blocked: false };
  }

  const saleMovement = await recordMovement(req, userId, {
    catalogItemId,
    movementType: 'sale',
    quantity: quantitySold,
    warehouseId,
    referenceId,
    referenceType,
    performedBy,
    notes: `Venta con receta: ${recipe.name}`,
    recipeId: recipe._id,
  });
  deducted.push(saleMovement);

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
        notes: `Consumo por receta "${recipe.name}" (x${quantitySold})`,
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

export async function deductOrderByRecipe(req, userId, {
  orderId,
  orderType,
  items,
  warehouseId = '',
  performedBy = '',
}) {
  const alreadyDeducted = await checkIdempotency(req, userId, orderId, items[0]?.catalogItemId, 'sale');
  if (alreadyDeducted) {
    logger.info({ tag: 'RECIPE_STOCK', orderId }, 'Descuento ya realizado, omitiendo (idempotencia)');
    return { deducted: [], warnings: ['Descuento ya realizado previamente'], blocked: false };
  }

  const allDeducted = [];
  const allWarnings = [];

  for (const item of items) {
    if (!item.catalogItemId) continue;
    const result = await deductByRecipe(req, userId, {
      catalogItemId: item.catalogItemId,
      quantitySold: item.quantity || 1,
      warehouseId,
      referenceId: orderId,
      referenceType: orderType,
      performedBy,
    });
    allDeducted.push(...result.deducted);
    allWarnings.push(...result.warnings);
  }

  return { deducted: allDeducted, warnings: allWarnings, blocked: false };
}
