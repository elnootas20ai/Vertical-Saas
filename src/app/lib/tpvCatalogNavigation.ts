import type { Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { isDefaultBrandNamePlaceholder, isDefaultCommercialBrand, sortBrandsForDisplay } from './brandUtils';
import { UNIVERSAL_CATALOG_CATEGORIES } from './deliveryBrandLineKinds';
import { shouldClearBrandForCategory, allCommercialLineBrands } from './deliveryCatalogImportLogic';

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

function foldKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
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

function isSellable(item: CatalogItem): boolean {
  return (item.itemType === 'product' || item.itemType === 'combo') && item.active !== false;
}

function isUnbranded(item: CatalogItem): boolean {
  return !(item.brandIds?.length);
}

/** Agrupa productos sin línea (Excel: bebidas, complementos…) en pestañas compartidas. */
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
  if (/refresco|cerveza|vino|bebida|zumo|agua|café|cafe/.test(key)) return 'bebidas';
  if (/salsa|complement|extra|side|guarnicion/.test(key)) return 'complementos';
  if (/postre|helado|dulce/.test(key)) return 'postres';
  return 'general';
}

const SHARED_GROUP_LABELS: Record<string, string> = {
  bebidas: 'Bebidas',
  complementos: 'Complementos',
  postres: 'Postres',
  extras: 'Extras',
  otros: 'Otros',
  general: 'General',
};

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

/** Pestañas superiores: Todos + líneas comerciales + bloques compartidos (una fila). */
export function buildTpvCatalogSections(brands: Brand[], catalog: CatalogItem[]): TpvCatalogSection[] {
  const sections: TpvCatalogSection[] = [];
  const brandTabs = commercialBrandsForTpvTabs(brands, catalog);
  const hasSellable = catalog.some(isSellable);

  if (hasSellable) {
    sections.push({
      id: formatTpvSectionId({ kind: 'all' }),
      scope: { kind: 'all' },
      label: 'Todos',
      color: '#059669',
      shortCode: 'ALL',
    });
  }

  for (const brand of brandTabs) {
    sections.push({
      id: formatTpvSectionId({ kind: 'brand', brandId: brand._id }),
      scope: { kind: 'brand', brandId: brand._id },
      label: brand.name,
      color: brand.primaryColor,
      shortCode: brand.shortCode,
      logo: brand.logo,
    });
  }

  const sharedKeys = new Set<string>();
  for (const item of catalog) {
    if (!isSellable(item) || !isUnbranded(item)) continue;
    sharedKeys.add(sharedGroupKeyForCategory(item.category));
  }

  for (const groupKey of [...sharedKeys].sort((a, b) =>
    sharedGroupLabel(a).localeCompare(sharedGroupLabel(b), 'es'),
  )) {
    sections.push({
      id: formatTpvSectionId({ kind: 'shared', groupKey }),
      scope: { kind: 'shared', groupKey },
      label: sharedGroupLabel(groupKey),
      color: groupKey === 'bebidas' ? '#2563EB' : groupKey === 'complementos' ? '#7C3AED' : '#4B5563',
      shortCode: groupKey.slice(0, 3).toUpperCase(),
    });
  }

  return sections;
}

function itemsInScope(catalog: CatalogItem[], scope: TpvCatalogScope): CatalogItem[] {
  const sellable = catalog.filter(isSellable);
  if (scope.kind === 'all') return sellable;
  if (scope.kind === 'brand') {
    return sellable.filter((i) => (i.brandIds || []).includes(scope.brandId));
  }
  return sellable.filter(
    (i) => isUnbranded(i) && sharedGroupKeyForCategory(i.category) === scope.groupKey,
  );
}

/** Categorías de la franja inferior (Refrescos, Pizzas…), orden según marca o catálogo. */
export function categoriesForTpvScope(
  scope: TpvCatalogScope,
  brands: Brand[],
  catalog: CatalogItem[],
): string[] {
  const items = itemsInScope(catalog, scope);
  if (items.length === 0) return [];

  if (scope.kind === 'brand') {
    const brand = brands.find((b) => b._id === scope.brandId);
    const fromItems = new Set<string>();
    items.forEach((item) => {
      if (item.category?.trim()) fromItems.add(item.category.trim());
    });
    if (brand?.catalogCategories?.length) {
      const ordered = brand.catalogCategories.filter((cat) => fromItems.has(cat));
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
    if (item.category?.trim()) cats.add(item.category.trim());
  });
  return [...cats].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Pestaña inicial: con catálogo → «Todos» si tiene productos; si no, la primera sección con stock. */
export function defaultTpvSectionId(sections: TpvCatalogSection[], catalog?: CatalogItem[]): string {
  if (sections.length === 0) return '';

  if (catalog && catalog.length > 0) {
    const allSection = sections.find((s) => s.scope.kind === 'all');
    if (allSection && itemsInScope(catalog, allSection.scope).length > 0) {
      return allSection.id;
    }
    for (const section of sections) {
      if (itemsInScope(catalog, section.scope).length > 0) return section.id;
    }
  }

  const brandSection = sections.find((s) => s.scope.kind === 'brand');
  if (brandSection) return brandSection.id;
  const allSection = sections.find((s) => s.scope.kind === 'all');
  if (allSection) return allSection.id;
  return sections[0]?.id ?? '';
}

export function tpvSectionProductCount(catalog: CatalogItem[], scope: TpvCatalogScope): number {
  return itemsInScope(catalog, scope).length;
}

export function filterTpvCatalogProducts(
  catalog: CatalogItem[],
  scope: TpvCatalogScope | null,
  selectedCategory: string | null,
  productSearch: string,
  clientProductScores: Record<string, number>,
): CatalogItem[] {
  const q = productSearch.trim().toLowerCase();

  let items: CatalogItem[];
  if (q) {
    // Con texto de búsqueda: todo el catálogo vendible (no solo la marca activa).
    items = catalog.filter(isSellable).filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category?.toLowerCase().includes(q) ||
        String(i.sku || '').toLowerCase().includes(q) ||
        String(i.barcode || '').toLowerCase().includes(q),
    );
  } else {
    if (!scope) return [];
    items = itemsInScope(catalog, scope);
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
  let items = itemsInScope(catalog, scope);
  if (selectedCategory) {
    items = items.filter((i) => i.category === selectedCategory);
  }
  return sortTpvCatalogItems(items, clientProductScores);
}
