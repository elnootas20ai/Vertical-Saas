import type { CatalogItem } from './deliveryApi';
import { listCatalogItemsRequest } from './deliveryApi';
import { filterStockInventoryItems } from './stockInventoryScope';
import {
  applyVertialAutoCostingBatch,
  prepareStoreIngredientsForImportCosting,
  summarizeAutoCostingResults,
} from './catalogImportCosting';
import { syncInventoryCatalogFromSources } from './inventorySync';
import {
  filterCostingCatalogItems,
  pickInventoryForRecipeSync,
  syncRecipesFromCostingCatalog,
} from './recipeSyncFromCosting';
import type { StoreIngredient } from './catalogCustomization';

export type StockAutomationPipelineResult = {
  inventory: { created: number; updated: number; skipped: number; candidates: number };
  costing: { updated: number; recipe: number; fixed: number; skipped: number; failed: number };
  recipes: { created: number; updated: number; skipped: number };
};

export type StockAutomationPipelineOptions = {
  businessType: string;
  businessId?: string;
  storeIngredients: StoreIngredient[];
  brands?: Array<{ _id: string; deliveryLineKind?: string }>;
  catalogItems?: CatalogItem[];
  costingTargets?: CatalogItem[];
  updateCatalogItem: (item: CatalogItem) => Promise<CatalogItem>;
  /** inventory = solo stock (rápido). full = escandallo + recetas CouchDB. */
  mode?: 'inventory' | 'full';
  /** Tras import: convierte coste fijo auto de pizza/burger en escandallo Vertial. */
  upgradeAutoFixedFood?: boolean;
  onAfterInventory?: () => void | Promise<void>;
};

const EMPTY_RESULT: StockAutomationPipelineResult = {
  inventory: { created: 0, updated: 0, skipped: 0, candidates: 0 },
  costing: { updated: 0, recipe: 0, fixed: 0, skipped: 0, failed: 0 },
  recipes: { created: 0, updated: 0, skipped: 0 },
};

/**
 * Pipeline Vertial Auto Stock (delivery):
 * inventario → [escandallo + recetas si mode=full]
 */
export async function runVertialStockAutomationPipeline(
  userId: string,
  options: StockAutomationPipelineOptions,
): Promise<StockAutomationPipelineResult> {
  const uid = String(userId || '').trim();
  if (!uid) return EMPTY_RESULT;

  const mode = options.mode ?? 'full';

  const fullCatalog =
    options.catalogItems ?? (await listCatalogItemsRequest(uid).catch(() => [] as CatalogItem[]));

  const inventory = await syncInventoryCatalogFromSources(uid, {
    businessType: options.businessType,
    businessId: options.businessId,
    storeIngredients: options.storeIngredients,
    catalogItems: fullCatalog,
    brands: options.brands,
  });

  if (options.onAfterInventory) {
    await options.onAfterInventory();
  }

  if (mode === 'inventory') {
    return { ...EMPTY_RESULT, inventory };
  }

  const refreshedCatalog = await listCatalogItemsRequest(uid).catch(() => fullCatalog);
  const inventoryItems = pickInventoryForRecipeSync(refreshedCatalog);
  const storeIngredients = prepareStoreIngredientsForImportCosting(
    options.storeIngredients,
    options.brands ?? [],
  );

  const targets = options.costingTargets?.length
    ? options.costingTargets
    : filterCostingCatalogItems(refreshedCatalog);

  const costingResults = applyVertialAutoCostingBatch(
    targets,
    refreshedCatalog,
    storeIngredients,
    options.brands ?? [],
    {
      inventoryItems,
      upgradeAutoFixedFood: options.upgradeAutoFixedFood,
    },
  );
  const costingSummary = summarizeAutoCostingResults(costingResults);

  let costingUpdated = 0;
  let costingFailed = 0;
  for (const result of costingResults) {
    if (result.mode === 'skipped') continue;
    try {
      await options.updateCatalogItem(result.item);
      costingUpdated += 1;
    } catch {
      costingFailed += 1;
    }
  }

  const catalogAfterCosting = await listCatalogItemsRequest(uid).catch(() => refreshedCatalog);
  const recipes = await syncRecipesFromCostingCatalog(
    uid,
    catalogAfterCosting,
    filterStockInventoryItems(catalogAfterCosting),
  );

  return {
    inventory,
    costing: { updated: costingUpdated, ...costingSummary, failed: costingFailed },
    recipes,
  };
}
