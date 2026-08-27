import type { CatalogItem, Supplier } from './deliveryApi';
import { updateCatalogItemRequest } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import { isStockInventoryItem } from './stockInventoryScope';

function foldName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Convierte ids del selector de proveedor (artículos de almacén o ids de ingrediente TPV)
 * en ids reales de artículos de stock del catálogo.
 */
export function resolveSupplierSelectedStockIds(
  selectedItemIds: string[],
  catalogItems: CatalogItem[],
  storeIngredients: StoreIngredient[] = [],
): string[] {
  const stockItems = catalogItems.filter(isStockInventoryItem);
  const stockIdSet = new Set(stockItems.map((i) => i._id));
  const byIngredientId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const item of stockItems) {
    const ingId = String(item.customFields?.storeIngredientId || '').trim();
    if (ingId) byIngredientId.set(ingId, item._id);
    byName.set(foldName(item.name), item._id);
  }
  const ingredientIds = new Set(storeIngredients.map((i) => i.id).filter(Boolean));
  const out = new Set<string>();
  for (const raw of selectedItemIds || []) {
    const id = String(raw || '').trim();
    if (!id) continue;
    if (stockIdSet.has(id)) {
      out.add(id);
      continue;
    }
    if (ingredientIds.has(id)) {
      const mapped = byIngredientId.get(id);
      if (mapped) out.add(mapped);
      continue;
    }
    const ing = storeIngredients.find((i) => i.id === id);
    if (ing) {
      const mapped = byName.get(foldName(ing.name));
      if (mapped) out.add(mapped);
    }
  }
  return [...out];
}

/**
 * Enlaza / desenlaza artículos de almacén con el proveedor y guarda el coste que cobra.
 */
export async function syncSupplierCatalogItemLinks(
  userId: string,
  supplier: Pick<Supplier, '_id' | 'name'>,
  selectedItemIds: string[],
  catalogItems: CatalogItem[],
  itemCosts: Record<string, number> = {},
  storeIngredients: StoreIngredient[] = [],
): Promise<CatalogItem[]> {
  const resolvedIds = resolveSupplierSelectedStockIds(selectedItemIds, catalogItems, storeIngredients);
  const resolvedCosts: Record<string, number> = {};
  for (const [rawId, cost] of Object.entries(itemCosts || {})) {
    const mapped = resolveSupplierSelectedStockIds([rawId], catalogItems, storeIngredients);
    if (mapped[0]) resolvedCosts[mapped[0]] = cost;
    else resolvedCosts[rawId] = cost;
  }
  const selected = new Set(resolvedIds);
  const changed: CatalogItem[] = [];
  for (const item of catalogItems) {
    if (!isStockInventoryItem(item)) continue;
    const want = selected.has(item._id);
    const had = item.supplierId === supplier._id;
    const rawCost = resolvedCosts[item._id] ?? itemCosts[item._id];
    const nextCost =
      rawCost != null && Number.isFinite(Number(rawCost)) && Number(rawCost) >= 0
        ? Math.round(Number(rawCost) * 10000) / 10000
        : null;
    const costChanged =
      nextCost != null && Math.abs(nextCost - Number(item.costPrice || 0)) > 0.00005;
    if (want && (!had || costChanged)) {
      changed.push(
        await updateCatalogItemRequest(userId, {
          ...item,
          supplierId: supplier._id,
          supplierName: supplier.name,
          ...(nextCost != null ? { costPrice: nextCost } : {}),
        }),
      );
    } else if (!want && had) {
      changed.push(
        await updateCatalogItemRequest(userId, {
          ...item,
          supplierId: '',
          supplierName: '',
        }),
      );
    }
  }
  return changed;
}
