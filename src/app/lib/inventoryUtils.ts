import type { CatalogItem, StockCategory } from './deliveryApi';
import type { MovementType } from './stockMovementApi';
import type { StoreIngredient } from './catalogCustomization';
import { resolveTpvFamilyKey } from './tpvCatalogFamilies';
import {
  catalogCategoryOrganizerId,
  isCatalogCategoryOrganizerId,
  isWarehouseImportCategory,
  normalizeImportCategory,
} from './deliveryCatalogImportLogic';

function foldIngredientKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export type InventoryStatus = 'ok' | 'low' | 'out' | 'negative';

export const STOCK_CATEGORY_LABELS: Record<StockCategory, string> = {
  ingredient: 'Ingrediente',
  beverage: 'Bebida',
  packaging: 'Envase',
  cleaning: 'Limpieza',
  consumable: 'Consumible',
  finished_product: 'Producto terminado',
  other: 'Otro',
};

export function readInventoryProductBrand(item: Pick<CatalogItem, 'customFields' | 'supplierName'>): string {
  const fromCustom = String(item.customFields?.productBrand || '').trim();
  if (fromCustom) return fromCustom;
  return String(item.supplierName || '').trim();
}

export function readInventoryCategoryLabel(item: Pick<CatalogItem, 'category' | 'stockCategory'>): string {
  if (item.stockCategory && STOCK_CATEGORY_LABELS[item.stockCategory]) {
    return STOCK_CATEGORY_LABELS[item.stockCategory];
  }
  return String(item.category || '').trim() || '—';
}

export function inventoryStatus(item: Pick<CatalogItem, 'stockQuantity' | 'minStock'>): InventoryStatus {
  const qty = Number(item.stockQuantity || 0);
  const min = Number(item.minStock || 0);
  if (qty < 0) return 'negative';
  if (qty === 0) return 'out';
  if (min > 0 && qty <= min) return 'low';
  return 'ok';
}

export function inventoryStatusLabel(status: InventoryStatus): string {
  if (status === 'ok') return 'Correcto';
  if (status === 'low') return 'Bajo';
  if (status === 'out') return 'Sin stock';
  return 'Negativo';
}

export function inventoryStatusClass(status: InventoryStatus): string {
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (status === 'low') return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  if (status === 'out') return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  return 'bg-gray-900 text-white dark:bg-white dark:text-gray-900';
}

export function computeInventoryStats(items: CatalogItem[]) {
  let ok = 0;
  let low = 0;
  let out = 0;
  let negative = 0;
  let value = 0;
  for (const item of items) {
    const status = inventoryStatus(item);
    if (status === 'ok') ok += 1;
    else if (status === 'low') low += 1;
    else if (status === 'out') out += 1;
    else negative += 1;
    value += Number(item.stockQuantity || 0) * Number(item.costPrice || 0);
  }
  return {
    total: items.length,
    ok,
    low,
    out,
    negative,
    estimatedValue: Math.round(value * 100) / 100,
  };
}

export type InventoryOrganizerGroup = {
  id: string;
  label: string;
  /** Color de chip (hex). Vacío = look neutro; se configurará luego. */
  color?: string;
  stockCategory?: StockCategory;
  ok: number;
  low: number;
  out: number;
  negative: number;
  total: number;
};

export type InventoryCommercialBrand = {
  _id: string;
  name: string;
  deliveryLineKind?: string;
  /** Color de marca (hex); si existe, el chip del almacén lo usa. */
  primaryColor?: string;
};

/** Solo UI de almacén — no afecta TPV ni catálogo vendible. */
export const ORGANIZER_PACKAGING = 'packaging';
export const ORGANIZER_CLEANING = 'cleaning';
export const ORGANIZER_VARIOS = 'varios';
export const ORGANIZER_BEVERAGES = 'beverages';
export const ORGANIZER_COMPLEMENTS = 'complements';
export const ORGANIZER_TOTAL = 'total';

/** Prefijo de categorías creadas en Inventario (nunca van al TPV). */
export const INVENTORY_CUSTOM_CATEGORY_PREFIX = 'invcat:';

export function inventoryCustomCategoryId(label: string): string {
  const key = String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
  return `${INVENTORY_CUSTOM_CATEGORY_PREFIX}${key}`;
}

export function isInventoryCustomCategoryId(id: string): boolean {
  return String(id || '').startsWith(INVENTORY_CUSTOM_CATEGORY_PREFIX);
}

/** Etiquetas de categoría solo-almacén ya usadas (para el selector «Añadir categoría»). */
export const INVENTORY_WAREHOUSE_CATEGORY_PRESETS = [
  'Envases',
  'Limpieza',
  'Varios',
  'Bebidas',
  'Complementos',
] as const;

/** Categorías de la carta (module catalog) → deben salir en Inventario. */
export function listCartaCategoriesForInventory(allCatalogItems: CatalogItem[]): string[] {
  const byKey = new Map<string, string>();
  for (const item of allCatalogItems) {
    if (String(item.module || 'catalog') === 'stock') continue;
    if (item.active === false || item.deletedAt) continue;
    const cat = normalizeImportCategory(String(item.category || '').trim());
    if (!cat || isWarehouseImportCategory(cat)) continue;
    const key = cat.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, cat);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Solo almacén: presets + categorías creadas aquí (invcat). Nunca las de carta. */
export function listInventoryWarehouseCategoryLabels(stockItems: CatalogItem[]): string[] {
  const byKey = new Map<string, string>();
  for (const label of INVENTORY_WAREHOUSE_CATEGORY_PRESETS) {
    byKey.set(label.toLowerCase(), label);
  }
  for (const item of stockItems) {
    const id = String(item.customFields?.inventoryOrganizerId || '').trim();
    const cat = String(item.category || '').trim();
    if (isInventoryCustomCategoryId(id) && cat) {
      byKey.set(cat.toLowerCase(), cat);
      continue;
    }
    if (id === ORGANIZER_PACKAGING) byKey.set('envases', cat || 'Envases');
    else if (id === ORGANIZER_CLEANING) byKey.set('limpieza', cat || 'Limpieza');
    else if (id === ORGANIZER_VARIOS) byKey.set('varios', cat || 'Varios');
    else if (id === ORGANIZER_BEVERAGES) byKey.set('bebidas', cat || 'Bebidas');
    else if (id === ORGANIZER_COMPLEMENTS) byKey.set('complementos', cat || 'Complementos');
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Resuelve categoría al guardar artículo de inventario.
 * - Preset almacén (Envases…) → organizer fijo
 * - Categoría de carta → `cat:` (agrupa ingredientes; no crea nada en TPV)
 * - Nueva solo almacén → `invcat:` (nunca sale en TPV/carta)
 */
export function stockFieldsForWarehouseCategory(
  label: string,
  opts?: { cartaCategoryKeys?: Set<string> },
): {
  stockCategory: StockCategory;
  category: string;
  organizerId: string;
} {
  const category = normalizeImportCategory(String(label || '').trim().replace(/\s+/g, ' '));
  const folded = category
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (folded === 'envases' || folded === 'envase') {
    return { stockCategory: 'packaging', category: category || 'Envases', organizerId: ORGANIZER_PACKAGING };
  }
  if (folded === 'limpieza') {
    return { stockCategory: 'cleaning', category: category || 'Limpieza', organizerId: ORGANIZER_CLEANING };
  }
  if (folded === 'varios' || folded === 'consumibles' || folded === 'consumible') {
    return { stockCategory: 'consumable', category: category || 'Varios', organizerId: ORGANIZER_VARIOS };
  }
  if (folded === 'bebidas' || folded === 'bebida') {
    return { stockCategory: 'beverage', category: category || 'Bebidas', organizerId: ORGANIZER_BEVERAGES };
  }
  if (folded === 'complementos' || folded === 'complemento') {
    return { stockCategory: 'ingredient', category: category || 'Complementos', organizerId: ORGANIZER_COMPLEMENTS };
  }

  const cartaKeys = opts?.cartaCategoryKeys;
  if (cartaKeys && category && cartaKeys.has(category.toLowerCase())) {
    return {
      stockCategory: 'ingredient',
      category,
      organizerId: catalogCategoryOrganizerId(category),
    };
  }

  return {
    stockCategory: 'other',
    category,
    organizerId: inventoryCustomCategoryId(category),
  };
}

const FOOD_LINE_KIND_ORDER = [
  'pizza',
  'burger_fastfood',
  'tacos_mexican',
  'kebab',
  'tapas_bar',
  'sushi_asian',
  'prepared_meals',
  'cafe_bakery',
  'mixed_restaurant',
  'other',
] as const;

function countStatusForItems(items: CatalogItem[]) {
  let ok = 0;
  let low = 0;
  let out = 0;
  let negative = 0;
  for (const item of items) {
    const s = inventoryStatus(item);
    if (s === 'ok') ok += 1;
    else if (s === 'low') low += 1;
    else if (s === 'out') out += 1;
    else negative += 1;
  }
  return { ok, low, out, negative, total: items.length };
}

function normalizeBrandIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id || '').trim()).filter(Boolean);
}

function normalizeProductParts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => String(p || '').trim()).filter(Boolean);
}

function isPackagingStockItem(item: CatalogItem): boolean {
  return (item.stockCategory || '') === 'packaging';
}

function isCleaningStockItem(item: CatalogItem): boolean {
  return (item.stockCategory || '') === 'cleaning';
}

function isVariosStockItem(item: CatalogItem): boolean {
  const stockCat = item.stockCategory || 'other';
  return (
    stockCat === 'consumable' ||
    Boolean(String(item.customFields?.vertialStockTemplateId || '').trim())
  );
}

function isBeverageStockItem(item: CatalogItem): boolean {
  if ((item.stockCategory || '') === 'beverage') return true;
  const family = resolveTpvFamilyKey(String(item.category || ''));
  return family === 'bebidas';
}

/** Complementos de stock (patatas, nuggets…), no ingredientes de receta. */
function isComplementStockItem(item: CatalogItem): boolean {
  if (
    isPackagingStockItem(item) ||
    isCleaningStockItem(item) ||
    isVariosStockItem(item) ||
    isBeverageStockItem(item)
  ) {
    return false;
  }
  // Ligado a lista de ingredientes → receta, no organizador Complementos.
  if (String(item.customFields?.storeIngredientId || '').trim()) return false;

  const family = resolveTpvFamilyKey(String(item.category || ''));
  if (family === 'complementos') return true;
  if (family === 'bebidas' || family === 'cafes' || family === 'postres') return false;

  const blob = foldIngredientKey(`${item.category || ''} ${item.name || ''}`);
  if (/complemento|guarnicion|\bside\b|patata|nugget|tequeno|aros|onion.?ring|finger|alitas|wings|croqueta|entrante/.test(blob)) {
    return true;
  }
  if ((item.stockCategory || '') === 'finished_product') {
    if (/patata|nugget|tequeno|aros|onion|finger|alitas|wings|croqueta/.test(blob)) return true;
  }
  return false;
}

function foodLineLabel(brand: InventoryCommercialBrand, opts?: { omitBrandName?: boolean }): string {
  if (opts?.omitBrandName) return 'Ingredientes';
  const name = String(brand.name || '').trim() || 'Línea';
  return `Ingredientes · ${name}`;
}

function labelForOrganizerGroup(id: string, commercialBrands: InventoryCommercialBrand[]): string {
  if (isInventoryCustomCategoryId(id)) {
    const raw = id.slice(INVENTORY_CUSTOM_CATEGORY_PREFIX.length).trim();
    if (!raw) return 'Otros';
    return raw.replace(/^\w/u, (c) => c.toUpperCase());
  }
  if (isCatalogCategoryOrganizerId(id)) {
    const raw = id.slice('cat:'.length).trim();
    if (!raw) return 'Otros';
    return raw.replace(/^\w/u, (c) => c.toUpperCase());
  }
  if (id === ORGANIZER_BEVERAGES) return 'Bebidas';
  if (id === ORGANIZER_COMPLEMENTS) return 'Complementos';
  if (id === ORGANIZER_PACKAGING) return 'Envases';
  if (id === ORGANIZER_CLEANING) return 'Limpieza';
  if (id === ORGANIZER_VARIOS) return 'Varios';
  if (id === ORGANIZER_TOTAL) return 'Ingredientes';
  const brand = commercialBrands.find((b) => b._id === id);
  if (brand) {
    if (brand.deliveryLineKind === 'drinks_desserts') {
      return String(brand.name || '').trim() || 'Bebidas';
    }
    return foodLineLabel(brand);
  }
  return 'Otros';
}

/** Organizador de almacén al que pertenece un ingrediente TPV (marca/línea). */
export function resolveStoreIngredientOrganizerId(
  ing: StoreIngredient,
  commercialBrands: InventoryCommercialBrand[],
): string | null {
  const brandIds = normalizeBrandIdList(ing.brandIds);
  if (brandIds.length === 1) {
    const b = commercialBrands.find((x) => x._id === brandIds[0]);
    if (!b) return brandIds[0];
    if (b.deliveryLineKind === 'drinks_desserts') return ORGANIZER_BEVERAGES;
    return b._id;
  }
  if (brandIds.length > 1) {
    const food = commercialBrands.find(
      (b) => brandIds.includes(b._id) && b.deliveryLineKind !== 'drinks_desserts',
    );
    if (food) return food._id;
  }

  const parts = normalizeProductParts(ing.productParts);
  if (parts.length === 1 && parts[0] === 'pizzas') {
    const pizza = commercialBrands.find((b) => b.deliveryLineKind === 'pizza');
    if (pizza) return pizza._id;
  }
  if (parts.length === 1 && parts[0] === 'hamburguesas') {
    const burger = commercialBrands.find((b) => b.deliveryLineKind === 'burger_fastfood');
    if (burger) return burger._id;
  }
  return null;
}

/**
 * Opciones al crear artículo de almacén (incluye líneas vacías).
 * Con opts.inUseOrganizerIds, los genéricos (Bebidas, Envases…) se marcan
 * inUse=false si no tienen artículos — la UI los aparta en «Crear otro tipo».
 */
export function listInventoryOrganizerChoices(
  commercialBrands: InventoryCommercialBrand[] = [],
  opts?: { inUseOrganizerIds?: string[]; omitBrandInFoodLabels?: boolean },
): Array<{ id: string; label: string; inUse: boolean }> {
  const foodBrands = commercialBrands
    .filter((b) => b.deliveryLineKind !== 'drinks_desserts')
    .slice()
    .sort((a, b) => {
      const ia = FOOD_LINE_KIND_ORDER.indexOf(
        (a.deliveryLineKind || 'other') as (typeof FOOD_LINE_KIND_ORDER)[number],
      );
      const ib = FOOD_LINE_KIND_ORDER.indexOf(
        (b.deliveryLineKind || 'other') as (typeof FOOD_LINE_KIND_ORDER)[number],
      );
      const ra = ia < 0 ? 99 : ia;
      const rb = ib < 0 ? 99 : ib;
      if (ra !== rb) return ra - rb;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    });

  const inUseIds = opts?.inUseOrganizerIds ? new Set(opts.inUseOrganizerIds) : null;
  const genericInUse = (id: string) => (inUseIds ? inUseIds.has(id) : true);

  return [
    ...foodBrands.map((b) => ({
      id: b._id,
      label: foodLineLabel(b, { omitBrandName: opts?.omitBrandInFoodLabels }),
      // Con lista de uso: solo marcas que ya tienen artículos (como genéricos).
      inUse: inUseIds ? inUseIds.has(b._id) : true,
    })),
    { id: ORGANIZER_BEVERAGES, label: 'Bebidas', inUse: genericInUse(ORGANIZER_BEVERAGES) },
    { id: ORGANIZER_COMPLEMENTS, label: 'Complementos', inUse: genericInUse(ORGANIZER_COMPLEMENTS) },
    { id: ORGANIZER_PACKAGING, label: 'Envases', inUse: genericInUse(ORGANIZER_PACKAGING) },
    { id: ORGANIZER_CLEANING, label: 'Limpieza', inUse: genericInUse(ORGANIZER_CLEANING) },
    { id: ORGANIZER_VARIOS, label: 'Varios', inUse: genericInUse(ORGANIZER_VARIOS) },
  ];
}

/** Tipo almacén + categoría por defecto según organizador elegido. */
export function stockFieldsForOrganizer(organizerId: string): {
  stockCategory: StockCategory;
  category: string;
} {
  const id = String(organizerId || '').trim();
  if (id === ORGANIZER_BEVERAGES) return { stockCategory: 'beverage', category: 'Bebidas' };
  if (id === ORGANIZER_PACKAGING) return { stockCategory: 'packaging', category: 'Envases' };
  if (id === ORGANIZER_CLEANING) return { stockCategory: 'cleaning', category: 'Limpieza' };
  if (id === ORGANIZER_VARIOS) return { stockCategory: 'consumable', category: 'Varios' };
  if (id === ORGANIZER_COMPLEMENTS) return { stockCategory: 'ingredient', category: 'Complementos' };
  return { stockCategory: 'ingredient', category: 'Ingredientes' };
}

/**
 * Solo agrupación visual de almacén.
 * No cambia catálogo TPV, precios ni descuento de stock.
 */
export function resolveInventoryOrganizerId(
  item: CatalogItem,
  storeIngredientsById: Map<string, StoreIngredient>,
  storeIngredientsByName: Map<string, StoreIngredient>,
  commercialBrands: InventoryCommercialBrand[],
): string {
  const pinned = String(item.customFields?.inventoryOrganizerId || '').trim();
  if (pinned) return pinned;

  if (isPackagingStockItem(item)) return ORGANIZER_PACKAGING;
  if (isCleaningStockItem(item)) return ORGANIZER_CLEANING;
  if (isVariosStockItem(item)) return ORGANIZER_VARIOS;
  if (isBeverageStockItem(item)) return ORGANIZER_BEVERAGES;

  const ingId = String(item.customFields?.storeIngredientId || '').trim();
  const ing =
    (ingId ? storeIngredientsById.get(ingId) : undefined) ||
    storeIngredientsByName.get(foldIngredientKey(item.name));

  if (ing) {
    const lineId = resolveStoreIngredientOrganizerId(ing, commercialBrands);
    if (lineId) return lineId;
  }

  if (isComplementStockItem(item)) return ORGANIZER_COMPLEMENTS;

  // Una sola línea de comida (p. ej. Modomio): sin vínculo TPV → va a esa línea, no a un chip «Ingredientes» fantasma.
  const foodBrands = commercialBrands.filter((b) => b.deliveryLineKind !== 'drinks_desserts');
  if (foodBrands.length === 1) return foodBrands[0]._id;

  return ORGANIZER_TOTAL;
}

function leftoverOrganizerGroups(
  buckets: Map<string, CatalogItem[]>,
  commercialBrands: InventoryCommercialBrand[],
): InventoryOrganizerGroup[] {
  const groups: InventoryOrganizerGroup[] = [];
  for (const [id, subset] of buckets) {
    if (!subset.length) continue;
    const customLabel =
      isInventoryCustomCategoryId(id) || isCatalogCategoryOrganizerId(id)
        ? String(subset[0]?.category || '').trim()
        : '';
    groups.push({
      id,
      label: customLabel || labelForOrganizerGroup(id, commercialBrands),
      ...countStatusForItems(subset),
    });
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
}

/**
 * Organizadores del almacén ordenados A→Z por etiqueta.
 * Las marcas comerciales (Burger, Tacos…) son de facturación/TPV: no salen como chips.
 */
export function buildInventoryOrganizerGroups(
  items: CatalogItem[],
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): InventoryOrganizerGroup[] {
  const byId = new Map<string, StoreIngredient>();
  const byName = new Map<string, StoreIngredient>();
  for (const ing of storeIngredients) {
    if (ing.id) byId.set(ing.id, ing);
    byName.set(foldIngredientKey(ing.name), ing);
  }

  const buckets = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const id = resolveInventoryOrganizerId(item, byId, byName, commercialBrands);
    const arr = buckets.get(id) || [];
    arr.push(item);
    buckets.set(id, arr);
  }

  // Marcas → «Ingredientes» (no chips Burger/Tacos/…).
  const brandIds = new Set(
    commercialBrands.map((b) => String(b._id || '').trim()).filter(Boolean),
  );
  for (const brandId of brandIds) {
    const subset = buckets.get(brandId);
    if (subset?.length) {
      const merged = buckets.get(ORGANIZER_TOTAL) || [];
      merged.push(...subset);
      buckets.set(ORGANIZER_TOTAL, merged);
    }
    buckets.delete(brandId);
  }

  const extras: InventoryOrganizerGroup[] = [];
  const bev = buckets.get(ORGANIZER_BEVERAGES);
  if (bev?.length) {
    extras.push({ id: ORGANIZER_BEVERAGES, label: 'Bebidas', ...countStatusForItems(bev) });
    buckets.delete(ORGANIZER_BEVERAGES);
  }
  const comp = buckets.get(ORGANIZER_COMPLEMENTS);
  if (comp?.length) {
    extras.push({ id: ORGANIZER_COMPLEMENTS, label: 'Complementos', ...countStatusForItems(comp) });
    buckets.delete(ORGANIZER_COMPLEMENTS);
  }
  const pack = buckets.get(ORGANIZER_PACKAGING);
  if (pack?.length) {
    extras.push({ id: ORGANIZER_PACKAGING, label: 'Envases', ...countStatusForItems(pack) });
    buckets.delete(ORGANIZER_PACKAGING);
  }
  const clean = buckets.get(ORGANIZER_CLEANING);
  if (clean?.length) {
    extras.push({ id: ORGANIZER_CLEANING, label: 'Limpieza', ...countStatusForItems(clean) });
    buckets.delete(ORGANIZER_CLEANING);
  }
  const varios = buckets.get(ORGANIZER_VARIOS);
  if (varios?.length) {
    extras.push({ id: ORGANIZER_VARIOS, label: 'Varios', ...countStatusForItems(varios) });
    buckets.delete(ORGANIZER_VARIOS);
  }

  const leftoverGroups = leftoverOrganizerGroups(buckets, commercialBrands).filter((g) => {
    // Ocultar «Ingredientes» genérico vacío si ya hay chips de tipo.
    if (g.id === ORGANIZER_TOTAL && g.total === 0 && extras.length > 0) {
      return false;
    }
    return true;
  });

  const byLabel = (a: InventoryOrganizerGroup, b: InventoryOrganizerGroup) =>
    a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });

  if (extras.length === 0) {
    if (leftoverGroups.length === 1 && leftoverGroups[0].id === ORGANIZER_TOTAL) {
      return [];
    }
    return leftoverGroups.sort(byLabel);
  }

  return [...extras, ...leftoverGroups].sort(byLabel);
}

export function filterItemsByOrganizer(
  items: CatalogItem[],
  organizerId: string,
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): CatalogItem[] {
  if (!organizerId || organizerId === 'all') return items;
  const byId = new Map<string, StoreIngredient>();
  const byName = new Map<string, StoreIngredient>();
  for (const ing of storeIngredients) {
    if (ing.id) byId.set(ing.id, ing);
    byName.set(foldIngredientKey(ing.name), ing);
  }
  const brandIds = new Set(
    commercialBrands.map((b) => String(b._id || '').trim()).filter(Boolean),
  );
  return items.filter((item) => {
    const id = resolveInventoryOrganizerId(item, byId, byName, commercialBrands);
    if (id === organizerId) return true;
    // Chip «Ingredientes»: incluye lo que antes iba a marca.
    if (organizerId === ORGANIZER_TOTAL && brandIds.has(id)) return true;
    return false;
  });
}

export function movementTypeLabel(type: MovementType | string): string {
  const map: Record<string, string> = {
    purchase_reception: 'Entrada compra',
    sale: 'Venta',
    internal_consumption: 'Consumo interno',
    adjustment_in: 'Entrada',
    adjustment_out: 'Salida',
    transfer: 'Transferencia',
    transfer_out: 'Traspaso salida (a otra tienda)',
    transfer_in: 'Traspaso entrada (de otra tienda)',
    return_supplier: 'Devolución proveedor',
    return_customer: 'Devolución cliente',
    initial: 'Stock inicial',
  };
  return map[String(type)] || String(type);
}

export function formatInventoryMoney(value: number): string {
  return `${value.toFixed(2)} €`;
}

export type PurchaseSuggestion = {
  quantity: number;
  stockAfter: number;
};

/** Cantidad sugerida para reponer stock bajo o agotado. */
export function computePurchaseSuggestion(
  item: Pick<CatalogItem, 'stockQuantity' | 'minStock' | 'reorderQuantity'>,
): PurchaseSuggestion {
  const current = Number(item.stockQuantity || 0);
  const min = Number(item.minStock || 0);
  const reorder = Number(item.reorderQuantity || 0);

  let quantity = 0;

  if (min > 0 && current < min) {
    quantity = Math.ceil(min - current);
  } else if (current <= 0) {
    quantity = Math.max(reorder || min || 1, 1);
  } else {
    quantity = Math.max(reorder || 1, 1);
  }

  if (current <= 0 && reorder > 0) {
    quantity = Math.max(quantity, reorder);
  }

  quantity = Math.ceil(Math.max(quantity, 1));
  return { quantity, stockAfter: current + quantity };
}
