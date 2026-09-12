/**
 * Receta virtual desde escandallo del catálogo (customFields.costingRecipe).
 * Usada al descontar stock si aún no hay documento recipe en CouchDB.
 */
import { getCatalogDbName, ensureDatabase, getDocument, getAllDocuments } from './couchdb.js';
import { filterStockInventoryItems } from './stockInventoryScope.js';
import {
  convertQuantityBetweenUnits,
  normalizeStockUnit,
  quantityInStockUnit,
} from '../shared/stock/unitConversion.js';

function readProductCostingType(item) {
  const t = String(item?.customFields?.costingType || '').trim();
  if (t === 'recipe' || t === 'fixed') return t;
  const lines = item?.customFields?.costingRecipe;
  if (Array.isArray(lines) && lines.length > 0) return 'recipe';
  return 'none';
}

function normalizeProductRecipeLines(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const storeIngredientId = String(entry.storeIngredientId || '').trim();
    const catalogItemId = String(entry.catalogItemId || '').trim();
    const name = String(entry.name || '').trim();
    const quantity = Number(entry.quantity);
    if ((!storeIngredientId && !catalogItemId) || !name || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    out.push({
      storeIngredientId: storeIngredientId || undefined,
      catalogItemId: catalogItemId || undefined,
      name,
      quantity,
      unit: String(entry.unit || 'ud').trim() || 'ud',
      stockCategory: entry.stockCategory || 'ingredient',
    });
  }
  return out;
}

function buildInventoryLookupMaps(items) {
  const byStoreIngredientId = new Map();
  for (const item of items) {
    const ingId = String(item.customFields?.storeIngredientId || '').trim();
    if (ingId) byStoreIngredientId.set(ingId, item);
  }
  return { byStoreIngredientId };
}

function readProductMermaPct(item) {
  const n = Number(item?.customFields?.mermaPct);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.max(0, n));
}

function stockUnitCost(stock) {
  if (!stock) return 0;
  const purchase = Number(stock.lastPurchasePrice) || 0;
  if (purchase > 0) return purchase;
  return Number(stock.costPrice) || 0;
}

/** Coste línea: qty convertida a unidad de coste (€/kg o €/l si ficha sin unidad). */
function lineCostWithUnitConversion(quantity, lineUnit, costPerUnit, stockUnit) {
  const from = normalizeStockUnit(lineUnit, 'ud');
  let costUnit = normalizeStockUnit(stockUnit, '');
  if (costUnit !== 'mg' && costUnit !== 'g' && costUnit !== 'kg' && costUnit !== 'ml' && costUnit !== 'l') {
    if (from === 'mg' || from === 'g' || from === 'kg') costUnit = 'kg';
    else if (from === 'ml' || from === 'l') costUnit = 'l';
    else costUnit = from || 'ud';
  }
  const qtyInCost = convertQuantityBetweenUnits(quantity, from, costUnit);
  const qty = qtyInCost != null ? qtyInCost : Number(quantity) || 0;
  return Math.round(qty * (Number(costPerUnit) || 0) * 100) / 100;
}

function lineToRecipeIngredient(line, inventoryById, storeIngToStock, wastePercent) {
  let catalogItemId = String(line.catalogItemId || '').trim();
  let catalogItemName = line.name;
  let costPerUnit = 0;
  let stockCategory = line.stockCategory || 'ingredient';
  let stock = null;

  if (!catalogItemId && line.storeIngredientId) {
    stock = storeIngToStock.get(line.storeIngredientId);
    if (!stock) return null;
    catalogItemId = stock._id;
    catalogItemName = stock.name;
    costPerUnit = stockUnitCost(stock);
    stockCategory = stock.stockCategory || stockCategory;
  } else if (catalogItemId) {
    stock = inventoryById.get(catalogItemId);
    if (stock) {
      catalogItemName = stock.name;
      costPerUnit = stockUnitCost(stock);
      stockCategory = stock.stockCategory || stockCategory;
    }
  }

  if (!catalogItemId) return null;
  const quantity = Number(line.quantity) || 0;
  if (quantity <= 0) return null;

  const lineUnit = line.unit || 'ud';
  const stockUnit = normalizeStockUnit(stock?.unit || lineUnit, lineUnit);
  // Seis decimales para no perder consumos expresados en mg al convertirlos a kg.
  const qtyForStock = Math.round(quantityInStockUnit(quantity, lineUnit, stockUnit) * 1_000_000) / 1_000_000;
  const totalCost = lineCostWithUnitConversion(quantity, lineUnit, costPerUnit, stock?.unit);
  const isPackaging = stockCategory === 'packaging';
  const waste = isPackaging ? 0 : Math.min(100, Math.max(0, Number(wastePercent) || 0));
  return {
    catalogItemId,
    catalogItemName,
    quantity: qtyForStock,
    unit: stockUnit,
    wastePercent: waste,
    // Merma solo en coste UI; stock descuenta qty de línea convertida.
    netQuantity: qtyForStock,
    costPerUnit,
    totalCost,
    stockCategory,
    optional: isPackaging,
    substitutes: [],
  };
}

export function buildRecipeIngredientsFromCostingItem(item, inventoryItems) {
  if (readProductCostingType(item) !== 'recipe') return [];
  const lines = normalizeProductRecipeLines(item?.customFields?.costingRecipe);
  if (lines.length === 0) return [];

  const { byStoreIngredientId } = buildInventoryLookupMaps(inventoryItems);
  const inventoryById = new Map(inventoryItems.map((row) => [row._id, row]));
  const wastePercent = readProductMermaPct(item);
  const out = [];

  for (const line of lines) {
    const ing = lineToRecipeIngredient(line, inventoryById, byStoreIngredientId, wastePercent);
    if (ing) out.push(ing);
  }
  return out;
}

/**
 * @param {object} req
 * @param {string} userId
 * @param {string} catalogItemId
 * @param {object[]|null} inventoryItems preloaded stock rows (optional)
 */
export async function resolveVirtualRecipeFromCatalogCosting(
  req,
  userId,
  catalogItemId,
  inventoryItems = null,
) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const catItem = await getDocument(req, db, catalogItemId);
  if (!catItem || catItem.user_id !== userId) return null;

  let inventory = inventoryItems;
  if (!inventory) {
    const docs = await getAllDocuments(req, db);
    inventory = filterStockInventoryItems(
      docs.filter((d) => d?.type === 'catalog_item' && d?.user_id === userId && !d?.deletedAt),
    );
  }

  const ingredients = buildRecipeIngredientsFromCostingItem(catItem, inventory);
  if (ingredients.length === 0) return null;

  return {
    _id: `virtual-costing:${catalogItemId}`,
    name: `Receta ${catItem.name}`,
    catalogItemId,
    catalogItemName: catItem.name,
    category: catItem.category || '',
    portions: 1,
    active: true,
    ingredients,
    tags: ['vertial-costing-fallback'],
  };
}
