import type { CatalogItem } from './deliveryApi';
import {
  createRecipeRequest,
  listRecipesRequest,
  updateRecipeRequest,
  type Recipe,
} from './recipeApi';
import { filterStockInventoryItems } from './stockInventoryScope';
import {
  buildRecipeIngredientsFromCostingItem,
  recipeIngredientsNeedUpdate,
} from './recipeSyncLogic';

export type RecipeSyncResult = {
  created: number;
  updated: number;
  skipped: number;
};

export { buildRecipeIngredientsFromCostingItem } from './recipeSyncLogic';

function indexRecipesByProduct(recipes: Recipe[]): Map<string, Recipe> {
  const map = new Map<string, Recipe>();
  for (const recipe of recipes) {
    const key = String(recipe.catalogItemId || '').trim();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || (recipe.active && !prev.active)) {
      map.set(key, recipe);
    }
  }
  return map;
}

export async function syncRecipesFromCostingCatalog(
  userId: string,
  catalogItems: CatalogItem[],
  inventoryItems?: CatalogItem[],
  ingredientsById?: Map<string, import('./catalogCustomization').StoreIngredient>,
): Promise<RecipeSyncResult> {
  const uid = String(userId || '').trim();
  if (!uid) return { created: 0, updated: 0, skipped: 0 };

  const inventory = inventoryItems ?? [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  let recipesByProduct = new Map<string, Recipe>();
  try {
    recipesByProduct = indexRecipesByProduct(await listRecipesRequest(uid));
  } catch {
    /* sin recetas previas */
  }

  for (const item of catalogItems) {
    if (item.module === 'stock') continue;
    if (item.active === false || item.deletedAt) continue;

    const ingredients = buildRecipeIngredientsFromCostingItem(item, inventory, ingredientsById);
    if (ingredients.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      const active = recipesByProduct.get(item._id);

      if (!active) {
        const createdRecipe = await createRecipeRequest(uid, {
          name: `Receta ${item.name}`,
          catalogItemId: item._id,
          catalogItemName: item.name,
          category: item.category || '',
          portions: 1,
          active: true,
          ingredients,
          tags: ['vertial-auto'],
        });
        recipesByProduct.set(item._id, createdRecipe);
        created += 1;
        continue;
      }

      if (!recipeIngredientsNeedUpdate(active.ingredients, ingredients)) {
        skipped += 1;
        continue;
      }

      const updatedRecipe = await updateRecipeRequest(uid, {
        ...active,
        ingredients,
        tags: [...new Set([...(active.tags || []), 'vertial-auto'])],
      });
      recipesByProduct.set(item._id, updatedRecipe);
      updated += 1;
    } catch {
      skipped += 1;
    }
  }

  return { created, updated, skipped };
}

/** Sync de un solo producto tras guardar escandallo en UI. */
export async function syncRecipeForCostingProduct(
  userId: string,
  product: CatalogItem,
  inventoryItems: CatalogItem[] = [],
  ingredientsById?: Map<string, import('./catalogCustomization').StoreIngredient>,
): Promise<RecipeSyncResult> {
  return syncRecipesFromCostingCatalog(userId, [product], inventoryItems, ingredientsById);
}

export function filterCostingCatalogItems(catalog: CatalogItem[]): CatalogItem[] {
  return catalog.filter(
    (item) =>
      item.active !== false &&
      !item.deletedAt &&
      item.module !== 'stock' &&
      (item.itemType === 'product' || item.itemType === 'combo' || !item.itemType),
  );
}

export function pickInventoryForRecipeSync(catalog: CatalogItem[]): CatalogItem[] {
  return filterStockInventoryItems(catalog);
}
