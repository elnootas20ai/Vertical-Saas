import type { CatalogItem, StockCategory } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import {
  effectiveStoreIngredientBaseCost,
  isDrinkCatalogProduct,
  isDessertCatalogProduct,
  resolveVertialDefaultRetailCost,
} from './vertialDefaultCosts.ts';

export type ProductCostingType = 'fixed' | 'recipe';

export type ProductCostingStatus = 'fixed' | 'recipe' | 'none';

export type ProductRecipeLine = {
  storeIngredientId?: string;
  catalogItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  stockCategory?: StockCategory;
};

export function normalizeProductRecipeLines(raw: unknown): ProductRecipeLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductRecipeLine[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const storeIngredientId = String(rec.storeIngredientId || '').trim();
    const catalogItemId = String(rec.catalogItemId || '').trim();
    const name = String(rec.name || '').trim();
    const quantity = Number(rec.quantity);
    if ((!storeIngredientId && !catalogItemId) || !name || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    const unit = String(rec.unit || 'ud').trim() || 'ud';
    const stockCategory = rec.stockCategory as StockCategory | undefined;
    out.push({
      ...(storeIngredientId ? { storeIngredientId } : {}),
      ...(catalogItemId ? { catalogItemId } : {}),
      name,
      quantity,
      unit,
      ...(stockCategory ? { stockCategory } : {}),
    });
  }
  return out;
}

export function readProductCostingType(
  item: Pick<CatalogItem, 'customFields'>,
): ProductCostingType | null {
  const t = item.customFields?.costingType;
  return t === 'fixed' || t === 'recipe' ? t : null;
}

export function readProductRecipeLines(item: Pick<CatalogItem, 'customFields'>): ProductRecipeLine[] {
  return normalizeProductRecipeLines(item.customFields?.costingRecipe);
}

export function resolveStoreIngredientBaseCost(
  ing: Pick<StoreIngredient, 'baseCost' | 'name' | 'brandIds'>,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
): number {
  return effectiveStoreIngredientBaseCost(ing, brands);
}

export function storeIngredientsById(list: StoreIngredient[]): Map<string, StoreIngredient> {
  return new Map(list.map((ing) => [ing.id, ing]));
}

export function calculateRecipeTotalCost(
  lines: ProductRecipeLine[],
  ingredientsById: Map<string, StoreIngredient>,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
  inventoryCostByCatalogId?: Map<string, number>,
): number {
  let total = 0;
  for (const line of lines) {
    let unitCost = 0;
    if (line.storeIngredientId) {
      const ing = ingredientsById.get(line.storeIngredientId);
      unitCost = ing ? resolveStoreIngredientBaseCost(ing, brands) : 0;
    } else if (line.catalogItemId && inventoryCostByCatalogId) {
      unitCost = inventoryCostByCatalogId.get(line.catalogItemId) ?? 0;
    }
    total += (Number(line.quantity) || 0) * unitCost;
  }
  return Math.round(total * 100) / 100;
}

export function productCostingStatus(item: Pick<CatalogItem, 'customFields' | 'name' | 'category' | 'stockCategory'>): ProductCostingStatus {
  const type = readProductCostingType(item);
  if (type === 'fixed') return 'fixed';
  if (type === 'recipe') {
    return readProductRecipeLines(item).length > 0 ? 'recipe' : 'none';
  }
  if (isDrinkCatalogProduct(item) || isDessertCatalogProduct(item)) return 'fixed';
  return 'none';
}

export function resolveProductUnitCost(
  item: CatalogItem,
  ingredientsById: Map<string, StoreIngredient>,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
): number {
  const type = readProductCostingType(item);
  if (type === 'fixed') return Number(item.costPrice) || 0;
  if (type === 'recipe') {
    return calculateRecipeTotalCost(readProductRecipeLines(item), ingredientsById, brands);
  }
  if (isDrinkCatalogProduct(item) || isDessertCatalogProduct(item)) {
    return resolveVertialDefaultRetailCost(item);
  }
  return Number(item.costPrice) || 0;
}

export function foodCostPercent(unitCost: number, salePrice: number): number | null {
  if (!(salePrice > 0)) return null;
  return (unitCost / salePrice) * 100;
}

export function marginPercent(unitCost: number, salePrice: number): number | null {
  if (!(salePrice > 0)) return null;
  return ((salePrice - unitCost) / salePrice) * 100;
}

export function withProductCosting(
  item: CatalogItem,
  patch: {
    costingType: ProductCostingType | null;
    recipeLines?: ProductRecipeLine[];
    fixedCost?: number;
  },
  ingredientsById: Map<string, StoreIngredient>,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
  inventoryCostByCatalogId?: Map<string, number>,
): CatalogItem {
  const customFields = { ...(item.customFields || {}) };

  if (patch.costingType === null) {
    delete customFields.costingType;
    delete customFields.costingRecipe;
  } else if (patch.costingType === 'fixed') {
    customFields.costingType = 'fixed';
    delete customFields.costingRecipe;
  } else {
    customFields.costingType = 'recipe';
    customFields.costingRecipe = patch.recipeLines ?? [];
  }

  let costPrice = Number(item.costPrice) || 0;
  if (patch.costingType === 'fixed') {
    costPrice = Math.max(0, Number(patch.fixedCost) || 0);
  } else if (patch.costingType === 'recipe') {
    costPrice = calculateRecipeTotalCost(
      patch.recipeLines ?? [],
      ingredientsById,
      brands,
      inventoryCostByCatalogId,
    );
  }

  return {
    ...item,
    customFields,
    costPrice: Math.round(costPrice * 100) / 100,
  };
}

export function isCatalogCostingProduct(item: CatalogItem): boolean {
  if (item.module !== 'catalog') return false;
  return item.itemType === 'product' || item.itemType === 'combo';
}
