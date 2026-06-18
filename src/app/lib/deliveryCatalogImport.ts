import { listBrandsRequest, updateBrandRequest, type Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { parseIngredientsBulkText } from './catalogCustomization';
import {
  buildBrandCategoryMapFromItems,
  commercialLineBrands,
  formatUnmatchedCommercialBrandWarning,
  isCommercialLineBrand,
  mergeBrandCatalogCategories,
  normalizeImportCategory,
  readImportLineText,
  resolveCatalogImportBrandIds,
  resolveCommercialLineIdsFromText,
  shouldClearBrandForCategory,
} from './deliveryCatalogImportLogic';
import { parseImportPrice } from './deliveryCatalogExcelTemplate';

export type { ImportBrandLike } from './deliveryCatalogImportLogic';
export {
  allCommercialLineBrands,
  buildBrandCategoryMapFromItems,
  commercialLineBrands,
  defaultBrandIdForCatalogImport,
  formatUnmatchedCommercialBrandWarning,
  inferCommercialLineBrandId,
  inferCommercialLineBrandIdFromProductName,
  isCommercialLineBrand,
  mergeBrandCatalogCategories,
  normalizeImportCategory,
  readImportLineText,
  resolveCatalogImportBrandIds,
  shouldClearBrandForCategory,
} from './deliveryCatalogImportLogic';

export type ResolveBrandIdsFromImportResult = {
  brandIds: string[];
  cache: Brand[];
  createdNames: string[];
  unmatchedNames: string[];
};

/**
 * Resuelve texto de import a brandIds de **líneas comerciales** del negocio.
 * No enlaza marcas de producto (Coca-Cola, Galbani…) aunque existan en la BD.
 */
export async function resolveBrandIdsFromImportText(
  businessId: string,
  marcaText: string,
  cache: Brand[],
  options?: { createMissing?: boolean },
): Promise<ResolveBrandIdsFromImportResult> {
  const bid = String(businessId || '').trim();
  const raw = String(marcaText || '').trim();
  if (!bid || !raw) {
    return { brandIds: [], cache, createdNames: [], unmatchedNames: [] };
  }

  if (options?.createMissing === true) {
    // Reservado para flujos explícitos fuera del import Excel (no usado por defecto).
  }

  let brands = [...cache];
  if (brands.length === 0) {
    try {
      brands = await listBrandsRequest(bid);
    } catch {
      brands = [];
    }
  }

  const { brandIds, unmatchedNames } = resolveCommercialLineIdsFromText(raw, brands);
  return { brandIds, cache: brands, createdNames: [], unmatchedNames };
}

/**
 * Tras importar productos, actualiza catalogCategories de cada línea comercial
 * para que el TPV muestre las pestañas inferiores (Pizzas, Bebidas…) en orden lógico.
 */
export async function syncTpvOrganizersAfterCatalogImport(
  businessId: string,
  items: Array<Pick<CatalogItem, 'brandIds' | 'category'>>,
): Promise<{ updatedBrands: number }> {
  const bid = String(businessId || '').trim();
  if (!bid || items.length === 0) return { updatedBrands: 0 };

  const brands = await listBrandsRequest(bid).catch(() => [] as Brand[]);
  const categoryMap = buildBrandCategoryMapFromItems(items);
  let updatedBrands = 0;

  for (const brand of brands) {
    if (!isCommercialLineBrand(brand)) continue;
    const importedCats = categoryMap.get(brand._id);
    if (!importedCats?.length) continue;

    const merged = mergeBrandCatalogCategories(brand.catalogCategories, importedCats);
    const prev = brand.catalogCategories || [];
    const unchanged =
      merged.length === prev.length && merged.every((cat, idx) => cat === prev[idx]);
    if (unchanged) continue;

    await updateBrandRequest(bid, { ...brand, catalogCategories: merged });
    updatedBrands += 1;
  }

  return { updatedBrands };
}

/** Activa líneas comerciales que recibieron productos en el import (p. ej. blackburger inactiva). */
export async function activateCommercialLinesAfterCatalogImport(
  businessId: string,
  items: Array<Pick<CatalogItem, 'brandIds'>>,
): Promise<{ activated: number }> {
  const bid = String(businessId || '').trim();
  if (!bid || items.length === 0) return { activated: 0 };

  const usedBrandIds = new Set(
    items.flatMap((item) => (item.brandIds ?? []).map((id) => String(id || '').trim()).filter(Boolean)),
  );
  if (usedBrandIds.size === 0) return { activated: 0 };

  const brands = await listBrandsRequest(bid).catch(() => [] as Brand[]);
  let activated = 0;

  for (const brand of brands) {
    if (!usedBrandIds.has(brand._id)) continue;
    if (brand.active !== false) continue;
    if (!isCommercialLineBrand(brand)) continue;
    await updateBrandRequest(bid, { ...brand, active: true });
    activated += 1;
  }

  return { activated };
}

export type MapImportEntryOptions = {
  businessId: string;
  brandCache: Brand[];
};

export type MapImportEntryResult = {
  item: Partial<CatalogItem>;
  brandCache: Brand[];
  unmatchedLineNames: string[];
};

/** Convierte una fila del Excel en un ítem de catálogo listo para bulk create. */
export async function mapImportEntryToCatalogItem(
  entry: Record<string, string>,
  options: MapImportEntryOptions,
): Promise<MapImportEntryResult | null> {
  const name = String(entry.name || '').trim();
  if (!name) return null;

  const category = normalizeImportCategory(entry.category || '');
  const lineText = readImportLineText(entry);
  let brandCache = options.brandCache;
  let explicitBrandIds: string[] = [];
  const unmatchedLineNames: string[] = [];

  if (lineText && options.businessId) {
    const resolved = await resolveBrandIdsFromImportText(options.businessId, lineText, brandCache);
    brandCache = resolved.cache;
    explicitBrandIds = resolved.brandIds;
    unmatchedLineNames.push(...resolved.unmatchedNames);
  }

  const item: Partial<CatalogItem> = {
    name,
    category,
    brandIds: resolveCatalogImportBrandIds(explicitBrandIds, category, brandCache, name),
    itemType: ['product', 'service', 'combo'].includes(String(entry.itemType || '').trim())
      ? (String(entry.itemType).trim() as CatalogItem['itemType'])
      : 'product',
    description: String(entry.description || '').trim(),
    unitPrice: (() => {
      const p = parseImportPrice(String(entry.price || entry.unitPrice || ''));
      return Number.isFinite(p) ? p : 0;
    })(),
    costPrice: Number(String(entry.costPrice || '').replace(',', '.')) || 0,
    stockQuantity: 0,
    minStock: 0,
    allergens: String(entry.allergens || '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    image: String(entry.image || '').trim() || undefined,
    sku: String(entry.sku || '').trim() || undefined,
    unit: String(entry.unit || entry.unidad || 'ud').trim() || 'ud',
    active: true,
    available: true,
    webVisible: true,
    module: 'catalog',
  };

  const ingredientsRaw = String(entry.ingredients || entry.ingredientes || '').trim();
  if (ingredientsRaw) {
    item.customFields = {
      ...(item.customFields || {}),
      ingredients: parseIngredientsBulkText(ingredientsRaw).join(', '),
    };
  }

  return { item, brandCache, unmatchedLineNames };
}
