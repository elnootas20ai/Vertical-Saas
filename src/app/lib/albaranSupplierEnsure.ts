import type { CatalogItem, PurchaseInvoiceLine, Supplier } from './deliveryApi';
import { createSupplierRequest } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import type { InventoryCommercialBrand } from './inventoryUtils';
import { catalogCategoryOrganizerId } from './deliveryCatalogImportLogic';
import { nameMatchScore } from './albaranReceptionCompare';
import { isSupplierOrderStockItem } from './stockInventoryScope';
import { stockItemsForOrganizer } from './purchaseSuggestions';
import { syncSupplierCatalogItemLinks } from './supplierCatalogLinks';

export function normalizeSupplierCif(value: string | null | undefined): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function foldName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Busca proveedor por CIF (prioridad) o nombre del emisor OCR. */
export function findSupplierFromOcrEmitter(
  suppliers: Supplier[],
  emitter: string | null | undefined,
  cif: string | null | undefined,
): Supplier | null {
  const wantCif = normalizeSupplierCif(cif);
  if (wantCif) {
    const byCif = suppliers.find((s) => normalizeSupplierCif(s.cif) === wantCif);
    if (byCif) return byCif;
  }
  const wantName = foldName(emitter || '');
  if (!wantName) return null;
  const exact = suppliers.find((s) => foldName(s.name) === wantName);
  if (exact) return exact;
  let best: Supplier | null = null;
  let bestScore = 0;
  for (const s of suppliers) {
    const score = nameMatchScore(wantName, s.name);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 0.55 ? best : null;
}

/** Organizadores por defecto + los de artículos que coinciden con líneas OCR. */
export function inferOrganizerIdsFromOcrLines(
  lines: Array<{ description?: string; itemName?: string; catalogItemName?: string }>,
  catalogItems: CatalogItem[],
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): string[] {
  const orgs = new Set<string>();
  const defaultIng = catalogCategoryOrganizerId('Ingredientes');
  if (defaultIng) orgs.add(defaultIng);

  const stock = catalogItems.filter(isSupplierOrderStockItem);
  for (const line of lines || []) {
    const label = String(
      line.itemName || line.catalogItemName || line.description || '',
    ).trim();
    if (!label) continue;
    let best: CatalogItem | null = null;
    let bestScore = 0;
    for (const item of stock) {
      const score = nameMatchScore(label, item.name || '');
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (!best || bestScore < 0.45) continue;
    const catOrg = best.category ? catalogCategoryOrganizerId(best.category) : '';
    if (catOrg) orgs.add(catOrg);
  }

  void storeIngredients;
  void commercialBrands;

  return [...orgs];
}

/** Productos de almacén ya marcados en organizadores/categorías del sistema. */
export function catalogItemIdsForOrganizers(
  organizerIds: string[],
  catalogItems: CatalogItem[],
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): string[] {
  const out = new Set<string>();
  for (const orgId of organizerIds) {
    for (const item of stockItemsForOrganizer(
      catalogItems,
      orgId,
      storeIngredients,
      commercialBrands,
    )) {
      if (isSupplierOrderStockItem(item) && item._id) out.add(item._id);
    }
  }
  return [...out];
}

/** Empareja líneas OCR/albarán con artículos de stock (y del proveedor si hay). */
export function rematchAlbaranLinesToCatalog(
  lines: PurchaseInvoiceLine[],
  catalogItems: CatalogItem[],
  supplierId = '',
): PurchaseInvoiceLine[] {
  const stock = catalogItems.filter(isSupplierOrderStockItem);
  const supplierKey = String(supplierId || '').trim();
  const preferred = supplierKey
    ? stock.filter((i) => String(i.supplierId || '').trim() === supplierKey)
    : [];
  const pool = preferred.length > 0 ? [...preferred, ...stock] : stock;

  return (lines || []).map((line) => {
    if (String(line.catalogItemId || '').trim()) return line;
    const label = String(line.itemName || line.catalogItemName || '').trim();
    if (!label) return line;
    let best: CatalogItem | null = null;
    let bestScore = 0;
    const seen = new Set<string>();
    for (const item of pool) {
      if (seen.has(item._id)) continue;
      seen.add(item._id);
      const score = nameMatchScore(label, item.name || '');
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (!best || bestScore < 0.45) return line;
    return {
      ...line,
      catalogItemId: best._id,
      catalogItemName: best.name || line.catalogItemName || line.itemName,
    };
  });
}

export type EnsureAlbaranSupplierResult = {
  supplier: Supplier;
  created: boolean;
  method: 'cif' | 'name' | 'auto_created' | 'existing';
  catalogItemsUpdated: CatalogItem[];
};

/**
 * Deduce o crea proveedor desde OCR y vincula productos de organizadores/categorías.
 */
export async function ensureAlbaranSupplierFromOcr(opts: {
  userId: string;
  suppliers: Supplier[];
  catalogItems: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  commercialBrands?: InventoryCommercialBrand[];
  emitter?: string | null;
  emitterCif?: string | null;
  ocrLines?: Array<{ description?: string; itemName?: string; catalogItemName?: string }>;
  existingSupplierId?: string;
}): Promise<EnsureAlbaranSupplierResult | null> {
  const {
    userId,
    suppliers,
    catalogItems,
    storeIngredients = [],
    commercialBrands = [],
    emitter,
    emitterCif,
    ocrLines = [],
    existingSupplierId,
  } = opts;

  if (existingSupplierId) {
    const existing = suppliers.find((s) => s._id === existingSupplierId);
    if (existing) {
      return {
        supplier: existing,
        created: false,
        method: 'existing',
        catalogItemsUpdated: [],
      };
    }
  }

  const matched = findSupplierFromOcrEmitter(suppliers, emitter, emitterCif);
  if (matched) {
    return {
      supplier: matched,
      created: false,
      method: normalizeSupplierCif(emitterCif) && normalizeSupplierCif(matched.cif) === normalizeSupplierCif(emitterCif)
        ? 'cif'
        : 'name',
      catalogItemsUpdated: [],
    };
  }

  const name = String(emitter || '').trim();
  if (!name) return null;

  const organizerIds = inferOrganizerIdsFromOcrLines(
    ocrLines,
    catalogItems,
    storeIngredients,
    commercialBrands,
  );
  const catalogItemIds = catalogItemIdsForOrganizers(
    organizerIds,
    catalogItems,
    storeIngredients,
    commercialBrands,
  );

  const created = await createSupplierRequest(userId, {
    name,
    cif: String(emitterCif || '').trim(),
    notes: 'Creado automáticamente desde albarán (OCR)',
    active: true,
    organizerIds,
    catalogItemIds,
  });

  const catalogItemsUpdated = await syncSupplierCatalogItemLinks(
    userId,
    created,
    catalogItemIds,
    catalogItems,
    {},
    storeIngredients,
  );

  return {
    supplier: { ...created, organizerIds, catalogItemIds },
    created: true,
    method: 'auto_created',
    catalogItemsUpdated,
  };
}
