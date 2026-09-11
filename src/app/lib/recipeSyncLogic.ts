import type { CatalogItem, StockCategory } from './deliveryApi';
import type { ProductRecipeLine } from './catalogCosting';
import {
  calculateRecipeLineCost,
  convertQuantityBetweenUnits,
  readProductCostingType,
  readProductMermaPct,
  readProductRecipeLines,
  resolveIngredientUnitCost,
} from './catalogCosting';
import {
  normalizeStoreIngredientUnit,
  type StoreIngredient,
} from './catalogCustomization';
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
  ingredientsById: Map<string, StoreIngredient> | undefined,
  wastePercent: number,
): RecipeIngredientDraft | null {
  let catalogItemId = String(line.catalogItemId || '').trim();
  let catalogItemName = line.name;
  let costPerUnit = 0;
  let stockCategory: StockCategory = line.stockCategory || 'ingredient';
  let stock: (CatalogItem & { lastPurchasePrice?: number; unit?: string }) | undefined;

  if (!catalogItemId && line.storeIngredientId) {
    stock = storeIngToStock.get(line.storeIngredientId) as CatalogItem & {
      lastPurchasePrice?: number;
      unit?: string;
    };
    if (!stock) return null;
    catalogItemId = stock._id;
    catalogItemName = stock.name;
    stockCategory = stock.stockCategory || stockCategory;
  } else if (catalogItemId) {
    stock = inventoryById.get(catalogItemId) as CatalogItem & {
      lastPurchasePrice?: number;
      unit?: string;
    };
    if (stock) {
      catalogItemName = stock.name;
      stockCategory = stock.stockCategory || stockCategory;
    }
  }

  if (!catalogItemId) return null;

  const quantity = Number(line.quantity) || 0;
  if (quantity <= 0) return null;

  let ingredientUnit: string | undefined;
  if (line.storeIngredientId && ingredientsById) {
    const ing = ingredientsById.get(line.storeIngredientId);
    if (ing) {
      costPerUnit = resolveIngredientUnitCost(ing, stock, undefined).effective;
      ingredientUnit = ing.unit;
    }
  }
  if (!(costPerUnit > 0)) {
    costPerUnit = Number(stock?.lastPurchasePrice) || Number(stock?.costPrice) || 0;
  }

  const lineUnit = line.unit || 'ud';
  // Qty persistida en unidad del SKU de almacén (venta descuenta sin re-convertir).
  const stockUnit = normalizeStoreIngredientUnit(
    stock?.unit || ingredientUnit || lineUnit,
    lineUnit,
  );
  const convertedQty = convertQuantityBetweenUnits(quantity, lineUnit, stockUnit);
  const qtyForStock = Math.round((convertedQty != null ? convertedQty : quantity) * 10000) / 10000;
  const totalCost = calculateRecipeLineCost(quantity, lineUnit, costPerUnit, ingredientUnit);
  const isPackaging = stockCategory === 'packaging';
  const waste = isPackaging ? 0 : Math.min(100, Math.max(0, Number(wastePercent) || 0));
  // Merma solo afecta coste (×1+m/100 en escandallo); stock descuenta la qty de línea.
  const netQuantity = qtyForStock;
  return {
    catalogItemId,
    catalogItemName,
    quantity: qtyForStock,
    unit: stockUnit,
    wastePercent: waste,
    netQuantity,
    costPerUnit,
    totalCost,
    stockCategory,
    optional: isPackaging,
    substitutes: [],
  };
}

export function buildRecipeIngredientsFromCostingItem(
  item: CatalogItem,
  inventoryItems: CatalogItem[],
  ingredientsById?: Map<string, StoreIngredient>,
): RecipeIngredientDraft[] {
  if (readProductCostingType(item) !== 'recipe') return [];
  const lines = readProductRecipeLines(item);
  if (lines.length === 0) return [];

  const maps = buildInventoryLookupMaps(inventoryItems);
  const inventoryById = new Map(inventoryItems.map((row) => [row._id, row]));
  const wastePercent = readProductMermaPct(item);
  const out: RecipeIngredientDraft[] = [];

  for (const line of lines) {
    const ing = lineToRecipeIngredient(
      line,
      inventoryById,
      maps.byStoreIngredientId,
      ingredientsById,
      wastePercent,
    );
    if (ing) out.push(ing);
  }
  return out;
}

export function recipeIngredientsNeedUpdate(
  existing: Array<{ catalogItemId: string; quantity: number; unit: string; wastePercent?: number }>,
  next: RecipeIngredientDraft[],
): boolean {
  if (existing.length !== next.length) return true;
  for (let i = 0; i < next.length; i += 1) {
    const a = existing[i];
    const b = next[i];
    if (a.catalogItemId !== b.catalogItemId) return true;
    if (Math.abs(a.quantity - b.quantity) > 1e-6) return true;
    if (a.unit !== b.unit) return true;
    if (Math.abs(Number(a.wastePercent || 0) - Number(b.wastePercent || 0)) > 1e-6) return true;
  }
  return false;
}
