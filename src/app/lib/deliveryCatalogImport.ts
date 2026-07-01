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
import {
  getDeliveryConfigRequest,
  listCatalogItemsRequest,
  updateCatalogItemRequest,
  updateDeliveryConfigRequest,
} from './deliveryApi';
import { syncInventoryCatalogFromSources } from './inventorySync';
import { runVertialStockAutomationPipeline } from './stockAutomationPipeline';
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
import { resolveCatalogProductPlaceholderUrl } from './catalogProductPlaceholders';
import { ensureVertialEscandalloBaseStoreIngredients } from './catalogImportCosting';
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
export function resolveImportComboStructure(
  entry: Record<string, string>,
): ComboStructureSlot[] {
  const raw = String(
    entry.tipo_menu || entry.tipoMenu || entry.menu || entry.combo || entry.tipo || '',
  ).trim();
  if (raw) {
    const key = foldImportKey(raw);
    const preset = COMBO_MENU_PRESETS.find(
      (p) =>
        p.id === key ||
        foldImportKey(p.label) === key ||
        foldImportKey(p.hint) === key,
    );
    return (preset?.structure ?? DEFAULT_COMBO_STRUCTURE).map((s) => ({ ...s }));
  }

  const name = foldImportKey(entry.name || '');
  if (/individual|menu individual|menu basico|menu básico/.test(name)) {
    return [
      { slotKind: 'main', label: 'Pizza', required: true, expectedCount: 1 },
      { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
      { slotKind: 'dessert', label: 'Postre', required: true, expectedCount: 1 },
    ];
  }
  if (/duo|duó|dúo/.test(name)) {
    return COMBO_MENU_PRESETS.find((p) => p.id === 'duo')!.structure.map((s) => ({ ...s }));
  }
  if (/famil|family|familiar/.test(name)) {
    return COMBO_MENU_PRESETS.find((p) => p.id === 'familiar')!.structure.map((s) => ({ ...s }));
  }
  if (/postre|dessert/.test(name)) {
    return COMBO_MENU_PRESETS.find((p) => p.id === 'con_postre')!.structure.map((s) => ({ ...s }));
  }

  return DEFAULT_COMBO_STRUCTURE.map((s) => ({ ...s }));
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

/** Quita una categoría/organizador del catálogo en las líneas comerciales (pestañas TPV). */
export async function removeCatalogCategoryFromBrands(
  businessId: string,
  categoryName: string,
): Promise<number> {
  const bid = String(businessId || '').trim();
  const target = normalizeImportCategory(categoryName);
  if (!bid || !target) return 0;

  const brands = await listBrandsRequest(bid).catch(() => [] as Brand[]);
  let updatedBrands = 0;

  for (const brand of brands) {
    const prev = brand.catalogCategories ?? [];
    const next = prev.filter((c) => normalizeImportCategory(c) !== target);
    if (next.length === prev.length) continue;
    await updateBrandRequest(bid, { ...brand, catalogCategories: next });
    updatedBrands += 1;
  }

  return updatedBrands;
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

  if (added > 0 || promoted > 0) {
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
  }

  try {
    await syncInventoryCatalogFromSources(uid, {
      businessType: 'delivery',
      businessId: bid,
      storeIngredients: normalizeStoreIngredients(merged),
      brands,
    });
  } catch {
    /* inventario best-effort */
  }

  return { added, promoted };
}

/**
 * Tras importar catálogo + ingredientes, genera escandallos/costes fijos Vertial
 * para productos que aún no tienen coste configurado.
 */
export async function syncAutoCostingAfterCatalogImport(
  userId: string,
  businessId: string,
  catalogItems: CatalogItem[],
): Promise<{ updated: number; recipe: number; fixed: number; skipped: number; failed: number }> {
  const uid = String(userId || '').trim();
  const bid = String(businessId || '').trim();
  if (!uid || !bid || catalogItems.length === 0) {
    return { updated: 0, recipe: 0, fixed: 0, skipped: 0, failed: 0 };
  }

  const brands = commercialLineBrands(await listBrandsRequest(bid).catch(() => [] as Brand[]));
  const brandIds = brands.map((b) => b._id);
  const cfg = await getDeliveryConfigRequest(uid).catch(() => null);
  const existing = unifyStoreIngredientsFromConfig(cfg, brandIds);
  const { items: withBases, added: basesAdded } = ensureVertialEscandalloBaseStoreIngredients(
    normalizeStoreIngredients(existing),
    brands,
  );

  if (basesAdded > 0 && cfg) {
    await updateDeliveryConfigRequest(uid, {
      _id: cfg._id || `dlvconf-${normalizeTenantUserId(uid)}`,
      _rev: cfg._rev,
      storeIngredients: withBases,
    });
    notifyDeliveryConfigChanged();
  }

  const result = await runVertialStockAutomationPipeline(uid, {
    businessType: 'delivery',
    businessId: bid,
    storeIngredients: withBases,
    brands,
    costingTargets: catalogItems,
    upgradeAutoFixedFood: true,
    updateCatalogItem: (item) => updateCatalogItemRequest(uid, item),
  });

  return result.costing;
}

/** Repara pizzas/burgers que quedaron con coste fijo sin escandallo tras un import antiguo. */
export async function repairVertialFoodEscandallo(
  userId: string,
  businessId: string,
): Promise<{ updated: number; recipe: number; basesAdded: number }> {
  const uid = String(userId || '').trim();
  const bid = String(businessId || '').trim();
  if (!uid || !bid) return { updated: 0, recipe: 0, basesAdded: 0 };

  const brands = commercialLineBrands(await listBrandsRequest(bid).catch(() => [] as Brand[]));
  const brandIds = brands.map((b) => b._id);
  const cfg = await getDeliveryConfigRequest(uid).catch(() => null);
  const existing = unifyStoreIngredientsFromConfig(cfg, brandIds);
  const { items: withBases, added: basesAdded } = ensureVertialEscandalloBaseStoreIngredients(
    normalizeStoreIngredients(existing),
    brands,
  );

  if (basesAdded > 0 && cfg) {
    await updateDeliveryConfigRequest(uid, {
      _id: cfg._id || `dlvconf-${normalizeTenantUserId(uid)}`,
      _rev: cfg._rev,
      storeIngredients: withBases,
    });
    notifyDeliveryConfigChanged();
  }

  const catalog = await listCatalogItemsRequest(uid).catch(() => [] as CatalogItem[]);
  const result = await runVertialStockAutomationPipeline(uid, {
    businessType: 'delivery',
    businessId: bid,
    storeIngredients: withBases,
    brands,
    catalogItems: catalog,
    upgradeAutoFixedFood: true,
    updateCatalogItem: (item) => updateCatalogItemRequest(uid, item),
  });

  return {
    updated: result.costing.updated,
    recipe: result.costing.recipe,
    basesAdded,
  };
}

/** Pipeline completo: inventario + escandallo (packaging) + recetas CouchDB. */
export async function syncFullStockAutomationAfterCatalogImport(
  userId: string,
  businessId: string,
  catalogItems: CatalogItem[],
) {
  const uid = String(userId || '').trim();
  const bid = String(businessId || '').trim();
  if (!uid || !bid) {
    return {
      inventory: { created: 0, updated: 0, skipped: 0, candidates: 0 },
      costing: { updated: 0, recipe: 0, fixed: 0, skipped: 0, failed: 0 },
      recipes: { created: 0, updated: 0, skipped: 0 },
    };
  }

  const brands = commercialLineBrands(await listBrandsRequest(bid).catch(() => [] as Brand[]));
  const brandIds = brands.map((b) => b._id);
  const cfg = await getDeliveryConfigRequest(uid).catch(() => null);
  const storeIngredients = normalizeStoreIngredients(unifyStoreIngredientsFromConfig(cfg, brandIds));

  return runVertialStockAutomationPipeline(uid, {
    businessType: 'delivery',
    businessId: bid,
    storeIngredients,
    brands,
    costingTargets: catalogItems.length > 0 ? catalogItems : undefined,
    updateCatalogItem: (item) => updateCatalogItemRequest(uid, item),
  });
}

/** Resuelve ítems del lote importado (por _id, sku o nombre) contra el catálogo actual. */
export function resolveImportedCatalogItemsForCosting(
  batch: Array<Pick<CatalogItem, '_id' | 'sku' | 'name'>>,
  catalog: CatalogItem[],
): CatalogItem[] {
  const byId = new Map(catalog.map((item) => [item._id, item]));
  const bySku = new Map<string, CatalogItem>();
  const byName = new Map<string, CatalogItem>();
  for (const item of catalog) {
    const sku = String(item.sku || '').trim().toLowerCase();
    const name = String(item.name || '').trim().toLowerCase();
    if (sku && !bySku.has(sku)) bySku.set(sku, item);
    if (name && !byName.has(name)) byName.set(name, item);
  }

  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const ref of batch) {
    const id = String(ref._id || '').trim();
    let hit = id ? byId.get(id) : undefined;
    if (!hit) {
      const sku = String(ref.sku || '').trim().toLowerCase();
      const name = String(ref.name || '').trim().toLowerCase();
      hit = (sku && bySku.get(sku)) || (name && byName.get(name));
    }
    if (!hit || seen.has(hit._id)) continue;
    seen.add(hit._id);
    out.push(hit);
  }
  return out;
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
    ...(options.businessId
      ? { business_id: options.businessId, vertical: 'delivery' }
      : {}),
  };

  const ingredientsRaw = String(entry.ingredients || entry.ingredientes || '').trim();
  if (ingredientsRaw) {
    const parsed = parseIngredientsBulkText(ingredientsRaw);
    if (parsed.length > 0) {
      item.customFields = {
        ...(item.customFields || {}),
        ingredients: parsed.join(', '),
      };
    }
  }

  if (item.itemType === 'combo') {
    item.customFields = {
      ...(item.customFields || {}),
      comboStructure: resolveImportComboStructure(entry),
      comboStructureConfirmed: true,
    };
  } else if (/mitad\s*y\s*mitad|half\s*and\s*half|half-half/i.test(name)) {
    item.customFields = {
      ...(item.customFields || {}),
      halfHalf: true,
    };
  }

  if (!String(item.image || '').trim()) {
    item.image = resolveCatalogProductPlaceholderUrl({
      name,
      category,
      itemType: item.itemType,
    });
  }

  return { item, brandCache, unmatchedLineNames };
}
