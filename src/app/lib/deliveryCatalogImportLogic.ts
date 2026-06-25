import { isDefaultCommercialBrand, sortBrandsForDisplay } from './brandUtils';
import {
  mergeStoreIngredientNames,
  parseIngredientsBulkText,
  resolveBrandTpvCategoryKeys,
  resolveIngredientRole,
  type StoreIngredient,
  type TpvCategoryTemplateKey,
} from './catalogCustomization';
import type { CatalogItem } from './deliveryApi';

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
  complementos: 'Complementos',
  complemento: 'Complementos',
  sides: 'Complementos',
  side: 'Complementos',
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
  hamburguesas: 'Hamburguesas',
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
};

export function isImportComboCategory(category: string): boolean {
  return foldKey(normalizeImportCategory(category)) === 'combos';
}

export function normalizeImportCategory(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const alias = IMPORT_CATEGORY_ALIASES[foldKey(raw)];
  if (alias) return alias;
  if (/^dato\s*\d+$/i.test(raw)) return 'Principales';
  return raw;
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
    const key = foldKey(part);
    const hit =
      searchIn.find((b) => b._id === part || b.id === part) ||
      searchIn.find((b) => foldKey(b.name) === key);
    if (!hit) {
      unmatchedNames.push(part);
      continue;
    }
    if (hit._id && !brandIds.includes(hit._id)) brandIds.push(hit._id);
  }

  return { brandIds, unmatchedNames };
}

export function shouldClearBrandForCategory(category: string): boolean {
  const c = foldKey(category);
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

  const byCatalogCat = commercialAll.filter((b) => brandHasCatalogCategory(b, category));
  if (byCatalogCat.length === 1) return byCatalogCat[0]._id;
  if (byCatalogCat.length > 1) {
    const nonDefault = byCatalogCat.find((b) => !isDefaultCommercialBrand(b));
    return (nonDefault ?? byCatalogCat[0])._id;
  }

  const kindHints: Record<string, string[]> = {
    pizzas: ['pizza'],
    hamburguesas: ['burger_fastfood'],
    burgers: ['burger_fastfood'],
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
  if (shouldClearBrandForCategory(category)) return [];

  const fromProductName = inferCommercialLineBrandIdFromProductName(productName, brands);
  if (fromProductName) return [fromProductName];

  if (explicitBrandIds.length > 0) return explicitBrandIds;

  const inferred = inferCommercialLineBrandId(category, brands, productName);
  if (inferred) return [inferred];

  const defaultId = defaultBrandIdForCatalogImport(brands);
  return defaultId ? [defaultId] : [];
}

export function formatUnmatchedCommercialBrandWarning(unmatchedNames: string[]): string | null {
  const unique = [...new Set(unmatchedNames.map((n) => String(n || '').trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  const sample = unique.slice(0, 8).join(', ');
  const extra = unique.length > 8 ? ` (+${unique.length - 8} más)` : '';
  return (
    `Columna «línea/marca»: ${sample}${extra} no coincide con tus organizadores en Ajustes → Marca. ` +
    'Esos productos se asignan por categoría o a tu línea principal. No se crean líneas nuevas desde el Excel.'
  );
}

export function buildBrandCategoryMapFromItems(
  items: Array<{ brandIds?: string[]; category?: string }>,
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const item of items) {
    const cat = normalizeImportCategory(String(item.category || ''));
    if (!cat) continue;
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
      if (!name) continue;
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
