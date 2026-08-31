import type { CatalogItem, StockCategory } from './deliveryApi';
import {
  normalizeStoreIngredientUnit,
  type StoreIngredient,
} from './catalogCustomization';
import {
  isDrinkCatalogProduct,
  isDessertCatalogProduct,
  resolveVertialDefaultRetailCost,
} from './vertialDefaultCosts.ts';

/** Factores a unidad base (g / ml) para convertir coste de receta. */
const UNIT_BASE: Record<string, { family: 'mass' | 'vol'; toBase: number }> = {
  g: { family: 'mass', toBase: 1 },
  kg: { family: 'mass', toBase: 1000 },
  ml: { family: 'vol', toBase: 1 },
  l: { family: 'vol', toBase: 1000 },
};

/**
 * Convierte cantidad entre g↔kg o ml↔l. Misma unidad → qty.
 * Familias incompatibles (p. ej. ud vs g) → null.
 */
export function convertQuantityBetweenUnits(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 0) return null;
  const from = normalizeStoreIngredientUnit(fromUnit, 'ud');
  const to = normalizeStoreIngredientUnit(toUnit, 'ud');
  if (from === to) return qty;
  const a = UNIT_BASE[from];
  const b = UNIT_BASE[to];
  if (!a || !b || a.family !== b.family) return null;
  return (qty * a.toBase) / b.toBase;
}

/**
 * Unidad del coste en ficha. Si no hay unidad (o es ud) y la línea va en g/kg o ml/l,
 * se asume €/kg o €/l — convención Vertial de costes a granel.
 */
export function resolveIngredientCostUnit(
  ingredientUnit: string | undefined,
  recipeLineUnit?: string,
): string {
  const stored = normalizeStoreIngredientUnit(ingredientUnit, '');
  if (stored === 'g' || stored === 'kg' || stored === 'ml' || stored === 'l') return stored;
  const line = normalizeStoreIngredientUnit(recipeLineUnit, 'ud');
  if (line === 'g' || line === 'kg') return 'kg';
  if (line === 'ml' || line === 'l') return 'l';
  return stored || 'ud';
}

/** Cantidad de la línea de receta expresada en la unidad del coste del ingrediente. */
export function quantityInIngredientCostUnit(
  quantity: number,
  lineUnit: string,
  ingredientUnit?: string,
): number {
  const costUnit = resolveIngredientCostUnit(ingredientUnit, lineUnit);
  const converted = convertQuantityBetweenUnits(quantity, lineUnit, costUnit);
  return converted != null ? converted : Number(quantity) || 0;
}

/** Coste de una línea: (cantidad convertida a unidad de ficha) × coste unitario. */
export function calculateRecipeLineCost(
  quantity: number,
  lineUnit: string,
  unitCost: number,
  ingredientUnit?: string,
): number {
  const qty = quantityInIngredientCostUnit(quantity, lineUnit, ingredientUnit);
  return Math.round(qty * (Number(unitCost) || 0) * 100) / 100;
}

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

export type IngredientUnitCostSource = 'purchase' | 'ficha' | 'zero';

export type IngredientUnitCostResolution = {
  effective: number;
  fromFicha: number;
  fromPurchase: number;
  source: IngredientUnitCostSource;
};

export type RecipeCostOptions = {
  mermaPct?: number;
  /** Artículos de almacén indexados por customFields.storeIngredientId */
  stockByStoreIngredientId?: Map<
    string,
    Pick<CatalogItem, 'costPrice' | 'customFields'> & { lastPurchasePrice?: number }
  >;
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

/** Merma % del plato (0–100). Viene del Excel o del editor de Escandallo. */
export function normalizeMermaPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.max(0, n));
}

export function readProductMermaPct(item: Pick<CatalogItem, 'customFields'>): number {
  return normalizeMermaPct(item.customFields?.mermaPct);
}

export function applyMermaToCost(baseCost: number, mermaPct: number): number {
  const base = Number(baseCost) || 0;
  const m = normalizeMermaPct(mermaPct);
  if (!(base > 0) || m <= 0) return Math.round(base * 100) / 100;
  return Math.round(base * (1 + m / 100) * 100) / 100;
}

/** Líneas de comida (excluye envases para food cost / margen). */
export function foodRecipeLines(lines: ProductRecipeLine[]): ProductRecipeLine[] {
  return lines.filter((line) => line.stockCategory !== 'packaging');
}

/** Envases vinculados al producto (descuenta stock; no entran en food cost). */
export function packagingRecipeLines(lines: ProductRecipeLine[]): ProductRecipeLine[] {
  return lines.filter((line) => line.stockCategory === 'packaging');
}

/**
 * Sustituye solo comida; conserva envases previos si el patch no trae packaging.
 * (Escandallo edita ingredientes y no debe borrar cajas/bolsas del producto.)
 */
export function replaceFoodRecipeLinesKeepingPackaging(
  previous: ProductRecipeLine[],
  nextFood: ProductRecipeLine[],
): ProductRecipeLine[] {
  const incoming = Array.isArray(nextFood) ? nextFood : [];
  if (incoming.some((line) => line.stockCategory === 'packaging')) {
    return normalizeProductRecipeLines(incoming);
  }
  return normalizeProductRecipeLines([
    ...foodRecipeLines(incoming),
    ...packagingRecipeLines(previous),
  ]);
}

/**
 * Coste de ficha para escandallo: solo el `baseCost` guardado.
 * No inventa precios Vertial: si no hay coste en ficha → 0 (el usuario lo define en Ingredientes).
 */
export function resolveStoreIngredientBaseCost(
  ing: Pick<StoreIngredient, 'baseCost' | 'name' | 'brandIds'> & { role?: string },
  _brands?: Array<{ _id: string; deliveryLineKind?: string }>,
): number {
  const stored = Number(ing.baseCost);
  if (Number.isFinite(stored) && stored >= 0) return Math.round(stored * 100) / 100;
  return 0;
}

/** Coste unitario efectivo: última compra proveedor si existe; si no, ficha. */
export function resolveIngredientUnitCost(
  ing: Pick<StoreIngredient, 'baseCost' | 'name' | 'brandIds'> & { role?: string },
  stockItem?: (Pick<CatalogItem, 'costPrice'> & { lastPurchasePrice?: number }) | null,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
): IngredientUnitCostResolution {
  const fromFicha = resolveStoreIngredientBaseCost(ing, brands);
  const fromPurchase = Number(stockItem?.lastPurchasePrice) || 0;
  if (fromPurchase > 0) {
    return {
      effective: Math.round(fromPurchase * 100) / 100,
      fromFicha,
      fromPurchase: Math.round(fromPurchase * 100) / 100,
      source: 'purchase',
    };
  }
  if (fromFicha > 0) {
    return { effective: fromFicha, fromFicha, fromPurchase: 0, source: 'ficha' };
  }
  return { effective: 0, fromFicha: 0, fromPurchase: 0, source: 'zero' };
}

export function storeIngredientsById(list: StoreIngredient[]): Map<string, StoreIngredient> {
  return new Map(list.map((ing) => [ing.id, ing]));
}

export function stockItemsByStoreIngredientId(
  stockItems: Array<CatalogItem | (CatalogItem & { lastPurchasePrice?: number })>,
): Map<string, CatalogItem & { lastPurchasePrice?: number }> {
  const map = new Map<string, CatalogItem & { lastPurchasePrice?: number }>();
  for (const item of stockItems) {
    if (!item || item.deletedAt || item.active === false) continue;
    const sid = String(item.customFields?.storeIngredientId || '').trim();
    if (!sid || map.has(sid)) continue;
    map.set(sid, item as CatalogItem & { lastPurchasePrice?: number });
  }
  return map;
}

export function calculateRecipeTotalCost(
  lines: ProductRecipeLine[],
  ingredientsById: Map<string, StoreIngredient>,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
  inventoryCostByCatalogId?: Map<string, number>,
  options?: RecipeCostOptions,
): number {
  let total = 0;
  for (const line of lines) {
    let unitCost = 0;
    let ingredientUnit: string | undefined;
    if (line.storeIngredientId) {
      const ing = ingredientsById.get(line.storeIngredientId);
      if (ing) {
        const stock = options?.stockByStoreIngredientId?.get(line.storeIngredientId);
        unitCost = resolveIngredientUnitCost(ing, stock, brands).effective;
        ingredientUnit = ing.unit;
      }
    } else if (line.catalogItemId && inventoryCostByCatalogId) {
      unitCost = inventoryCostByCatalogId.get(line.catalogItemId) ?? 0;
    }
    total += calculateRecipeLineCost(
      Number(line.quantity) || 0,
      line.unit || 'ud',
      unitCost,
      ingredientUnit,
    );
  }
  const rounded = Math.round(total * 100) / 100;
  return applyMermaToCost(rounded, options?.mermaPct ?? 0);
}

export function productCostingStatus(
  item: Pick<CatalogItem, 'customFields' | 'name' | 'category' | 'stockCategory'>,
): ProductCostingStatus {
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
  inventoryCostByCatalogId?: Map<string, number>,
  options?: RecipeCostOptions,
): number {
  const type = readProductCostingType(item);
  const storedCost = Number(item.costPrice) || 0;
  const mermaPct = options?.mermaPct ?? readProductMermaPct(item);
  const costOpts: RecipeCostOptions = {
    ...options,
    mermaPct,
  };

  if (type === 'fixed') return storedCost;
  if (type === 'recipe') {
    const lines = foodRecipeLines(readProductRecipeLines(item));
    return calculateRecipeTotalCost(
      lines.length > 0 ? lines : readProductRecipeLines(item),
      ingredientsById,
      brands,
      inventoryCostByCatalogId,
      costOpts,
    );
  }
  if (isDrinkCatalogProduct(item) || isDessertCatalogProduct(item)) {
    return resolveVertialDefaultRetailCost(item);
  }
  return storedCost;
}

export function foodCostPercent(unitCost: number, salePrice: number): number | null {
  if (!(salePrice > 0) || !(unitCost >= 0)) return null;
  return (unitCost / salePrice) * 100;
}

export function marginPercent(unitCost: number, salePrice: number): number | null {
  if (!(salePrice > 0) || !(unitCost >= 0)) return null;
  return ((salePrice - unitCost) / salePrice) * 100;
}

export function formatEscandalloFoodCost(unitCost: number, salePrice: number): string {
  const fc = foodCostPercent(unitCost, salePrice);
  if (fc == null) return '—';
  if (fc > 999) return '>999%';
  return `${fc.toFixed(1)}%`;
}

export function formatEscandalloMargin(unitCost: number, salePrice: number): string {
  const margin = marginPercent(unitCost, salePrice);
  if (margin == null) return '—';
  return `${margin.toFixed(1)}%`;
}

export function escandalloMarginTone(
  unitCost: number,
  salePrice: number,
): 'negative' | 'warn' | 'ok' {
  const margin = marginPercent(unitCost, salePrice);
  if (margin == null) return 'ok';
  if (margin < 0) return 'negative';
  if (margin < 15) return 'warn';
  return 'ok';
}

export function withProductCosting(
  item: CatalogItem,
  patch: {
    costingType: ProductCostingType | null;
    recipeLines?: ProductRecipeLine[];
    fixedCost?: number;
    /** Merma % del plato. `null` borra; `undefined` deja la actual. */
    mermaPct?: number | null;
  },
  ingredientsById: Map<string, StoreIngredient>,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
  inventoryCostByCatalogId?: Map<string, number>,
  options?: RecipeCostOptions,
): CatalogItem {
  const customFields = { ...(item.customFields || {}) };

  if (patch.costingType === null) {
    delete customFields.costingType;
    delete customFields.costingRecipe;
  } else if (patch.costingType === 'fixed') {
    customFields.costingType = 'fixed';
    // Coste fijo no usa ingredientes, pero los envases del producto deben seguir descontando.
    const packOnly = packagingRecipeLines(readProductRecipeLines(item));
    if (packOnly.length > 0) customFields.costingRecipe = packOnly;
    else delete customFields.costingRecipe;
  } else {
    customFields.costingType = 'recipe';
    customFields.costingRecipe = replaceFoodRecipeLinesKeepingPackaging(
      readProductRecipeLines(item),
      patch.recipeLines ?? [],
    );
  }

  if (patch.mermaPct === null) {
    delete customFields.mermaPct;
  } else if (patch.mermaPct !== undefined) {
    const m = normalizeMermaPct(patch.mermaPct);
    if (m > 0) customFields.mermaPct = m;
    else delete customFields.mermaPct;
  }

  const mermaPct =
    patch.mermaPct === null
      ? 0
      : patch.mermaPct !== undefined
        ? normalizeMermaPct(patch.mermaPct)
        : readProductMermaPct({ customFields });

  const costOpts: RecipeCostOptions = {
    ...options,
    mermaPct: patch.costingType === 'recipe' ? mermaPct : 0,
  };

  let costPrice = Number(item.costPrice) || 0;
  if (patch.costingType === 'fixed') {
    costPrice = Math.max(0, Number(patch.fixedCost) || 0);
  } else if (patch.costingType === 'recipe') {
    const lines = patch.recipeLines ?? [];
    const food = foodRecipeLines(lines);
    costPrice = calculateRecipeTotalCost(
      food.length > 0 ? food : lines,
      ingredientsById,
      brands,
      inventoryCostByCatalogId,
      costOpts,
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
