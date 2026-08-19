import type { CatalogItem, Supplier } from './deliveryApi';
import { updateCatalogItemRequest } from './deliveryApi';
import { isStockInventoryItem } from './stockInventoryScope';

/**
 * Enlaza / desenlaza artículos de almacén con el proveedor y guarda el coste que cobra.
 */
export async function syncSupplierCatalogItemLinks(
  userId: string,
  supplier: Pick<Supplier, '_id' | 'name'>,
  selectedItemIds: string[],
  catalogItems: CatalogItem[],
  itemCosts: Record<string, number> = {},
): Promise<CatalogItem[]> {
  const selected = new Set(
    (selectedItemIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  const changed: CatalogItem[] = [];
  for (const item of catalogItems) {
    if (!isStockInventoryItem(item)) continue;
    const want = selected.has(item._id);
    const had = item.supplierId === supplier._id;
    const rawCost = itemCosts[item._id];
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
