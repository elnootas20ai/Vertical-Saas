import type { Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { isDefaultBrandNamePlaceholder, sortBrandsForDisplay } from './brandUtils';
import { resolveBrandLogo } from './brandPlaceholders';
import { brandIdAliases } from './brandLabels';
import { UNIVERSAL_CATALOG_CATEGORIES } from './deliveryBrandLineKinds';
import { shouldClearBrandForCategory, allCommercialLineBrands, isWarehouseImportCategory } from './deliveryCatalogImportLogic';
import { isTpvWarehouseOnlyCatalogItem } from './tpvCatalogScope';
import {
  isBrandFoodCategory,
  resolveTpvFamilyKey,
  TPV_FAMILY_DEFS,
  type TpvFamilyKey,
} from './tpvCatalogFamilies';

export type TpvCatalogScope =
  | { kind: 'all' }
  | { kind: 'brand'; brandId: string }
  | { kind: 'shared'; groupKey: string };

export type TpvCatalogSection = {
  id: string;
  scope: TpvCatalogScope;
  label: string;
  color?: string;
  shortCode?: string;
  logo?: string;
};

export type BuildTpvCatalogSectionsOptions = {
  /** false en bar/restaurante: sin pestaña Todos. */
  includeAllTab?: boolean;
  /**
   * brand_families: marca(s) primero, luego Bebidas/Cafés/Postres…;
   * dentro de cada familia, subfamilias (categoria Excel).
   */
  layout?: 'default' | 'brand_families';
};

function foldKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Búsqueda TPV sin acentos: «dia» encuentra «Diávola», «jamon» encuentra «Jamón». */
export function foldTpvSearchText(s: string): string {
  return foldKey(s);
}

export function formatTpvSectionId(scope: TpvCatalogScope): string {
  if (scope.kind === 'all') return 'all';
  if (scope.kind === 'brand') return `brand:${scope.brandId}`;
  return `shared:${scope.groupKey}`;
}

export function parseTpvSectionId(id: string): TpvCatalogScope | null {
  if (id === 'all') return { kind: 'all' };
  if (id.startsWith('brand:')) {
    const brandId = id.slice(6);
    return brandId ? { kind: 'brand', brandId } : null;
  }
  if (id.startsWith('shared:')) {
    const groupKey = id.slice(7);
    return groupKey ? { kind: 'shared', groupKey } : null;
  }
  return null;
}

/**
 * Vendible en TPV: productos/combos de carta.
 * Excluye almacén puro (ingredientes, envases…).
 * Carta con isStockItem=true (control de stock) SÍ se vende.
 */
export function isTpvSellableCatalogItem(item: CatalogItem | null | undefined): boolean {
  if (!item) return false;
  if (item.active === false) return false;
  /** Agotado en cocina / carta (`available: false`). */
  if (item.available === false) return false;
  if (item.itemType !== 'product' && item.itemType !== 'combo') return false;
  if (isTpvWarehouseOnlyCatalogItem(item)) return false;
  // Categoría de almacén (p. ej. «Ingredientes» al crear escandallo): nunca en TPV.
  if (isWarehouseImportCategory(String(item.category || ''))) return false;
  return true;
}

function isSellable(item: CatalogItem): boolean {
  return isTpvSellableCatalogItem(item);
}

function isUnbranded(item: CatalogItem): boolean {
  return !(item.brandIds?.length);
}

/** Agrupa productos genéricos / compartidos entre marcas en pestañas superiores. */
function sharedGroupKeyForCategory(category: string): string {
  const raw = String(category || '').trim();
  const key = foldKey(raw);

  for (const u of UNIVERSAL_CATALOG_CATEGORIES) {
    if (foldKey(u) === key) return foldKey(u);
  }
  if (shouldClearBrandForCategory(raw)) {
    if (key === 'bebidas' || key === 'bebida') return 'bebidas';
    if (key === 'complementos' || key === 'complemento') return 'complementos';
    if (key === 'postres' || key === 'postre') return 'postres';
    if (key === 'extras') return 'extras';
    if (key === 'otros') return 'otros';
    return key || 'otros';
  }
  // Cervezas / Vinos: pestañas propias (no mezclar todo en «Bebidas»).
  if (/cerveza/.test(key)) return 'cervezas';
  if (/^vinos?$/.test(key) || key === 'vino' || /lambrusco/.test(key)) return 'vinos';
  if (/refresco|bebida|zumo|agua|café|cafe/.test(key)) return 'bebidas';
  if (/salsa|complement|extra|side|guarnicion/.test(key)) return 'complementos';
  if (/postre|helado|dulce/.test(key)) return 'postres';
  return 'general';
}

const SHARED_GROUP_LABELS: Record<string, string> = {
  bebidas: 'Bebidas',
  cervezas: 'Cervezas',
  vinos: 'Vinos',
  complementos: 'Complementos',
  postres: 'Postres',
  extras: 'Extras',
  otros: 'Otros',
  general: 'General',
};

/**
 * Organizador usado por más de una marca (reglas catalogCategories o productos).
 * Esos organizadores salen del TPV de cada marca y van a pestaña compartida.
 */
export function categoryUsedByMultipleBrands(
  category: string,
  brands: Brand[],
  catalog: CatalogItem[],
): boolean {
  const catKey = foldKey(category);
  if (!catKey) return false;

  let brandsWithRule = 0;
  for (const brand of brands || []) {
    const cats = brand.catalogCategories || [];
    if (cats.some((c) => foldKey(c) === catKey)) {
      brandsWithRule += 1;
      if (brandsWithRule >= 2) return true;
    }
  }

  const productBrandIds = new Set<string>();
  for (const item of catalog || []) {
    if (!isSellable(item)) continue;
    if (foldKey(item.category) !== catKey) continue;
    for (const id of item.brandIds || []) {
      const bid = String(id || '').trim();
      if (bid) productBrandIds.add(bid);
      if (productBrandIds.size >= 2) return true;
    }
  }
  return false;
}

function isCrossBrandOrganizerCategory(
  category: string,
  brands: Brand[],
  catalog: CatalogItem[],
): boolean {
  // Combos / Tacos / Pizzas / Burgers… se quedan en cada marca.
  // Solo bebidas, postres, complementos… van a pestaña compartida.
  if (isBrandFoodCategory(category)) return false;
  return categoryUsedByMultipleBrands(category, brands, catalog);
}

export function sharedGroupLabel(groupKey: string): string {
  return SHARED_GROUP_LABELS[groupKey] || groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
}

/** Líneas comerciales visibles en pestañas TPV (modomio, blackburger…). */
export function commercialBrandsForTpvTabs(brands: Brand[], catalog: CatalogItem[]): Brand[] {
  const productBrandIds = new Set(
    catalog.filter(isSellable).flatMap((i) => (i.brandIds || []).map(String)),
  );

  const commercial = allCommercialLineBrands(Array.isArray(brands) ? brands : []);
  const namedLines = commercial.filter((b) => !isDefaultBrandNamePlaceholder(b.name));
  const pool = namedLines.length > 0 ? namedLines : commercial.filter((b) => b.active !== false);

  const visible = pool.filter((b) => {
    if (b.active !== false) return true;
    return productBrandIds.has(b._id);
  });

  if (visible.length > 0) return sortBrandsForDisplay(visible);

  return sortBrandsForDisplay(
    brands.filter(
      (b) =>
        b.active !== false
        && (productBrandIds.has(b._id) || (b.catalogCategories?.length ?? 0) > 0),
    ),
  );
}

function sharedSectionColor(groupKey: string): string {
  if (groupKey === 'bebidas') return '#2563EB';
  if (groupKey === 'cafes') return '#92400E';
  if (groupKey === 'cervezas') return '#059669';
  if (groupKey === 'vinos') return '#7C3AED';
  if (groupKey === 'postres') return '#DB2777';
  if (groupKey === 'complementos') return '#7C3AED';
  return '#4B5563';
}

/** Pestañas superiores: Todos + genéricos/compartidos + líneas comerciales (marcas). */
export function buildTpvCatalogSections(
  brands: Brand[],
  catalog: CatalogItem[],
  options?: BuildTpvCatalogSectionsOptions,
): TpvCatalogSection[] {
  const sections: TpvCatalogSection[] = [];
  const brandTabs = commercialBrandsForTpvTabs(brands, catalog);
  const hasSellable = catalog.some(isSellable);
  const includeAllTab = options?.includeAllTab !== false;
  const layout = options?.layout ?? 'default';

  if (includeAllTab && hasSellable) {
    sections.push({
      id: formatTpvSectionId({ kind: 'all' }),
      scope: { kind: 'all' },
      label: 'Todos',
      color: '#059669',
      shortCode: 'ALL',
    });
  }

  if (layout === 'brand_families') {
    for (const brand of brandTabs) {
      sections.push({
        id: formatTpvSectionId({ kind: 'brand', brandId: brand._id }),
        scope: { kind: 'brand', brandId: brand._id },
        label: brand.name,
        color: brand.primaryColor,
        shortCode: brand.shortCode,
        logo: resolveBrandLogo(brand),
      });
    }

    const familyKeys = new Set<TpvFamilyKey>();
    for (const item of catalog) {
      if (!isSellable(item)) continue;
      const fam = resolveTpvFamilyKey(String(item.category || ''));
      if (fam) familyKeys.add(fam);
    }
    for (const def of [...TPV_FAMILY_DEFS].sort((a, b) => a.order - b.order)) {
      if (!familyKeys.has(def.key)) continue;
      sections.push({
        id: formatTpvSectionId({ kind: 'shared', groupKey: def.key }),
        scope: { kind: 'shared', groupKey: def.key },
        label: def.label,
        color: sharedSectionColor(def.key),
        shortCode: def.key.slice(0, 3).toUpperCase(),
      });
    }
    return sections;
  }

  // Genéricos: sin marca, O organizadores que usan varias marcas (salen de cada marca).
  const sharedKeys = new Set<string>();
  for (const item of catalog) {
    if (!isSellable(item)) continue;
    const cat = String(item.category || '').trim();
    if (!cat) continue;
    if (isUnbranded(item) || isCrossBrandOrganizerCategory(cat, brands, catalog)) {
      sharedKeys.add(sharedGroupKeyForCategory(cat));
    }
  }

  for (const groupKey of [...sharedKeys].sort((a, b) =>
    sharedGroupLabel(a).localeCompare(sharedGroupLabel(b), 'es'),
  )) {
    // «General» = cajón raro (p. ej. Reventa); no mostrar pestaña.
    if (groupKey === 'general') continue;
    sections.push({
      id: formatTpvSectionId({ kind: 'shared', groupKey }),
      scope: { kind: 'shared', groupKey },
      label: sharedGroupLabel(groupKey),
      color: sharedSectionColor(groupKey),
      shortCode: groupKey.slice(0, 3).toUpperCase(),
    });
  }

  for (const brand of brandTabs) {
    sections.push({
      id: formatTpvSectionId({ kind: 'brand', brandId: brand._id }),
      scope: { kind: 'brand', brandId: brand._id },
      label: brand.name,
      color: brand.primaryColor,
      shortCode: brand.shortCode,
      logo: resolveBrandLogo(brand),
    });
  }

  return sections;
}

export type TpvCatalogLayout = 'default' | 'brand_families';

/** Producto de esta marca (aliases brand:/brand-). Con 1 sola línea comercial, huérfanos y sin marca van ahí. */
function itemBelongsToBrandTab(
  item: CatalogItem,
  brandId: string,
  brandTabs: Brand[],
): boolean {
  const bid = String(brandId || '').trim();
  if (!bid) return false;
  const tabAliases = new Set(brandIdAliases(bid));
  const ids = (item.brandIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  if (ids.some((id) => brandIdAliases(id).some((a) => tabAliases.has(a)))) {
    return true;
  }

  const sole =
    brandTabs.length === 1
    && brandIdAliases(String(brandTabs[0]?._id || '')).some((a) => tabAliases.has(a));
  if (!sole) return false;

  // Una sola marca en TPV: sin brandIds o IDs que no cuadran con esta pestaña → van a bodegeta/etc.
  if (ids.length === 0) return true;

  const anyTabMatch = brandTabs.some((tab) => {
    const aliases = new Set(brandIdAliases(String(tab._id || '')));
    return ids.some((id) => brandIdAliases(id).some((a) => aliases.has(a)));
  });
  return !anyTabMatch;
}

function itemsInScope(
  catalog: CatalogItem[],
  scope: TpvCatalogScope,
  brands: Brand[] = [],
  layout: TpvCatalogLayout = 'default',
): CatalogItem[] {
  const sellable = catalog.filter(isSellable);
  if (scope.kind === 'all') return sellable;
  if (scope.kind === 'brand') {
    const brandTabs = commercialBrandsForTpvTabs(brands, catalog);
    const brandDoc =
      brands.find((b) =>
        brandIdAliases(String(b._id || '')).some((a) =>
          brandIdAliases(scope.brandId).includes(a),
        ),
      ) || null;
    const brandCatKeys = new Set(
      (brandDoc?.catalogCategories || []).map((c) => foldKey(c)).filter(Boolean),
    );
    return sellable.filter((i) => {
      if (!itemBelongsToBrandTab(i, scope.brandId, brandTabs)) return false;
      const cat = String(i.category || '').trim();
      if (layout === 'brand_families') {
        if (!cat) return true;
        if (isBrandFoodCategory(cat)) return true;
        // Carta de la marca (aunque el nombre choque con Bebidas/Cafés…)
        if (brandCatKeys.has(foldKey(cat))) return true;
        return false;
      }
      if (cat && isCrossBrandOrganizerCategory(cat, brands, catalog)) return false;
      return true;
    });
  }
  if (layout === 'brand_families') {
    return sellable.filter((i) => resolveTpvFamilyKey(String(i.category || '')) === scope.groupKey);
  }
  return sellable.filter((i) => {
    const cat = String(i.category || '').trim();
    if (sharedGroupKeyForCategory(cat) !== scope.groupKey) return false;
    if (isUnbranded(i)) return true;
    return isCrossBrandOrganizerCategory(cat, brands, catalog);
  });
}

/** Categorías de la franja inferior (Refrescos, Pizzas…), orden según marca o catálogo. */
export function categoriesForTpvScope(
  scope: TpvCatalogScope,
  brands: Brand[],
  catalog: CatalogItem[],
  layout: TpvCatalogLayout = 'default',
): string[] {
  const items = itemsInScope(catalog, scope, brands, layout);
  if (items.length === 0) return [];

  if (scope.kind === 'brand') {
    const brand = brands.find((b) => b._id === scope.brandId);
    const fromItems = new Set<string>();
    items.forEach((item) => {
      const cat = item.category?.trim();
      if (!cat || isWarehouseImportCategory(cat)) return;
      if (layout !== 'brand_families' && isCrossBrandOrganizerCategory(cat, brands, catalog)) return;
      fromItems.add(cat);
    });
    if (brand?.catalogCategories?.length) {
      const ordered = brand.catalogCategories.filter((cat) => {
        if (isWarehouseImportCategory(cat)) return false;
        if (!fromItems.has(cat)) return false;
        if (layout === 'brand_families') return isBrandFoodCategory(cat);
        return !isCrossBrandOrganizerCategory(cat, brands, catalog);
      });
      const extra = [...fromItems]
        .filter((cat) => !brand.catalogCategories!.includes(cat))
        .sort((a, b) => a.localeCompare(b, 'es'));
      if (ordered.length > 0 || extra.length > 0) {
        return [...ordered, ...extra];
      }
    }
  }

  const cats = new Set<string>();
  items.forEach((item) => {
    const cat = item.category?.trim();
    if (!cat || isWarehouseImportCategory(cat)) return;
    cats.add(cat);
  });
  return [...cats].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Pestaña inicial: con catálogo → «Todos» si tiene productos; si no, la primera sección con stock. */
export function defaultTpvSectionId(
  sections: TpvCatalogSection[],
  catalog?: CatalogItem[],
  brands: Brand[] = [],
  layout: TpvCatalogLayout = 'default',
): string {
  if (sections.length === 0) return '';

  if (catalog && catalog.length > 0) {
    const allSection = sections.find((s) => s.scope.kind === 'all');
    if (allSection && itemsInScope(catalog, allSection.scope, brands, layout).length > 0) {
      return allSection.id;
    }
    for (const section of sections) {
      if (itemsInScope(catalog, section.scope, brands, layout).length > 0) return section.id;
    }
  }

  const brandSection = sections.find((s) => s.scope.kind === 'brand');
  if (brandSection) return brandSection.id;
  const allSection = sections.find((s) => s.scope.kind === 'all');
  if (allSection) return allSection.id;
  return sections[0]?.id ?? '';
}

export function tpvSectionProductCount(
  catalog: CatalogItem[],
  scope: TpvCatalogScope,
  brands: Brand[] = [],
  layout: TpvCatalogLayout = 'default',
): number {
  return itemsInScope(catalog, scope, brands, layout).length;
}

export function filterTpvCatalogProducts(
  catalog: CatalogItem[],
  scope: TpvCatalogScope | null,
  selectedCategory: string | null,
  productSearch: string,
  clientProductScores: Record<string, number>,
  brands: Brand[] = [],
  layout: TpvCatalogLayout = 'default',
): CatalogItem[] {
  const q = foldKey(productSearch);

  let items: CatalogItem[];
  if (q) {
    // Con texto de búsqueda: todo el catálogo vendible (no solo la marca activa).
    items = catalog.filter(isSellable).filter((i) => {
      const hay = foldKey(
        [i.name, i.category, i.sku, i.barcode].map((s) => String(s || '')).join(' '),
      );
      return hay.includes(q);
    });
  } else {
    if (!scope) return [];
    items = itemsInScope(catalog, scope, brands, layout);
    if (selectedCategory) {
      items = items.filter((i) => i.category === selectedCategory);
    }
  }

  return items.sort((a, b) => {
    const pricedA = Number(a.unitPrice || 0) > 0 ? 1 : 0;
    const pricedB = Number(b.unitPrice || 0) > 0 ? 1 : 0;
    if (pricedA !== pricedB) return pricedB - pricedA;
    return (clientProductScores[b._id] || 0) - (clientProductScores[a._id] || 0);
  });
}

export const TPV_PRODUCT_SEARCH_LIMIT = 48;

export type TpvProductSearchRow = {
  item: CatalogItem;
  haystack: string;
  nameFold: string;
};

export function buildTpvProductSearchIndex(catalog: CatalogItem[]): TpvProductSearchRow[] {
  return catalog
    .filter(isSellable)
    .map((item) => ({
      item,
      haystack: foldKey(
        [item.name, item.category, item.sku, item.barcode].map((s) => String(s || '')).join(' '),
      ),
      nameFold: foldKey(item.name),
    }));
}

function sortTpvCatalogItems(
  items: CatalogItem[],
  clientProductScores: Record<string, number>,
): CatalogItem[] {
  return [...items].sort((a, b) => {
    const pricedA = Number(a.unitPrice || 0) > 0 ? 1 : 0;
    const pricedB = Number(b.unitPrice || 0) > 0 ? 1 : 0;
    if (pricedA !== pricedB) return pricedB - pricedA;
    return (clientProductScores[b._id] || 0) - (clientProductScores[a._id] || 0);
  });
}

/** Búsqueda indexada en cliente (instantánea) + navegación por marca/categoría. */
export function searchTpvProducts(
  index: TpvProductSearchRow[],
  catalog: CatalogItem[],
  productSearch: string,
  scope: TpvCatalogScope | null,
  selectedCategory: string | null,
  clientProductScores: Record<string, number>,
  brands: Brand[] = [],
  layout: TpvCatalogLayout = 'default',
): CatalogItem[] {
  const q = foldKey(productSearch);

  if (q.length > 0) {
    const matched = index
      .filter((row) => row.haystack.includes(q))
      .sort((a, b) => {
        const aStarts = a.nameFold.startsWith(q) ? 1 : 0;
        const bStarts = b.nameFold.startsWith(q) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        const aWord = a.nameFold.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : 0;
        const bWord = b.nameFold.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : 0;
        if (aWord !== bWord) return bWord - aWord;
        return a.nameFold.localeCompare(b.nameFold, 'es');
      })
      .slice(0, TPV_PRODUCT_SEARCH_LIMIT)
      .map((row) => row.item);
    return sortTpvCatalogItems(matched, clientProductScores);
  }

  if (!scope) return [];
  let items = itemsInScope(catalog, scope, brands, layout);
  if (selectedCategory) {
    items = items.filter((i) => i.category === selectedCategory);
  }
  return sortTpvCatalogItems(items, clientProductScores);
}
