/**
 * Sugerencia de pedido Vertial — agrupa las sugerencias de compra por proveedor.
 *
 * Prioridad de asignación:
 * 1. `supplierId` del artículo (enlace directo).
 * 2. «Qué suministra» del proveedor (organizerIds): el organizador de almacén
 *    del artículo se cruza con los proveedores que declaran suministrarlo.
 * 3. Sin proveedor → grupo aparte para que el usuario decida.
 */
import type { CatalogItem, Supplier } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import type { SuggestionItem } from './purchaseOrderApi';
import { isStockInventoryItem } from './stockInventoryScope';
import {
  listInventoryOrganizerChoices,
  ORGANIZER_TOTAL,
  resolveInventoryOrganizerId,
  type InventoryCommercialBrand,
} from './inventoryUtils';

export const SUGGESTION_NO_SUPPLIER_ID = '__no_supplier__';

export type VertialSuggestionGroup = {
  supplierId: string;
  supplierName: string;
  /** 'item' = artículo enlazado · 'organizer' = por «Qué suministra» · 'none' = sin proveedor */
  matchedBy: 'item' | 'organizer' | 'none';
  items: SuggestionItem[];
  totalCost: number;
};

function foldName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function ingredientMaps(storeIngredients: StoreIngredient[]) {
  const ingredientsById = new Map<string, StoreIngredient>();
  const ingredientsByName = new Map<string, StoreIngredient>();
  for (const ing of storeIngredients) {
    if (ing.id) ingredientsById.set(ing.id, ing);
    ingredientsByName.set(foldName(ing.name), ing);
  }
  return { ingredientsById, ingredientsByName };
}

/**
 * Organizador de almacén de un artículo de stock.
 * Vacío si no es inventario o si cae en «Total» (sin organizador real).
 */
export function resolveStockOrganizerId(
  item: CatalogItem,
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): string {
  if (!isStockInventoryItem(item)) return '';
  const { ingredientsById, ingredientsByName } = ingredientMaps(storeIngredients);
  const id = resolveInventoryOrganizerId(item, ingredientsById, ingredientsByName, commercialBrands);
  if (!id || id === ORGANIZER_TOTAL) return '';
  return id;
}

function supplierOrganizerIdSet(supplier: Pick<Supplier, 'organizerIds'> | null | undefined): Set<string> {
  return new Set(
    (Array.isArray(supplier?.organizerIds) ? supplier!.organizerIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
}

function supplierCatalogItemIdSet(
  supplier: Pick<Supplier, 'catalogItemIds'> | null | undefined,
): Set<string> {
  return new Set(
    (Array.isArray(supplier?.catalogItemIds) ? supplier!.catalogItemIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
}

/** Artículo de almacén que este proveedor suministra (marcado, enlace o organizador). */
export function catalogItemBelongsToSupplier(
  item: CatalogItem,
  supplier: Supplier,
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): boolean {
  if (!isStockInventoryItem(item)) return false;
  const marked = supplierCatalogItemIdSet(supplier);
  if (marked.size > 0) return marked.has(item._id);
  if (item.supplierId && item.supplierId === supplier._id) return true;
  const orgs = supplierOrganizerIdSet(supplier);
  if (orgs.size === 0) return false;
  const organizerId = resolveStockOrganizerId(item, storeIngredients, commercialBrands);
  return Boolean(organizerId) && orgs.has(organizerId);
}

/** Artículos de almacén de un organizador (Excel / inventario). */
export function stockItemsForOrganizer(
  catalogItems: CatalogItem[],
  organizerId: string,
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): CatalogItem[] {
  const want = String(organizerId || '').trim();
  if (!want) return [];
  return catalogItems
    .filter(isStockInventoryItem)
    .filter((item) => resolveStockOrganizerId(item, storeIngredients, commercialBrands) === want)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

export type SupplierOrderPickerGroup = {
  organizerId: string;
  organizerLabel: string;
  items: CatalogItem[];
};

/**
 * Artículos visibles al hacer un pedido a este proveedor.
 * Solo almacén, solo los organizadores que el proveedor tiene en «Qué suministra»
 * (más los ya enlazados con supplierId). Sin proveedor: todo el almacén.
 */
export function stockItemsForSupplierOrder(
  catalogItems: CatalogItem[],
  supplier: Supplier | null,
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): CatalogItem[] {
  const stock = catalogItems.filter(isStockInventoryItem);
  if (!supplier) {
    return [...stock].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  }
  const matched = stock.filter((item) =>
    catalogItemBelongsToSupplier(item, supplier, storeIngredients, commercialBrands),
  );
  return matched.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

export function groupStockItemsByOrganizer(
  items: CatalogItem[],
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): SupplierOrderPickerGroup[] {
  const labels = new Map(
    listInventoryOrganizerChoices(commercialBrands).map((c) => [c.id, c.label]),
  );
  const buckets = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const id = resolveStockOrganizerId(item, storeIngredients, commercialBrands) || '__none__';
    const arr = buckets.get(id) || [];
    arr.push(item);
    buckets.set(id, arr);
  }
  const order = listInventoryOrganizerChoices(commercialBrands).map((c) => c.id);
  const groups: SupplierOrderPickerGroup[] = [];
  for (const id of order) {
    const bucket = buckets.get(id);
    if (!bucket?.length) continue;
    groups.push({
      organizerId: id,
      organizerLabel: labels.get(id) || id,
      items: bucket,
    });
    buckets.delete(id);
  }
  for (const [id, bucket] of buckets) {
    if (!bucket.length) continue;
    groups.push({
      organizerId: id,
      organizerLabel: id === '__none__' ? 'Sin organizador' : labels.get(id) || id,
      items: bucket,
    });
  }
  return groups;
}

export function groupSuggestionsForVertial(
  suggestions: SuggestionItem[],
  catalogItems: CatalogItem[],
  suppliers: Supplier[],
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): VertialSuggestionGroup[] {
  const catalogById = new Map(catalogItems.map((i) => [i._id, i]));
  const activeSuppliers = suppliers
    .filter((s) => s.active !== false && !s.deletedAt)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  const supplierById = new Map(activeSuppliers.map((s) => [s._id, s]));

  const suppliersByOrganizer = new Map<string, Supplier[]>();
  for (const sup of activeSuppliers) {
    for (const orgId of Array.isArray(sup.organizerIds) ? sup.organizerIds : []) {
      const key = String(orgId || '').trim();
      if (!key) continue;
      const arr = suppliersByOrganizer.get(key) || [];
      arr.push(sup);
      suppliersByOrganizer.set(key, arr);
    }
  }

  const groups = new Map<string, VertialSuggestionGroup>();
  const pushTo = (
    key: string,
    supplierName: string,
    matchedBy: VertialSuggestionGroup['matchedBy'],
    item: SuggestionItem,
  ) => {
    let group = groups.get(key);
    if (!group) {
      group = {
        supplierId: key === SUGGESTION_NO_SUPPLIER_ID ? '' : key,
        supplierName,
        matchedBy,
        items: [],
        totalCost: 0,
      };
      groups.set(key, group);
    }
    group.items.push(item);
    group.totalCost = Math.round((group.totalCost + (Number(item.estimatedCost) || 0)) * 100) / 100;
  };

  for (const suggestion of suggestions) {
    const linked = suggestion.supplierId ? supplierById.get(suggestion.supplierId) : undefined;
    if (linked) {
      pushTo(linked._id, linked.name, 'item', suggestion);
      continue;
    }

    const catalogItem = catalogById.get(suggestion._id);
    if (catalogItem && isStockInventoryItem(catalogItem)) {
      const organizerId = resolveStockOrganizerId(catalogItem, storeIngredients, commercialBrands);
      const candidates = organizerId ? (suppliersByOrganizer.get(organizerId) || []) : [];
      // Solo si un único proveedor cubre ese organizador: si hay varios, no adivinar.
      if (candidates.length === 1) {
        const chosen = candidates[0];
        pushTo(chosen._id, chosen.name, 'organizer', suggestion);
        continue;
      }
    }

    pushTo(SUGGESTION_NO_SUPPLIER_ID, 'Sin proveedor asignado', 'none', suggestion);
  }

  const list = [...groups.values()];
  list.sort((a, b) => {
    if (a.matchedBy === 'none' && b.matchedBy !== 'none') return 1;
    if (b.matchedBy === 'none' && a.matchedBy !== 'none') return -1;
    return b.totalCost - a.totalCost;
  });
  return list;
}

/** Cantidad final a pedir para una sugerencia (fallback si el consumo es 0). */
export function suggestionOrderQuantity(item: SuggestionItem): number {
  if (item.suggestedQty > 0) return item.suggestedQty;
  if (item.reorderQuantity > 0) return item.reorderQuantity;
  const min = Number(item.minStock) || 0;
  const stock = Number(item.stockQuantity) || 0;
  // Reponer hasta 1,5× el mínimo si no hay dato de consumo ni cantidad de reposición.
  const target = Math.ceil(min * 1.5);
  return Math.max(1, target - stock);
}
