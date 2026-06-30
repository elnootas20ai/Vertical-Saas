import type { CatalogItem, StockCategory } from './deliveryApi';
import type { ProductRecipeLine } from './catalogCosting';
import { readProductCostingType, readProductRecipeLines } from './catalogCosting';
import { buildInventoryLookupMaps } from './inventorySyncLogic';

export type RecipeIngredientDraft = {
  catalogItemId: string;
  catalogItemName: string;
  quantity: number;
  unit: string;
  wastePercent: number;
  netQuantity: number;
  costPerUnit: number;
  totalCost: number;
  stockCategory: StockCategory;
  optional: boolean;
  substitutes: [];
};

function lineToRecipeIngredient(
  line: ProductRecipeLine,
  inventoryById: Map<string, CatalogItem>,
  storeIngToStock: Map<string, CatalogItem>,
): RecipeIngredientDraft | null {
  let catalogItemId = String(line.catalogItemId || '').trim();
  let catalogItemName = line.name;
  let costPerUnit = 0;
  let stockCategory: StockCategory = line.stockCategory || 'ingredient';

  if (!catalogItemId && line.storeIngredientId) {
    const stock = storeIngToStock.get(line.storeIngredientId);
    if (!stock) return null;
    catalogItemId = stock._id;
    catalogItemName = stock.name;
    costPerUnit = Number(stock.costPrice) || 0;
    stockCategory = stock.stockCategory || stockCategory;
  } else if (catalogItemId) {
    const stock = inventoryById.get(catalogItemId);
    if (stock) {
      catalogItemName = stock.name;
      costPerUnit = Number(stock.costPrice) || 0;
      stockCategory = stock.stockCategory || stockCategory;
    }
  }

  if (!catalogItemId) return null;

  const quantity = Number(line.quantity) || 0;
  if (quantity <= 0) return null;

  const totalCost = Math.round(quantity * costPerUnit * 100) / 100;
  return {
    catalogItemId,
    catalogItemName,
    quantity,
    unit: line.unit || 'ud',
    wastePercent: 0,
    netQuantity: quantity,
    costPerUnit,
    totalCost,
    stockCategory,
    optional: stockCategory === 'packaging',
    substitutes: [],
  };
}

export function buildRecipeIngredientsFromCostingItem(
  item: CatalogItem,
  inventoryItems: CatalogItem[],
): RecipeIngredientDraft[] {
  if (readProductCostingType(item) !== 'recipe') return [];
  const lines = readProductRecipeLines(item);
  if (lines.length === 0) return [];

  const maps = buildInventoryLookupMaps(inventoryItems);
  const inventoryById = new Map(inventoryItems.map((row) => [row._id, row]));
  const out: RecipeIngredientDraft[] = [];

  for (const line of lines) {
    const ing = lineToRecipeIngredient(line, inventoryById, maps.byStoreIngredientId);
    if (ing) out.push(ing);
  }
  return out;
}

export function recipeIngredientsNeedUpdate(
  existing: Array<{ catalogItemId: string; quantity: number; unit: string }>,
  next: RecipeIngredientDraft[],
): boolean {
  if (existing.length !== next.length) return true;
  for (let i = 0; i < next.length; i += 1) {
    const a = existing[i];
    const b = next[i];
    if (a.catalogItemId !== b.catalogItemId) return true;
    if (Math.abs(a.quantity - b.quantity) > 1e-6) return true;
    if (a.unit !== b.unit) return true;
  }
  return false;
}
