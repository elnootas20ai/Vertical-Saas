import type { Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { shouldClearBrandForCategory } from './deliveryCatalogImportLogic.ts';
import { normalizeBusinessScopeId } from './deliverySetup';

export type CatalogBusinessScopeOptions = {
  /** Número de empresas en la cuenta (evita mezclar legacy sin business_id). */
  accountBusinessCount?: number;
  /** Tipo de la empresa activa (p. ej. delivery) — desbloquea bebidas/complementos sin línea. */
  activeBusinessType?: string;
};

export function readCatalogItemBusinessId(
  item: Pick<CatalogItem, 'business_id'> & { businessId?: string },
): string {
  const raw = item.business_id ?? (item as { businessId?: string }).businessId;
  return normalizeBusinessScopeId(String(raw || ''));
}

/** Artículos visibles solo para la empresa activa (marca / business_id). */
export function catalogItemBelongsToBusinessScope(
  item: CatalogItem,
  businessId: string,
  brandIds: Set<string>,
  options?: CatalogBusinessScopeOptions,
): boolean {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return false;

  const itemBusinessId = readCatalogItemBusinessId(item);
  const itemBrandIds = (item.brandIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);

  if (itemBusinessId) {
    return itemBusinessId === bid;
  }

  if (itemBrandIds.length > 0) {
    return itemBrandIds.some((id) => brandIds.has(id));
  }

  const universalCategory = shouldClearBrandForCategory(String(item.category || ''));
  if (universalCategory) {
    if (itemBusinessId) return itemBusinessId === bid;
    const accountN = options?.accountBusinessCount;
    if (accountN !== undefined && accountN >= 2) {
      return String(options?.activeBusinessType || '').trim() === 'delivery';
    }
    return brandIds.size > 0;
  }

  const accountN = options?.accountBusinessCount;
  if (accountN !== undefined && accountN >= 2) {
    return false;
  }

  // Legacy sin business_id ni línea: solo cuenta con una empresa y marcas configuradas.
  return brandIds.size > 0;
}

export function filterCatalogItemsForBusinessScope(
  items: CatalogItem[],
  businessId: string,
  brands: Brand[],
  options?: CatalogBusinessScopeOptions,
): CatalogItem[] {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];

  const brandIds = new Set(
    brands.map((b) => String(b._id || '').trim()).filter(Boolean),
  );

  return items.filter((item) =>
    catalogItemBelongsToBusinessScope(item, bid, brandIds, options),
  );
}

function normalizeCatalogItemIdentityValue(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/** Clave estable para detectar el mismo producto importado o legacy duplicado. */
export function catalogItemIdentityKey(
  item: Pick<CatalogItem, 'sku' | 'name' | 'category'>,
): string {
  const sku = normalizeCatalogItemIdentityValue(item.sku);
  if (sku) return `sku:${sku}`;
  const name = normalizeCatalogItemIdentityValue(item.name);
  const category = normalizeCatalogItemIdentityValue(item.category);
  return `name:${name}::${category}`;
}

function catalogItemDisplayRank(item: CatalogItem, businessId?: string): number {
  const bid = normalizeBusinessScopeId(businessId || '');
  let score = 0;
  if (bid && readCatalogItemBusinessId(item) === bid) score += 1_000_000;

  const cf = item.customFields;
  const recipe = cf?.costingRecipe;
  if (cf?.costingType === 'recipe' && Array.isArray(recipe) && recipe.length > 0) score += 100_000;
  else if (cf?.costingType === 'fixed') score += 10_000;
  else if (Number(item.costPrice) > 0) score += 1_000;

  if (String(item.sku || '').trim()) score += 100;
  if (String(item.customFields?.ingredients || '').trim()) score += 10;

  const updated = Date.parse(String(item.updatedAt || item.createdAt || ''));
  return score + (Number.isFinite(updated) ? updated / 1000 : 0);
}

/** Una fila por producto (código o nombre+categoría), conservando el más completo/reciente. */
export function dedupeCatalogItemsForDisplay(
  items: CatalogItem[],
  businessId?: string,
): CatalogItem[] {
  const bestByKey = new Map<string, CatalogItem>();
  for (const item of items) {
    const key = catalogItemIdentityKey(item);
    const prev = bestByKey.get(key);
    if (!prev || catalogItemDisplayRank(item, businessId) > catalogItemDisplayRank(prev, businessId)) {
      bestByKey.set(key, item);
    }
  }
  return [...bestByKey.values()];
}
