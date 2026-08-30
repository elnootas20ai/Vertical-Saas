import { isDefaultCommercialBrand, sortBrandsForDisplay } from './brandUtils';
import {
  mergeStoreIngredientNames,
  isIngredientMetaLabel,
  parseIngredientsBulkText,
  resolveBrandTpvCategoryKeys,
  resolveIngredientRole,
  type StoreIngredient,
  type TpvCategoryTemplateKey,
} from './catalogCustomization';
import type { CatalogItem } from './deliveryApi';
import { getDeliveryBrandLinePreset, UNIVERSAL_CATALOG_CATEGORIES } from './deliveryBrandLineKinds';
import { restaurantBrandCategoriesFromCatalogOnly } from '../verticals/restaurant/restaurantBrandCatalogPolicy';
import { normalizeSubfamilyCategory, resolveTpvFamilyKey } from './tpvCatalogFamilies';

export type ImportBrandLike = {
  _id: string;
  id?: string;
  name: string;
  active?: boolean;
  isDefault?: boolean;
  deliveryLineKind?: string;
  catalogCategories?: string[];
};

function foldKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Línea comercial = organizador del TPV (modomio, Sushi…), no marca de producto (Coca-Cola). */
export function isCommercialLineBrand(
  brand: Pick<ImportBrandLike, 'deliveryLineKind' | 'catalogCategories' | 'isDefault' | 'name'>,
): boolean {
  if (isDefaultCommercialBrand(brand)) return true;
  if (String(brand.deliveryLineKind || '').trim()) return true;
  if ((brand.catalogCategories?.length ?? 0) > 0) return true;
  return false;
}

export function commercialLineBrands<T extends ImportBrandLike>(brands: T[]): T[] {
  return brands.filter((b) => b.active !== false && isCommercialLineBrand(b));
}

/** Líneas comerciales incl. inactivas (import + plantilla deben verlas todas). */
export function allCommercialLineBrands<T extends ImportBrandLike>(brands: T[]): T[] {
  return brands.filter((b) => isCommercialLineBrand(b));
}

/** Líneas TPV para la plantilla Excel (sin «General» si hay otras líneas nombradas). */
export function organizerBrandsForCatalogTemplate<T extends ImportBrandLike>(brands: T[]): T[] {
  const commercial = allCommercialLineBrands(brands);
  const named = commercial.filter((b) => !isDefaultCommercialBrand(b));
  const pool = named.length > 0 ? named : commercial.filter((b) => b.active !== false);
  return sortBrandsForDisplay(pool);
}

/** Columna del Excel: línea / organizador TPV (no marca de fábrica del producto). */
const EMPTY_LINEA_PLACEHOLDERS = new Set(
  [
    'dejar linea vacia',
    'dejar linea vacía',
    'dejar línea vacía',
    'linea vacia',
    'linea vacía',
    'línea vacía',
    'vacio',
    'vacío',
    '(vacio)',
    '(vacío)',
    '-',
    '—',
    'n/a',
    'na',
  ].map((s) => s.toLowerCase()),
);

/** Textos de ayuda de la plantilla («Dejar linea vacía») → sin línea comercial. */
export function normalizeImportLineText(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (EMPTY_LINEA_PLACEHOLDERS.has(raw.toLowerCase())) return '';
  if (/^dejar\s+l[ií]nea\s+vac[ií]a$/i.test(raw)) return '';
  return raw;
}

export function readImportLineText(entry: Record<string, string | unknown>): string {
  for (const key of ['linea', 'línea', 'linea_comercial', 'organizador', 'marca', 'brand']) {
    const value = normalizeImportLineText(String(entry[key] ?? ''));
    if (value) return value;
  }
  return '';
}

const IMPORT_CATEGORY_ALIASES: Record<string, string> = {
  bebidas: 'Bebidas',
  bebida: 'Bebidas',
  refrescos: 'Bebidas',
  refresco: 'Bebidas',
  cervezas: 'Bebidas',
  cerveza: 'Bebidas',
  zumos: 'Bebidas',
  zumo: 'Bebidas',
  drinks: 'Bebidas',
  drink: 'Bebidas',
  beverages: 'Bebidas',
  beverage: 'Bebidas',
  sodas: 'Bebidas',
  soda: 'Bebidas',
  sides: 'Complementos',
  side: 'Complementos',
  guarniciones: 'Complementos',
  guarnicion: 'Complementos',
  complementos: 'Complementos',
  complemento: 'Complementos',
  postres: 'Postres',
  postre: 'Postres',
  extras: 'Extras',
  otros: 'Otros',
  pizzas: 'Pizzas',
  pizza: 'Pizzas',
  entrantes: 'Entrantes',
  entrante: 'Entrantes',
  principales: 'Principales',
  burgers: 'Burgers',
  burger: 'Burgers',
  hamburguesas: 'Hamburguesas',
  hamburguesa: 'Hamburguesas',
  tapas: 'Tapas',
  tapa: 'Tapas',
  raciones: 'Raciones',
  racion: 'Raciones',
  'ración': 'Raciones',
  bocadillos: 'Bocadillos',
  bocadillo: 'Bocadillos',
  montaditos: 'Montadillos',
  montadito: 'Montadillos',
  pinchos: 'Pinchos',
  pincho: 'Pinchos',
  tacos: 'Tacos',
  taco: 'Tacos',
  burritos: 'Tacos',
  burrito: 'Tacos',
  quesadillas: 'Tacos',
  quesadilla: 'Tacos',
  nachos: 'Complementos',
  rolls: 'Rolls',
  bowls: 'Bowls',
  cafe: 'Café',
  café: 'Café',
  bolleria: 'Bollería',
  bollería: 'Bollería',
  combos: 'Combos',
  combo: 'Combos',
  menus: 'Combos',
  menu: 'Combos',
  menú: 'Combos',
  'menu del dia': 'Combos',
  'menú del día': 'Combos',
  // Heladería
  sabores: 'Sabores',
  sabor: 'Sabores',
  helados: 'Sabores',
  helado: 'Sabores',
  tarrinas: 'Tarrinas',
  tarrina: 'Tarrinas',
  conos: 'Conos',
  cono: 'Conos',
  cucuruchos: 'Conos',
  cucurucho: 'Conos',
  batidos: 'Batidos',
  batido: 'Batidos',
  milkshakes: 'Batidos',
  milkshake: 'Batidos',
  toppings: 'Toppings',
  topping: 'Toppings',
  extras_helado: 'Toppings',
  encargos: 'Encargos',
  encargo: 'Encargos',
  tartas: 'Encargos',
  tarta: 'Encargos',
  // Almacén (no TPV)
  envases: 'Envases',
  envase: 'Envases',
  packaging: 'Envases',
  packing: 'Envases',
  embalaje: 'Envases',
  embalajes: 'Envases',
  papel: 'Envases',
  limpieza: 'Limpieza',
  cleaning: 'Limpieza',
  higienico: 'Limpieza',
  higienicos: 'Limpieza',
  'higiénico': 'Limpieza',
  'higiénicos': 'Limpieza',
  varios: 'Varios',
  consumibles: 'Varios',
  consumible: 'Varios',
  consumable: 'Varios',
  consumables: 'Varios',
};

/** Categorías de Excel / sync almacén → solo almacén (no aparecen en TPV ni chips de carta). */
export const WAREHOUSE_IMPORT_CATEGORIES = ['Envases', 'Limpieza', 'Varios', 'Ingredientes'] as const;

export type WarehouseImportStockCategory = 'packaging' | 'cleaning' | 'consumable' | 'ingredient';

export function isWarehouseImportCategory(category: string): boolean {
  const key = foldKey(normalizeImportCategory(category));
  if (!key) return false;
  if (key === 'envases' || key === 'limpieza' || key === 'varios') return true;
  // Sync escandallo → almacén crea «Ingredientes» / «Ingredientes · Marca». Nunca carta/TPV.
  if (key === 'ingredientes' || key.startsWith('ingredientes ') || key.startsWith('ingredientes·')) {
    return true;
  }
  return false;
}

/** Prefijo de organizador = categoría de catálogo (chips del producto → proveedor). */
export const CATALOG_CATEGORY_ORGANIZER_PREFIX = 'cat:';

export function catalogCategoryOrganizerId(category: string): string {
  const label = normalizeImportCategory(category);
  const key = foldKey(label);
  return key ? `${CATALOG_CATEGORY_ORGANIZER_PREFIX}${key}` : '';
}

export function isCatalogCategoryOrganizerId(organizerId: string): boolean {
  return String(organizerId || '').startsWith(CATALOG_CATEGORY_ORGANIZER_PREFIX);
}

export function catalogCategoryKeyFromOrganizerId(organizerId: string): string {
  const raw = String(organizerId || '').trim();
  if (!isCatalogCategoryOrganizerId(raw)) return '';
  return raw.slice(CATALOG_CATEGORY_ORGANIZER_PREFIX.length);
}

/**
 * Categorías del catálogo (marcas + productos) como opciones de «Qué te vende».
 * Misma conexión que chips al crear producto → desplegable del proveedor.
 */
export function listCatalogCategoryOrganizerChoices(
  brands: Array<{ catalogCategories?: string[]; deliveryLineKind?: string } | null | undefined> = [],
  catalogItems: Array<{
    category?: string;
    active?: boolean;
    deletedAt?: string | null;
    module?: string;
  } | null | undefined> = [],
  options?: { businessType?: string | null },
): Array<{ id: string; label: string }> {
  const skipLineKindPresets = restaurantBrandCategoriesFromCatalogOnly(options?.businessType);
  const labelByKey = new Map<string, string>();
  const add = (raw: string) => {
    const label = normalizeImportCategory(raw);
    if (!label || isWarehouseImportCategory(label)) return;
    const key = foldKey(label);
    if (!key) return;
    if (!labelByKey.has(key)) labelByKey.set(key, label);
  };
  for (const u of UNIVERSAL_CATALOG_CATEGORIES) add(u);
  for (const b of brands || []) {
    for (const c of b?.catalogCategories ?? []) add(String(c || ''));
    if (!skipLineKindPresets) {
      const preset = getDeliveryBrandLinePreset(String(b?.deliveryLineKind || '').trim());
      for (const c of preset?.typicalCategories ?? []) add(String(c || ''));
    }
  }
  for (const item of catalogItems || []) {
    if (!item || item.deletedAt || item.active === false) continue;
    // Solo carta: categorías de almacén (invcat / module stock) no entran al TPV ni a «Qué te vende» como carta.
    if (String(item.module || 'catalog') === 'stock') continue;
    add(String(item.category || ''));
  }
  return [...labelByKey.entries()]
    .map(([key, label]) => ({ id: `${CATALOG_CATEGORY_ORGANIZER_PREFIX}${key}`, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/** stockCategory + organizador de Inventario según categoría Excel. */
export function resolveWarehouseImportMeta(category: string): {
  stockCategory: WarehouseImportStockCategory;
  categoryLabel: string;
  organizerId: 'packaging' | 'cleaning' | 'varios';
} | null {
  const key = foldKey(normalizeImportCategory(category));
  if (key === 'envases') {
    return { stockCategory: 'packaging', categoryLabel: 'Envases', organizerId: 'packaging' };
  }
  if (key === 'limpieza') {
    return { stockCategory: 'cleaning', categoryLabel: 'Limpieza', organizerId: 'cleaning' };
  }
  if (key === 'varios') {
    return { stockCategory: 'consumable', categoryLabel: 'Varios', organizerId: 'varios' };
  }
  return null;
}

export function isImportComboCategory(category: string): boolean {
  return foldKey(normalizeImportCategory(category)) === 'combos';
}

export function normalizeImportCategory(
  value: string,
  options?: { preserveSubfamilies?: boolean },
): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (options?.preserveSubfamilies) {
    const sub = normalizeSubfamilyCategory(raw);
    if (sub) return sub;
  }
  const alias = IMPORT_CATEGORY_ALIASES[foldKey(raw)];
  if (alias) {
    // Con subfamilias: no aplastar Cervezas/Refrescos → Bebidas.
    if (
      options?.preserveSubfamilies
      && foldKey(alias) === 'bebidas'
      && foldKey(raw) !== 'bebidas'
      && foldKey(raw) !== 'bebida'
    ) {
      return raw.replace(/^\w/, (c) => c.toUpperCase());
    }
    return alias;
  }
  return raw;
}

function compactFoldKey(s: string): string {
  return foldKey(s).replace(/[^a-z0-9]/g, '');
}

function matchCommercialLinePart(part: string, searchIn: ImportBrandLike[]): ImportBrandLike | undefined {
  const key = foldKey(part);
  if (!key) return undefined;

  const byId = searchIn.find((b) => b._id === part || b.id === part);
  if (byId) return byId;

  const exact = searchIn.find((b) => foldKey(b.name) === key);
  if (exact) return exact;

  const compactPart = compactFoldKey(part);
  if (!compactPart) return undefined;

  const partial = searchIn.filter((b) => {
    const compactName = compactFoldKey(b.name);
    if (!compactName) return false;
    return compactName.includes(compactPart) || compactPart.includes(compactName);
  });
  if (partial.length === 1) return partial[0];
  return undefined;
}

export function resolveCommercialLineIdsFromText(
  lineText: string,
  brands: ImportBrandLike[],
): { brandIds: string[]; unmatchedNames: string[] } {
  const raw = String(lineText || '').trim();
  if (!raw) return { brandIds: [], unmatchedNames: [] };

  const matchPool = allCommercialLineBrands(brands);
  const searchIn = matchPool.length > 0 ? matchPool : brands.filter((b) => b.active !== false);

  const parts = raw.split(/[,;|]/).map((p) => p.trim()).filter(Boolean);
  const brandIds: string[] = [];
  const unmatchedNames: string[] = [];

  for (const part of parts) {
    const hit = matchCommercialLinePart(part, searchIn);
    if (!hit) {
      unmatchedNames.push(part);
      continue;
    }
    if (hit._id && !brandIds.includes(hit._id)) brandIds.push(hit._id);
  }

  return { brandIds, unmatchedNames };
}

export function shouldClearBrandForCategory(category: string): boolean {
  const family = resolveTpvFamilyKey(category);
  if (family === 'bebidas' || family === 'postres' || family === 'complementos' || family === 'cafes') {
    return true;
  }
  const c = foldKey(normalizeImportCategory(category));
  return (
    c === 'bebidas' ||
    c === 'bebida' ||
    c === 'complementos' ||
    c === 'complemento' ||
    c === 'extras' ||
    c === 'postres' ||
    c === 'postre' ||
    c === 'salsas' ||
    c === 'otros'
  );
}

export function defaultBrandIdForCatalogImport(brands: ImportBrandLike[]): string {
  const active = brands.filter((b) => b.active !== false);
  const commercial = commercialLineBrands(active);
  const sorted = sortBrandsForDisplay(commercial.length > 0 ? commercial : active);
  const pick = sorted.find((b) => isDefaultCommercialBrand(b)) ?? sorted[0];
  return pick?._id ?? '';
}

function brandHasCatalogCategory(
  brand: ImportBrandLike,
  category: string,
): boolean {
  const catKey = foldKey(category);
  return (brand.catalogCategories ?? []).some((c) => foldKey(c) === catKey);
}

/** Si el nombre del producto incluye el nombre de una línea comercial (p. ej. BlackBurger → blackburger). */
export function inferCommercialLineBrandIdFromProductName(
  productName: string,
  brands: ImportBrandLike[],
): string {
  const commercial = allCommercialLineBrands(brands);
  const nameKey = foldKey(productName);
  if (!nameKey) return '';

  let bestId = '';
  let bestLen = 0;
  for (const brand of commercial) {
    const brandKey = foldKey(brand.name);
    if (brandKey.length < 4) continue;
    if (nameKey.includes(brandKey) && brandKey.length > bestLen) {
      bestId = brand._id;
      bestLen = brandKey.length;
    }
  }
  if (bestId) return bestId;

  if (/black\s*burger|\bburger\b|hamburguesa/.test(nameKey)) {
    const burgerLines = commercial.filter((b) => b.deliveryLineKind === 'burger_fastfood');
    if (burgerLines.length === 1) return burgerLines[0]._id;
    const named = burgerLines.find((b) => /black|burger/.test(foldKey(b.name)));
    if (named?._id) return named._id;
  }

  if (/pizza|focaccia|bruschetta|calzone/.test(nameKey)) {
    const pizzaLine = commercial.find((b) => b.deliveryLineKind === 'pizza');
    if (pizzaLine?._id) return pizzaLine._id;
  }

  if (/kebab|doner|döner|durum|shawarma|gyros/.test(nameKey)) {
    const kebabLines = commercial.filter((b) => b.deliveryLineKind === 'kebab');
    if (kebabLines.length === 1) return kebabLines[0]._id;
    const named = kebabLines.find((b) => /kebab|doner|döner/.test(foldKey(b.name)));
    if (named?._id) return named._id;
  }

  if (/taco|burrito|quesadilla|nachos|mexican|pastor|carnitas|barbacoa|guacamole/.test(nameKey)) {
    const tacoLines = commercial.filter((b) => b.deliveryLineKind === 'tacos_mexican');
    if (tacoLines.length === 1) return tacoLines[0]._id;
    const named = tacoLines.find((b) => /taco|mex/.test(foldKey(b.name)));
    if (named?._id) return named._id;
  }

  if (/tapa|tapas|racion|ración|pincho/.test(nameKey)) {
    const tapasLines = commercial.filter((b) => b.deliveryLineKind === 'tapas_bar');
    if (tapasLines.length === 1) return tapasLines[0]._id;
    const named = tapasLines.find((b) => /bar|tapa/.test(foldKey(b.name)));
    if (named?._id) return named._id;
  }

  return '';
}

export function inferCommercialLineBrandId(
  category: string,
  brands: ImportBrandLike[],
  productName = '',
): string {
  const commercialActive = commercialLineBrands(brands.filter((b) => b.active !== false));
  const commercialAll = allCommercialLineBrands(brands);
  const pool = commercialActive.length > 0 ? commercialActive : commercialAll;
  if (pool.length === 0) return '';

  const fromName = inferCommercialLineBrandIdFromProductName(productName, commercialAll);
  if (fromName) return fromName;

  const catKey = foldKey(category);
  const byName = pool.find((b) => foldKey(b.name) === catKey);
  if (byName?._id) return byName._id;

  if (catKey === 'pizzas' || catKey === 'pizza') {
    const pizzaLine =
      pool.find((b) => b.deliveryLineKind === 'pizza')
      ?? pool.find((b) => /pizza|modomio/.test(foldKey(b.name)));
    if (pizzaLine?._id) return pizzaLine._id;
  }

  if (catKey === 'burgers' || catKey === 'hamburguesas' || catKey === 'burger') {
    const burgerLine =
      pool.find((b) => b.deliveryLineKind === 'burger_fastfood')
      ?? pool.find((b) => /black\s*burger|blackburger|burger/.test(foldKey(b.name)));
    if (burgerLine?._id) return burgerLine._id;
  }

  if (catKey === 'tacos' || catKey === 'taco') {
    const tacoLine =
      pool.find((b) => b.deliveryLineKind === 'tacos_mexican')
      ?? pool.find((b) => /taco|mex/.test(foldKey(b.name)));
    if (tacoLine?._id) return tacoLine._id;
  }

  if (catKey === 'kebab' || catKey === 'kebabs' || catKey === 'doner') {
    const kebabLine =
      pool.find((b) => b.deliveryLineKind === 'kebab')
      ?? pool.find((b) => /kebab|doner|döner/.test(foldKey(b.name)));
    if (kebabLine?._id) return kebabLine._id;
  }

  if (catKey === 'tapas' || catKey === 'tapa' || catKey === 'raciones' || catKey === 'racion') {
    const tapasLine =
      pool.find((b) => b.deliveryLineKind === 'tapas_bar')
      ?? pool.find((b) => /bar|tapa/.test(foldKey(b.name)));
    if (tapasLine?._id) return tapasLine._id;
  }

  const byCatalogCat = commercialAll.filter((b) => brandHasCatalogCategory(b, category));
  if (byCatalogCat.length === 1) return byCatalogCat[0]._id;
  if (byCatalogCat.length > 1) {
    const nonDefault = byCatalogCat.find((b) => !isDefaultCommercialBrand(b));
    return (nonDefault ?? byCatalogCat[0])._id;
  }

  const kindHints: Record<string, string[]> = {
    pizzas: ['pizza'],
    hamburguesas: ['burger_fastfood', 'kebab'],
    burgers: ['burger_fastfood', 'kebab'],
    tacos: ['tacos_mexican'],
    taco: ['tacos_mexican'],
    kebab: ['kebab'],
    kebabs: ['kebab'],
    tapas: ['tapas_bar'],
    tapa: ['tapas_bar'],
    raciones: ['tapas_bar'],
    rolls: ['sushi_asian'],
    bowls: ['sushi_asian'],
    bebidas: ['drinks_desserts'],
    postres: ['drinks_desserts'],
    complementos: ['drinks_desserts', 'mixed_restaurant', 'prepared_meals'],
    entrantes: ['mixed_restaurant', 'prepared_meals', 'pizza', 'burger_fastfood', 'sushi_asian'],
    principales: ['mixed_restaurant', 'prepared_meals', 'burger_fastfood'],
  };

  const kinds = kindHints[catKey] || [];
  const kindHits = pool.filter((b) => kinds.includes(String(b.deliveryLineKind || '')));
  if (kindHits.length === 1) return kindHits[0]._id;
  if (kindHits.length > 1) {
    const nonDefault = kindHits.find((b) => !isDefaultCommercialBrand(b));
    return (nonDefault ?? kindHits[0])._id;
  }

  return '';
}

export function resolveCatalogImportBrandIds(
  explicitBrandIds: string[],
  category: string,
  brands: ImportBrandLike[],
  productName = '',
): string[] {
  // Envases / Limpieza / Varios → almacén, sin pestaña TPV.
  if (isWarehouseImportCategory(category)) return [];

  // El Excel manda: la columna «linea» explícita siempre gana sobre cualquier
  // heurística. Las inferencias por nombre/categoría son solo para filas sin línea.
  if (explicitBrandIds.length > 0) return explicitBrandIds;

  const fromProductName = inferCommercialLineBrandIdFromProductName(productName, brands);
  if (fromProductName) return [fromProductName];

  const active = brands.filter((b) => b.active !== false);
  const commercial = commercialLineBrands(active);
  const defaultId = defaultBrandIdForCatalogImport(brands);

  // Una sola línea comercial activa: comida, bebida, postre… pertenecen a esa marca.
  // Si se vacían brandIds en bebidas/postres, la pestaña de marca queda rota en el TPV.
  if (commercial.length <= 1) {
    return defaultId ? [defaultId] : [];
  }

  if (shouldClearBrandForCategory(category)) return [];

  const inferred = inferCommercialLineBrandId(category, brands, productName);
  if (inferred) return [inferred];

  return defaultId ? [defaultId] : [];
}

/** Nombres de líneas comerciales configuradas (pestañas TPV en Ajustes → Marca). */
export function formatConfiguredCommercialLineNames(brands: ImportBrandLike[], limit = 5): string {
  const names = allCommercialLineBrands(brands)
    .map((b) => String(b.name || '').trim())
    .filter(Boolean);
  if (names.length === 0) return 'ninguna — créalas en Ajustes → Marca';
  const shown = names.slice(0, limit);
  const extra = names.length > limit ? ` (+${names.length - limit} más)` : '';
  return `${shown.join(', ')}${extra}`;
}

/** Código de aviso: columna «línea» del Excel no coincide con ninguna marca. */
export const MISSING_BRAND_IMPORT_CODE = 'missing_brand' as const;

/** Aviso por fila cuando la columna «línea» del Excel no existe en Ajustes → Marca. */
export function formatUnmatchedImportLineRowWarning(
  unmatchedLineName: string,
  brands: ImportBrandLike[],
): string {
  const configured = formatConfiguredCommercialLineNames(brands);
  return (
    `En «línea» pusiste «${unmatchedLineName}», pero esa pestaña no existe en Ajustes → Marca. ` +
    `Líneas que sí tienes: ${configured}. ` +
    'El producto se importa igual en la pestaña de su categoría. ' +
    'Para corregirlo: escribe en el Excel el nombre exacto de una línea existente, o créala en Ajustes → Marca.'
  );
}

/**
 * Aviso claro y resumido: falta una marca concreta.
 * Pensado para el informe de importación (1 bloque por marca, no 1 por fila).
 */
export function formatMissingBrandImportNotice(
  brandName: string,
  productCount: number,
  brands: ImportBrandLike[] = [],
): string {
  const name = String(brandName || '').trim() || 'desconocida';
  const count = Math.max(1, productCount);
  const countPart =
    count === 1
      ? '1 producto se importó sin pestaña de marca'
      : `${count} productos se importaron sin pestaña de marca`;
  const configured = brands.length > 0 ? formatConfiguredCommercialLineNames(brands, 8) : '';
  const configuredHint = configured ? ` Ahora tienes: ${configured}.` : '';
  return (
    `Falta la marca «${name}» en Ajustes → Marca. ${countPart}.${configuredHint} ` +
    'Crea la marca o cambia la columna línea en el Excel.'
  );
}

export function formatUnmatchedCommercialBrandWarning(
  unmatchedNames: string[],
  brands: ImportBrandLike[] = [],
): string | null {
  const counts = new Map<string, number>();
  for (const raw of unmatchedNames) {
    const key = String(raw || '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()]
    .map(([name, count]) => formatMissingBrandImportNotice(name, count, brands))
    .join(' ');
}

/** Extrae el nombre de marca de un aviso legacy de «línea» no encontrada. */
export function extractMissingBrandNameFromWarningMessage(message: string): string | null {
  const text = String(message || '');
  const modern = text.match(/Falta la marca «([^»]+)»/i);
  if (modern?.[1]) return modern[1].trim();
  const legacy = text.match(/pusiste «([^»]+)»/i);
  if (legacy?.[1]) return legacy[1].trim();
  const quoted = text.match(/«línea»\s*=\s*([^,]+)/i);
  if (quoted?.[1]) return quoted[1].trim();
  return null;
}

export function buildBrandCategoryMapFromItems(
  items: Array<{ brandIds?: string[]; category?: string; module?: string }>,
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const item of items) {
    if (String(item.module || '').trim() === 'stock') continue;
    const cat = normalizeImportCategory(String(item.category || ''));
    if (!cat || isWarehouseImportCategory(cat)) continue;
    for (const brandId of item.brandIds || []) {
      if (!map.has(brandId)) map.set(brandId, new Set());
      map.get(brandId)!.add(cat);
    }
  }
  const out = new Map<string, string[]>();
  for (const [brandId, cats] of map) {
    out.set(brandId, [...cats].sort((a, b) => a.localeCompare(b, 'es')));
  }
  return out;
}

export function mergeBrandCatalogCategories(existing: string[] | undefined, imported: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    if (isWarehouseImportCategory(trimmed)) return;
    const key = foldKey(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  for (const cat of existing || []) add(cat);
  for (const cat of imported) add(cat);
  return out;
}

export function parseCatalogImportStockFields(entry: Record<string, string>) {
  const stockRaw = String(entry.stockQuantity || entry.stock_actual || entry.stock || '').trim();
  const minStockRaw = String(entry.minStock || entry.stock_minimo || '').trim();
  const stockQuantity = stockRaw ? Number(stockRaw.replace(',', '.')) : 0;
  const minStock = minStockRaw ? Number(minStockRaw.replace(',', '.')) : 0;
  const unit = String(entry.unit || entry.unidad || 'ud').trim() || 'ud';
  const tracksStock = stockRaw !== '' || minStockRaw !== '' || stockQuantity > 0 || minStock > 0;

  return {
    stockQuantity: Number.isFinite(stockQuantity) ? Math.max(0, stockQuantity) : 0,
    minStock: Number.isFinite(minStock) ? Math.max(0, minStock) : 0,
    unit,
    isStockItem: tracksStock,
  };
}

export type CatalogImportIngredientEntry = {
  name: string;
  brandIds: string[];
  productParts: TpvCategoryTemplateKey[];
};

/** Ingredientes del Excel agrupados por línea comercial (marca TPV), no mezclados en una sola lista. */
export function collectIngredientEntriesFromCatalogImport(
  items: Array<Pick<CatalogItem, 'customFields' | 'brandIds'>>,
  brands: Array<{ _id: string; deliveryLineKind?: string; catalogCategories?: string[] }>,
  partsDefault: TpvCategoryTemplateKey[] = ['pizzas', 'hamburguesas'],
): CatalogImportIngredientEntry[] {
  const allBrandIds = brands.map((b) => b._id);
  const brandById = new Map(brands.map((b) => [b._id, b]));
  const entries: CatalogImportIngredientEntry[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const text = String(item.customFields?.ingredients || '').trim();
    if (!text) continue;
    const names = parseIngredientsBulkText(text);
    let itemBrandIds = (item.brandIds ?? [])
      .map((id) => String(id || '').trim())
      .filter((id) => allBrandIds.includes(id));

    if (itemBrandIds.length === 0) {
      itemBrandIds = allBrandIds.length === 1 ? [allBrandIds[0]] : [...allBrandIds];
    }

    for (const rawName of names) {
      const name = rawName.trim();
      if (!name || isIngredientMetaLabel(name)) continue;
      for (const brandId of itemBrandIds) {
        const brand = brandById.get(brandId);
        let parts = brand ? resolveBrandTpvCategoryKeys(brand) : [];
        if (parts.length === 0) parts = partsDefault;
        const key = `${name.toLowerCase()}::${brandId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ name, brandIds: [brandId], productParts: parts });
      }
    }
  }

  return entries;
}

function catalogImportIngredientKey(name: string, brandIds: string[]): string {
  const brands = [...brandIds].map((id) => String(id || '').trim()).filter(Boolean).sort();
  return `${String(name || '').trim().toLowerCase()}::${brands.join(',')}`;
}

/** Nuevos del Excel como extra de pago; los ya existentes del import pasan a extra también. */
export function applyCatalogImportIngredientEntries(
  existing: StoreIngredient[],
  entries: CatalogImportIngredientEntry[],
): { merged: StoreIngredient[]; added: number; promoted: number } {
  const importKeys = new Set(
    entries.map((e) => catalogImportIngredientKey(e.name, e.brandIds)),
  );
  let merged = existing;
  const before = merged.length;
  for (const entry of entries) {
    merged = mergeStoreIngredientNames(merged, [entry.name], {
      role: 'extra',
      brandIds: entry.brandIds,
      productParts: entry.productParts,
    });
  }
  const added = merged.length - before;
  let promoted = 0;
  merged = merged.map((ing) => {
    const key = catalogImportIngredientKey(ing.name, ing.brandIds ?? []);
    if (!importKeys.has(key) || resolveIngredientRole(ing) === 'extra') return ing;
    promoted += 1;
    return { ...ing, role: 'extra' as const, escandalloOnly: false };
  });
  return { merged, added, promoted };
}
