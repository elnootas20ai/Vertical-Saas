import type { Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { sortBrandsForDisplay } from './brandUtils';
import { UNIVERSAL_CATALOG_CATEGORIES } from './deliveryBrandLineKinds';
import { shouldClearBrandForCategory } from './deliveryCatalogImport';

export type TpvCatalogScope =
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
  if (scope.kind === 'brand') return `brand:${scope.brandId}`;
  return `shared:${scope.groupKey}`;
}

export function parseTpvSectionId(id: string): TpvCatalogScope | null {
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

/** Pestañas superiores: líneas comerciales (marcas) + bloques compartidos del Excel. */
export function buildTpvCatalogSections(brands: Brand[], catalog: CatalogItem[]): TpvCatalogSection[] {
  const sections: TpvCatalogSection[] = [];
  const sorted = sortBrandsForDisplay(brands.filter((b) => b.active !== false));

  for (const brand of sorted) {
    const hasProducts = catalog.some(
      (i) => isSellable(i) && (i.brandIds || []).includes(brand._id),
    );
    const hasCategories = (brand.catalogCategories?.length ?? 0) > 0;
    if (!hasProducts && !hasCategories) continue;

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
    if (brand?.catalogCategories?.length) {
      const ordered = brand.catalogCategories.filter((cat) =>
        items.some((i) => i.category === cat),
      );
      if (ordered.length > 0) return ordered;
    }
  }

  const cats = new Set<string>();
  items.forEach((item) => {
    if (item.category?.trim()) cats.add(item.category.trim());
  });
  return [...cats].sort((a, b) => a.localeCompare(b, 'es'));
}

export function defaultTpvSectionId(sections: TpvCatalogSection[]): string {
  const brandSection = sections.find((s) => s.scope.kind === 'brand');
  return brandSection?.id ?? sections[0]?.id ?? '';
}

export function filterTpvCatalogProducts(
  catalog: CatalogItem[],
  scope: TpvCatalogScope | null,
  selectedCategory: string | null,
  productSearch: string,
  clientProductScores: Record<string, number>,
): CatalogItem[] {
  if (!scope) return [];

  let items = itemsInScope(catalog, scope);

  if (selectedCategory) {
    items = items.filter((i) => i.category === selectedCategory);
  }
  if (productSearch.trim()) {
    const q = productSearch.toLowerCase();
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category?.toLowerCase().includes(q),
    );
  }

  return items.sort((a, b) => {
    const pricedA = Number(a.unitPrice || 0) > 0 ? 1 : 0;
    const pricedB = Number(b.unitPrice || 0) > 0 ? 1 : 0;
    if (pricedA !== pricedB) return pricedB - pricedA;
    return (clientProductScores[b._id] || 0) - (clientProductScores[a._id] || 0);
  });
}
