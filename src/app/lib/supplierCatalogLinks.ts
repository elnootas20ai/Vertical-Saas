import type { CatalogItem, Supplier } from './deliveryApi';
import { updateCatalogItemRequest } from './deliveryApi';
import { isStockInventoryItem } from './stockInventoryScope';

/**
 * Enlaza / desenlaza artículos de almacén con el proveedor recién guardado.
 */
export async function syncSupplierCatalogItemLinks(
  userId: string,
  supplier: Pick<Supplier, '_id' | 'name'>,
  selectedItemIds: string[],
  catalogItems: CatalogItem[],
): Promise<CatalogItem[]> {
  const selected = new Set(
    (selectedItemIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  const changed: CatalogItem[] = [];
  for (const item of catalogItems) {
    if (!isStockInventoryItem(item)) continue;
    const want = selected.has(item._id);
    const had = item.supplierId === supplier._id;
    if (want && !had) {
      changed.push(
        await updateCatalogItemRequest(userId, {
          ...item,
          supplierId: supplier._id,
          supplierName: supplier.name,
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
