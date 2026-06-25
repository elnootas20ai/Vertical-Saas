import { listBrandsRequest, updateBrandRequest, type Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import {
  normalizeStoreIngredients,
  normalizeTpvDefaultExtraPrice,
  parseIngredientsBulkText,
  resolveBrandTpvCategoryKeys,
  resolveIngredientRole,
  type TpvCategoryTemplateKey,
  unifyStoreIngredientsFromConfig,
} from './catalogCustomization';
import { getDeliveryConfigRequest, updateDeliveryConfigRequest } from './deliveryApi';
import { notifyDeliveryConfigChanged } from './deliverySetup';
import { normalizeTenantUserId } from './tenantUserId';
import {
  buildBrandCategoryMapFromItems,
  applyCatalogImportIngredientEntries,
  collectIngredientEntriesFromCatalogImport,
  commercialLineBrands,
  formatUnmatchedCommercialBrandWarning,
  isCommercialLineBrand,
  mergeBrandCatalogCategories,
  normalizeImportCategory,
  readImportLineText,
  resolveCatalogImportBrandIds,
  resolveCommercialLineIdsFromText,
  shouldClearBrandForCategory,
  isImportComboCategory,
} from './deliveryCatalogImportLogic';
import { parseImportPrice } from './deliveryCatalogExcelTemplate';
import {
  COMBO_MENU_PRESETS,
  DEFAULT_COMBO_STRUCTURE,
  type ComboStructureSlot,
} from './catalogComboSlots';

export type { ImportBrandLike } from './deliveryCatalogImportLogic';
export {
  allCommercialLineBrands,
  applyCatalogImportIngredientEntries,
  buildBrandCategoryMapFromItems,
  collectIngredientEntriesFromCatalogImport,
  commercialLineBrands,
  defaultBrandIdForCatalogImport,
  formatUnmatchedCommercialBrandWarning,
  inferCommercialLineBrandId,
  inferCommercialLineBrandIdFromProductName,
  isCommercialLineBrand,
  isImportComboCategory,
  mergeBrandCatalogCategories,
  normalizeImportCategory,
  readImportLineText,
  resolveCatalogImportBrandIds,
  shouldClearBrandForCategory,
} from './deliveryCatalogImportLogic';

function foldImportKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Tipo de menú opcional en Excel: estandar | duo | familiar | con_postre */
export function resolveImportComboStructure(entry: Record<string, string>): ComboStructureSlot[] {
  const raw = String(
    entry.tipo_menu || entry.tipoMenu || entry.menu || entry.combo || entry.tipo || '',
  ).trim();
  if (!raw) return DEFAULT_COMBO_STRUCTURE.map((s) => ({ ...s }));
  const key = foldImportKey(raw);
  const preset = COMBO_MENU_PRESETS.find(
    (p) =>
      p.id === key ||
      foldImportKey(p.label) === key ||
      foldImportKey(p.hint) === key,
  );
  return (preset?.structure ?? DEFAULT_COMBO_STRUCTURE).map((s) => ({ ...s }));
}

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

/**
 * Tras importar productos con columna ingredientes, añade nombres únicos a la lista
 * maestra (Catálogo → Ingredientes) como extras de pago listos para el TPV.
 */
export async function syncStoreIngredientsFromCatalogImport(
  userId: string,
  businessId: string,
  items: Array<Pick<CatalogItem, 'customFields' | 'brandIds'>>,
): Promise<{ added: number; promoted: number }> {
  const uid = String(userId || '').trim();
  const bid = String(businessId || '').trim();
  if (!uid || !bid || items.length === 0) return { added: 0, promoted: 0 };

  const brands = commercialLineBrands(await listBrandsRequest(bid).catch(() => [] as Brand[]));
  const brandIds = brands.map((b) => b._id);
  const productParts = [
    ...new Set(brands.flatMap((b) => resolveBrandTpvCategoryKeys(b))),
  ] as TpvCategoryTemplateKey[];
  const partsDefault: TpvCategoryTemplateKey[] =
    productParts.length > 0 ? productParts : ['pizzas', 'hamburguesas'];

  const entries = collectIngredientEntriesFromCatalogImport(items, brands, partsDefault);
  if (entries.length === 0) return { added: 0, promoted: 0 };

  const cfg = await getDeliveryConfigRequest(uid);
  const existing = unifyStoreIngredientsFromConfig(cfg, brandIds);
  const { merged, added, promoted } = applyCatalogImportIngredientEntries(existing, entries);
  if (added <= 0 && promoted <= 0) return { added: 0, promoted: 0 };

  const needsDefaultPrice =
    normalizeTpvDefaultExtraPrice(cfg.tpvDefaultExtraPrice) == null &&
    merged.some((i) => resolveIngredientRole(i) === 'extra');

  await updateDeliveryConfigRequest(uid, {
    _id: cfg._id || `dlvconf-${normalizeTenantUserId(uid)}`,
    _rev: cfg._rev,
    storeIngredients: normalizeStoreIngredients(merged),
    ...(needsDefaultPrice ? { tpvDefaultExtraPrice: 0 } : {}),
  });
  notifyDeliveryConfigChanged();
  return { added, promoted };
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
    itemType: (() => {
      const explicit = String(entry.itemType || '').trim();
      if (explicit === 'combo' || isImportComboCategory(category)) return 'combo' as const;
      if (['product', 'service'].includes(explicit)) return explicit as CatalogItem['itemType'];
      return 'product' as const;
   })(),
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

  if (item.itemType === 'combo') {
    item.customFields = {
      ...(item.customFields || {}),
      comboStructure: resolveImportComboStructure(entry),
      comboStructureConfirmed: true,
    };
  }

  return { item, brandCache, unmatchedLineNames };
}
