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
import { filterCatalogItemsForBusinessScope } from './catalogBusinessScope';
import {
  buildBrandCategoryMapFromItems,
  applyCatalogImportIngredientEntries,
  collectIngredientEntriesFromCatalogImport,
  commercialLineBrands,
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
import {
  ensureVertialEscandalloBaseStoreIngredients,
  needsVertialFoodEscandalloRepair,
} from './catalogImportCosting';
import {
  COMBO_MENU_PRESETS,
  DEFAULT_COMBO_STRUCTURE,
  type ComboStructureSlot,
} from './catalogComboSlots';
import { buildStableImportCatalogSku, catalogLooseIdentityKey } from '../../../shared/catalog/catalogItemIdentity.js';
import { applyCatalogImportCartaStockGuard } from '../../../shared/catalog/catalogStockGuard.js';

function inferInventoryBusinessType(
  brands: Array<{ deliveryLineKind?: string }>,
  fallback = 'delivery',
): string {
  const kinds = brands.map((b) => String(b.deliveryLineKind || '').trim());
  if (kinds.includes('tapas_bar') || kinds.includes('cafe_bakery')) return 'restaurant';
  return fallback;
}

async function syncInventoryFromStoreIngredients(
  userId: string,
  businessId: string,
  storeIngredients: ReturnType<typeof normalizeStoreIngredients>,
  brands: Array<{ _id: string; deliveryLineKind?: string }>,
  businessType?: string,
): Promise<void> {
  try {
    await syncInventoryCatalogFromSources(userId, {
      businessType: businessType || inferInventoryBusinessType(brands),
      businessId,
      storeIngredients,
      brands,
    });
  } catch {
    /* inventario best-effort */
  }
}

export type { ImportBrandLike } from './deliveryCatalogImportLogic';
export {
  allCommercialLineBrands,
  applyCatalogImportIngredientEntries,
  buildBrandCategoryMapFromItems,
  collectIngredientEntriesFromCatalogImport,
  commercialLineBrands,
  defaultBrandIdForCatalogImport,
  formatMissingBrandImportNotice,
  formatUnmatchedCommercialBrandWarning,
  MISSING_BRAND_IMPORT_CODE,
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
  options?: { vertical?: string },
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
    return (preset?.structure ?? defaultComboStructureForVertical(options?.vertical)).map((s) => ({ ...s }));
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

  return defaultComboStructureForVertical(options?.vertical).map((s) => ({ ...s }));
}

function defaultComboStructureForVertical(vertical?: string): ComboStructureSlot[] {
  if (String(vertical || '').trim() === 'restaurant') {
    return [
      { slotKind: 'main', label: 'Plato / tapa', required: true, expectedCount: 1 },
      { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
    ];
  }
  return DEFAULT_COMBO_STRUCTURE;
}

/** IVA del Excel (opcional). Restaurant → 10% por defecto; delivery → 21%. */
export function resolveImportTaxRate(
  entry: Record<string, string>,
  vertical?: string,
): number {
  const raw = String(
    entry.taxRate || entry.iva || entry.vat || entry.impuesto || '',
  )
    .trim()
    .replace('%', '')
    .replace(',', '.');
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  }
  const v = String(vertical || '').trim();
  // Comida / heladería: IVA reducido por defecto (se puede sobreescribir con columna iva).
  if (v === 'restaurant' || v === 'iceCreamShop') return 10;
  return 21;
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

  const updates: Promise<unknown>[] = [];
  for (const brand of brands) {
    if (!isCommercialLineBrand(brand)) continue;
    const importedCats = categoryMap.get(brand._id);
    if (!importedCats?.length) continue;

    const merged = mergeBrandCatalogCategories(brand.catalogCategories, importedCats);
    const prev = brand.catalogCategories || [];
    const unchanged =
      merged.length === prev.length && merged.every((cat, idx) => cat === prev[idx]);
    if (unchanged) continue;

    updates.push(updateBrandRequest(bid, { ...brand, catalogCategories: merged }));
    updatedBrands += 1;
  }

  if (updates.length > 0) {
    await Promise.allSettled(updates);
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
    await syncInventoryFromStoreIngredients(uid, bid, normalizeStoreIngredients(merged), brands);
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
  options?: { fullCatalog?: CatalogItem[] },
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
    businessType: inferInventoryBusinessType(brands),
    businessId: bid,
    storeIngredients: withBases,
    brands,
    catalogItems: options?.fullCatalog,
    costingTargets: catalogItems,
    upgradeAutoFixedFood: true,
    mode: 'costing',
    updateCatalogItem: (item) => updateCatalogItemRequest(uid, item),
  });

  await syncInventoryFromStoreIngredients(uid, bid, withBases, brands);

  return result.costing;
}

/** Repara pizzas/burgers/tacos que quedaron con coste fijo sin escandallo tras un import antiguo. */
export async function repairVertialFoodEscandallo(
  userId: string,
  businessId: string,
  options?: { allMenuProducts?: boolean },
): Promise<{ updated: number; recipe: number; fixed: number; basesAdded: number }> {
  const uid = String(userId || '').trim();
  const bid = String(businessId || '').trim();
  if (!uid || !bid) return { updated: 0, recipe: 0, fixed: 0, basesAdded: 0 };

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

  const inventoryBusinessType = inferInventoryBusinessType(brands);
  const catalog = await listCatalogItemsRequest(uid).catch(() => [] as CatalogItem[]);
  const scoped = filterCatalogItemsForBusinessScope(catalog, bid, brands, {
    activeBusinessType: inventoryBusinessType,
  });
  const menuItems = scoped.filter(
    (item) => (item.module || 'catalog') === 'catalog' && item.itemType !== 'service' && item.active !== false,
  );
  const repairTargets = options?.allMenuProducts
    ? menuItems
    : scoped.filter((item) => needsVertialFoodEscandalloRepair(item, brands));
  if (repairTargets.length === 0) {
    await syncInventoryFromStoreIngredients(uid, bid, withBases, brands, inventoryBusinessType);
    return { updated: 0, recipe: 0, fixed: 0, basesAdded };
  }

  const result = await runVertialStockAutomationPipeline(uid, {
    businessType: inventoryBusinessType,
    businessId: bid,
    storeIngredients: withBases,
    brands,
    catalogItems: catalog,
    costingTargets: repairTargets,
    upgradeAutoFixedFood: true,
    mode: 'costing',
    updateCatalogItem: (item) => updateCatalogItemRequest(uid, item),
  });

  await syncInventoryFromStoreIngredients(uid, bid, withBases, brands, inventoryBusinessType);

  return {
    updated: result.costing.updated,
    recipe: result.costing.recipe,
    fixed: result.costing.fixed,
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

/** Resuelve ítems del lote importado (por _id, sku o nombre+categoría) contra el catálogo actual. */
export function resolveImportedCatalogItemsForCosting(
  batch: Array<Pick<CatalogItem, '_id' | 'sku' | 'name' | 'category'>>,
  catalog: CatalogItem[],
): CatalogItem[] {
  const byId = new Map(catalog.map((item) => [item._id, item]));
  const byLoose = new Map<string, CatalogItem>();
  const bySku = new Map<string, CatalogItem>();
  for (const item of catalog) {
    const loose = catalogLooseIdentityKey(item);
    if (!byLoose.has(loose)) byLoose.set(loose, item);
    const sku = String(item.sku || '').trim().toLowerCase();
    if (sku && !bySku.has(sku)) bySku.set(sku, item);
  }

  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const ref of batch) {
    const id = String(ref._id || '').trim();
    let hit = id ? byId.get(id) : undefined;
    if (!hit) {
      const sku = String(ref.sku || '').trim().toLowerCase();
      const loose = catalogLooseIdentityKey({
        module: 'catalog',
        name: ref.name,
        category: ref.category,
      });
      hit = (sku && bySku.get(sku)) || byLoose.get(loose);
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
  /** Vertical del negocio activo (delivery | restaurant). */
  vertical?: string;
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

  const category = normalizeImportCategory(entry.category || '', {
    preserveSubfamilies: String(options.vertical || '').trim() === 'restaurant',
  });
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

  const itemBase: Partial<CatalogItem> = {
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
    sku:
      String(entry.sku || '').trim() ||
      buildStableImportCatalogSku({
        name,
        category,
        business_id: options.businessId,
        module: 'catalog',
      }) ||
      undefined,
    unit: String(entry.unit || entry.unidad || 'ud').trim() || 'ud',
    taxRate: resolveImportTaxRate(entry, options.vertical),
    module: 'catalog',
    ...(options.businessId
      ? {
          business_id: options.businessId,
          vertical: String(options.vertical || 'delivery').trim() || 'delivery',
        }
      : {}),
  };
  /** Carta TPV: isStockItem false, finished_product, active, sin deletedAt sticky. */
  const item = applyCatalogImportCartaStockGuard(itemBase, null) as Partial<CatalogItem>;

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

  const formatoRaw = String(entry.formato || entry.format || entry.tamano || entry.tamaño || '').trim();
  if (formatoRaw) {
    item.customFields = {
      ...(item.customFields || {}),
      formato: formatoRaw,
    };
  }

  if (item.itemType === 'combo') {
    // Solo estructura del Excel: allowlists/surcharges se conservan en merge al guardar
    // (mergeCatalogCustomFields) si el import no los envía.
    item.customFields = {
      ...(item.customFields || {}),
      comboStructure: resolveImportComboStructure(entry, { vertical: options.vertical }),
      comboStructureConfirmed: true,
    };
  } else if (/mitad\s*y\s*mitad|half\s*and\s*half|half-half/i.test(name)) {
    item.customFields = {
      ...(item.customFields || {}),
      halfHalf: true,
    };
  } else if (
    /al\s*gusto|a\s*gusto|build\s*your\s*own|\d+\s*ingredientes?/i.test(name)
  ) {
    const maxMatch = name.match(/(\d+)\s*ingredientes?/i);
    const maxN = maxMatch ? Number(maxMatch[1]) : NaN;
    item.customFields = {
      ...(item.customFields || {}),
      buildYourOwn: true,
      ...(Number.isFinite(maxN) && maxN > 0
        ? { buildYourOwnMaxIngredients: Math.min(20, Math.floor(maxN)) }
        : {}),
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
