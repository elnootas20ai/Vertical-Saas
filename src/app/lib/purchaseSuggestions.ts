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
  resolveStoreIngredientOrganizerId,
  type InventoryCommercialBrand,
} from './inventoryUtils';
import {
  catalogCategoryKeyFromOrganizerId,
  isCatalogCategoryOrganizerId,
  normalizeImportCategory,
} from './deliveryCatalogImportLogic';
import { defaultUnitForIngredient } from './inventorySyncLogic';
import { effectiveStoreIngredientBaseCost } from './vertialDefaultCosts';
import { resolveSupplierSelectedStockIds } from './supplierCatalogLinks';

export const SUGGESTION_NO_SUPPLIER_ID = '__no_supplier__';

function foldCatKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function itemCategoryKey(item: Pick<CatalogItem, 'category'>): string {
  return foldCatKey(normalizeImportCategory(String(item.category || '')));
}

function itemMatchesCategoryOrganizer(
  item: Pick<CatalogItem, 'category'>,
  organizerId: string,
): boolean {
  const want = catalogCategoryKeyFromOrganizerId(organizerId);
  if (!want) return false;
  const have = itemCategoryKey(item);
  return Boolean(have) && have === want;
}

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
  if (marked.has(item._id)) return true;
  if (item.supplierId && item.supplierId === supplier._id) return true;
  const orgs = supplierOrganizerIdSet(supplier);
  if (orgs.size === 0) return false;
  const organizerId = resolveStockOrganizerId(item, storeIngredients, commercialBrands);
  if (organizerId && orgs.has(organizerId)) return true;
  for (const org of orgs) {
    if (isCatalogCategoryOrganizerId(org) && itemMatchesCategoryOrganizer(item, org)) return true;
  }
  return false;
}

function storeIngredientMatchesOrganizer(
  ing: StoreIngredient,
  organizerId: string,
  commercialBrands: InventoryCommercialBrand[],
): boolean {
  const want = String(organizerId || '').trim();
  if (!want) return false;
  if (isCatalogCategoryOrganizerId(want)) {
    const catKey = catalogCategoryKeyFromOrganizerId(want);
    return catKey === 'ingredientes';
  }
  return resolveStoreIngredientOrganizerId(ing, commercialBrands) === want;
}

function buildVirtualStockItemFromIngredient(
  ing: StoreIngredient,
  commercialBrands: InventoryCommercialBrand[] = [],
): CatalogItem {
  return {
    _id: ing.id,
    name: ing.name,
    module: 'stock',
    itemType: 'product',
    isStockItem: true,
    stockCategory: 'ingredient',
    category: 'Ingredientes',
    unit: defaultUnitForIngredient(ing.name, 'ingredient'),
    costPrice: effectiveStoreIngredientBaseCost(ing, commercialBrands),
    stockQuantity: 0,
    active: true,
    available: true,
    customFields: { storeIngredientId: ing.id },
  } as CatalogItem;
}

function mergePendingStoreIngredients(
  items: CatalogItem[],
  organizerId: string,
  storeIngredients: StoreIngredient[],
  commercialBrands: InventoryCommercialBrand[],
): CatalogItem[] {
  if (storeIngredients.length === 0) return items;
  const seen = new Set<string>();
  for (const item of items) {
    const ingId = String(item.customFields?.storeIngredientId || '').trim();
    if (ingId) seen.add(ingId);
    seen.add(foldName(item.name));
  }
  const pending: CatalogItem[] = [];
  for (const ing of storeIngredients) {
    if (!ing?.id || !String(ing.name || '').trim()) continue;
    if (!storeIngredientMatchesOrganizer(ing, organizerId, commercialBrands)) continue;
    if (seen.has(ing.id) || seen.has(foldName(ing.name))) continue;
    pending.push(buildVirtualStockItemFromIngredient(ing, commercialBrands));
  }
  if (pending.length === 0) return items;
  return [...items, ...pending].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'es'),
  );
}

/** Artículos de un organizador (almacén clásico o categoría de catálogo). */
export function stockItemsForOrganizer(
  catalogItems: CatalogItem[],
  organizerId: string,
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): CatalogItem[] {
  const want = String(organizerId || '').trim();
  if (!want) return [];
  if (isCatalogCategoryOrganizerId(want)) {
    const fromCatalog = catalogItems
      .filter((item) => !item.deletedAt && item.active !== false)
      .filter((item) => itemMatchesCategoryOrganizer(item, want))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
    return mergePendingStoreIngredients(fromCatalog, want, storeIngredients, commercialBrands);
  }
  const fromStock = catalogItems
    .filter(isStockInventoryItem)
    .filter((item) => resolveStockOrganizerId(item, storeIngredients, commercialBrands) === want)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  return mergePendingStoreIngredients(fromStock, want, storeIngredients, commercialBrands);
}

export type SupplierOrderPickerGroup = {
  organizerId: string;
  organizerLabel: string;
  items: CatalogItem[];
};

/** Artículos de almacén que puede pedir a este proveedor (marcados, categoría añadida o enlace legacy). */
export function explicitMarkedStockItemsForSupplier(
  catalogItems: CatalogItem[],
  supplier: Supplier,
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): CatalogItem[] {
  const stock = catalogItems.filter(isStockInventoryItem);
  const byId = new Map(stock.map((i) => [i._id, i]));
  const markedRaw = supplierCatalogItemIdSet(supplier);
  const resolvedMarkedIds = new Set(
    resolveSupplierSelectedStockIds([...markedRaw], catalogItems, storeIngredients),
  );
  const supplierKey = String(supplier._id || '').trim();
  const orgs = supplierOrganizerIdSet(supplier);
  const out = new Map<string, CatalogItem>();

  const add = (item: CatalogItem) => {
    const id = String(item?._id || '').trim();
    if (!id) return;
    out.set(id, item);
  };

  for (const id of resolvedMarkedIds) {
    const item = byId.get(id);
    if (item) add(item);
  }

  for (const rawId of markedRaw) {
    if (resolvedMarkedIds.has(rawId) || out.has(rawId)) continue;
    const ing = storeIngredients.find((i) => i.id === rawId);
    if (ing) add(buildVirtualStockItemFromIngredient(ing, commercialBrands));
  }

  for (const item of stock) {
    if (supplierKey && String(item.supplierId || '').trim() === supplierKey) {
      add(item);
    }
  }

  for (const orgId of orgs) {
    const orgItems = stockItemsForOrganizer(
      catalogItems,
      orgId,
      storeIngredients,
      commercialBrands,
    ).filter(isStockInventoryItem);
    const markedInOrg = orgItems.filter(
      (item) => resolvedMarkedIds.has(item._id) || markedRaw.has(item._id),
    );
    const linkedInOrg = orgItems.filter(
      (item) => supplierKey && String(item.supplierId || '').trim() === supplierKey,
    );
    if (markedInOrg.length > 0) {
      for (const item of markedInOrg) add(item);
    } else if (linkedInOrg.length > 0) {
      for (const item of linkedInOrg) add(item);
    } else if (orgItems.length > 0) {
      for (const item of orgItems) add(item);
    }
  }

  return [...out.values()].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'es'),
  );
}

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
  const marked = supplierCatalogItemIdSet(supplier);
  if (marked.size > 0 || supplierOrganizerIdSet(supplier).size > 0) {
    return explicitMarkedStockItemsForSupplier(
      catalogItems,
      supplier,
      storeIngredients,
      commercialBrands,
    );
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
  // También agrupar por categoría de catálogo cuando el artículo no tiene organizador de almacén.
  for (const item of items) {
    const catKey = itemCategoryKey(item);
    if (!catKey) continue;
    const catId = `cat:${catKey}`;
    if (!labels.has(catId)) {
      labels.set(catId, normalizeImportCategory(String(item.category || '')) || catKey);
    }
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

function resolveSuggestionSupplier(
  suggestion: SuggestionItem,
  catalogItem: CatalogItem | undefined,
  supplierById: Map<string, Supplier>,
  suppliersByOrganizer: Map<string, Supplier[]>,
  activeSuppliers: Supplier[],
  storeIngredients: StoreIngredient[],
  commercialBrands: InventoryCommercialBrand[],
): { supplier: Supplier | null; matchedBy: VertialSuggestionGroup['matchedBy'] } {
  const fromSuggestion = suggestion.supplierId
    ? supplierById.get(String(suggestion.supplierId).trim())
    : undefined;
  if (fromSuggestion) return { supplier: fromSuggestion, matchedBy: 'item' };

  const fromCatalog =
    catalogItem?.supplierId && supplierById.get(String(catalogItem.supplierId).trim());
  if (fromCatalog) return { supplier: fromCatalog, matchedBy: 'item' };

  if (catalogItem && isStockInventoryItem(catalogItem)) {
    const markedSuppliers = activeSuppliers.filter((sup) =>
      supplierCatalogItemIdSet(sup).has(catalogItem._id),
    );
    if (markedSuppliers.length === 1) {
      return { supplier: markedSuppliers[0], matchedBy: 'item' };
    }

    const belongs = activeSuppliers.filter((sup) =>
      catalogItemBelongsToSupplier(catalogItem, sup, storeIngredients, commercialBrands),
    );
    if (belongs.length === 1) {
      return { supplier: belongs[0], matchedBy: 'organizer' };
    }

    const organizerId = resolveStockOrganizerId(catalogItem, storeIngredients, commercialBrands);
    const candidates = organizerId ? suppliersByOrganizer.get(organizerId) || [] : [];
    if (candidates.length === 1) {
      return { supplier: candidates[0], matchedBy: 'organizer' };
    }
  }

  return { supplier: null, matchedBy: 'none' };
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
    const catalogItem = catalogById.get(suggestion._id);
    const resolved = resolveSuggestionSupplier(
      suggestion,
      catalogItem,
      supplierById,
      suppliersByOrganizer,
      activeSuppliers,
      storeIngredients,
      commercialBrands,
    );
    if (resolved.supplier) {
      pushTo(resolved.supplier._id, resolved.supplier.name, resolved.matchedBy, suggestion);
      continue;
    }
    pushTo(SUGGESTION_NO_SUPPLIER_ID, 'Sin proveedor asignado', 'none', suggestion);
  }

  const list = [...groups.values()];
  const unassigned = list.filter((g) => g.matchedBy === 'none');
  const assigned = list.filter((g) => g.matchedBy !== 'none');
  assigned.sort((a, b) => b.totalCost - a.totalCost);
  return [...assigned, ...unassigned];
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
