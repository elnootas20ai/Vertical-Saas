/**
 * Reverse TPV → almacén: al quitar ingredientes de la lista maestra,
 * localizar y borrar los artículos de stock ligados (misma lógica de match que el sync).
 */
import type { CatalogItem } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import { deleteCatalogItemsRelentlessly } from './catalogBulkDelete';
import { foldIngredientKey } from './inventorySyncLogic';
import { isSupplierOrderStockItem } from './stockInventoryScope';

export function diffRemovedStoreIngredients(
  previous: StoreIngredient[],
  next: StoreIngredient[],
): StoreIngredient[] {
  const nextIds = new Set(
    (next || []).map((i) => String(i?.id || '').trim()).filter(Boolean),
  );
  return (previous || []).filter((ing) => {
    const id = String(ing?.id || '').trim();
    return Boolean(id) && !nextIds.has(id);
  });
}

/** Ids de almacén ligados a esos ingredientes TPV (storeIngredientId o nombre plegado). */
export function findWarehouseItemIdsForStoreIngredients(
  catalogItems: CatalogItem[],
  ingredients: Array<{ id?: string; name?: string }>,
): string[] {
  const idKeys = new Set<string>();
  const nameKeys = new Set<string>();
  for (const ing of ingredients || []) {
    const id = String(ing?.id || '').trim();
    const name = foldIngredientKey(ing?.name || '');
    if (id) idKeys.add(id);
    if (name) nameKeys.add(name);
  }
  if (idKeys.size === 0 && nameKeys.size === 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of catalogItems || []) {
    if (!item?._id || item.deletedAt) continue;
    // Solo almacén comprable — no platos de carta aunque tengan isStockItem.
    if (!isSupplierOrderStockItem(item)) continue;
    const storeIngId = String(item.customFields?.storeIngredientId || '').trim();
    const nameKey = foldIngredientKey(item.name || '');
    const match =
      (storeIngId && idKeys.has(storeIngId))
      || (nameKey && nameKeys.has(nameKey));
    if (!match || seen.has(item._id)) continue;
    seen.add(item._id);
    out.push(item._id);
  }
  return out;
}

export async function removeWarehouseForRemovedStoreIngredients(
  userId: string,
  removedIngredients: StoreIngredient[],
  catalogItems: CatalogItem[],
): Promise<number> {
  const ids = findWarehouseItemIdsForStoreIngredients(catalogItems, removedIngredients);
  if (ids.length === 0) return 0;
  const result = await deleteCatalogItemsRelentlessly(userId, ids, { maxRounds: 4 });
  return result.deleted;
}
