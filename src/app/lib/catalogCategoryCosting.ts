import type { CatalogItem } from './deliveryApi';
import {
  readProductCostingType,
  readProductRecipeLines,
  withProductCosting,
} from './catalogCosting.ts';
import {
  isDrinkCatalogProduct,
  isDessertCatalogProduct,
  resolveVertialDefaultRetailCost,
} from './vertialDefaultCosts.ts';

export type CategoryCostingKind = 'drinks' | 'desserts' | 'food' | 'mixed';

export type BulkCostApplyMode = 'unconfigured' | 'fixed_only' | 'all';

export type DrinkCostPreset = {
  id: string;
  label: string;
  cost: number;
};

export const DRINK_COST_PRESETS: DrinkCostPreset[] = [
  { id: 'cans', label: 'Latas / refrescos', cost: 0.65 },
  { id: 'water', label: 'Agua', cost: 0.22 },
  { id: 'beer', label: 'Cerveza', cost: 0.55 },
  { id: 'energy', label: 'Energéticas', cost: 0.85 },
  { id: 'juice', label: 'Zumos / té', cost: 0.6 },
];

export type CategoryCostingSummary = {
  category: string;
  products: CatalogItem[];
  total: number;
  /** Con coste guardado explícitamente (no solo referencia Vertial). */
  configured: number;
  unconfigured: number;
  fixedCount: number;
  recipeCount: number;
  kind: CategoryCostingKind;
  /** Mediana de referencia Vertial (bebidas/postres) o null si no aplica. */
  suggestedCost: number | null;
};

export function explicitProductCostingStatus(
  item: Pick<CatalogItem, 'customFields'>,
): 'fixed' | 'recipe' | 'none' {
  const type = readProductCostingType(item);
  if (type === 'fixed') return 'fixed';
  if (type === 'recipe') {
    return readProductRecipeLines(item).length > 0 ? 'recipe' : 'none';
  }
  return 'none';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return roundMoney(sorted[mid]);
  return roundMoney((sorted[mid - 1] + sorted[mid]) / 2);
}

export function detectCategoryCostingKind(products: CatalogItem[]): CategoryCostingKind {
  if (products.length === 0) return 'mixed';
  let drinks = 0;
  let desserts = 0;
  let food = 0;
  for (const product of products) {
    if (isDrinkCatalogProduct(product)) drinks += 1;
    else if (isDessertCatalogProduct(product)) desserts += 1;
    else food += 1;
  }
  const total = products.length;
  if (drinks / total >= 0.6) return 'drinks';
  if (desserts / total >= 0.6) return 'desserts';
  if (food / total >= 0.6) return 'food';
  return 'mixed';
}

export function suggestCategoryFixedCost(products: CatalogItem[]): number | null {
  const retailCosts: number[] = [];
  for (const product of products) {
    if (isDrinkCatalogProduct(product) || isDessertCatalogProduct(product)) {
      retailCosts.push(resolveVertialDefaultRetailCost(product));
    }
  }
  return median(retailCosts);
}

export function buildCategoryCostingSummaries(items: CatalogItem[]): CategoryCostingSummary[] {
  const byCategory = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const category = String(item.category || '').trim() || 'Sin categoría';
    const list = byCategory.get(category) || [];
    list.push(item);
    byCategory.set(category, list);
  }

  const summaries: CategoryCostingSummary[] = [];
  for (const [category, products] of byCategory) {
    let configured = 0;
    let fixedCount = 0;
    let recipeCount = 0;
    for (const product of products) {
      const status = explicitProductCostingStatus(product);
      if (status !== 'none') configured += 1;
      if (status === 'fixed') fixedCount += 1;
      if (status === 'recipe') recipeCount += 1;
    }
    summaries.push({
      category,
      products,
      total: products.length,
      configured,
      unconfigured: products.length - configured,
      fixedCount,
      recipeCount,
      kind: detectCategoryCostingKind(products),
      suggestedCost: suggestCategoryFixedCost(products),
    });
  }

  return summaries.sort((a, b) => a.category.localeCompare(b.category, 'es'));
}

export function filterProductsForBulkApply(
  products: CatalogItem[],
  mode: BulkCostApplyMode,
): CatalogItem[] {
  return products.filter((product) => {
    const status = explicitProductCostingStatus(product);
    if (mode === 'unconfigured') return status === 'none';
    if (mode === 'fixed_only') return status === 'none' || status === 'fixed';
    return true;
  });
}

export function applyFixedCostToProduct(item: CatalogItem, cost: number): CatalogItem {
  return withProductCosting(
    item,
    { costingType: 'fixed', fixedCost: Math.max(0, cost) },
    new Map(),
  );
}

export function categoryKindLabel(kind: CategoryCostingKind): string {
  if (kind === 'drinks') return 'Bebidas';
  if (kind === 'desserts') return 'Postres';
  if (kind === 'food') return 'Comida';
  return 'Mixta';
}
