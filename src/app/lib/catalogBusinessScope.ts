import type { Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { shouldClearBrandForCategory } from './deliveryCatalogImportLogic.ts';
import { isDeliveryBusinessType, normalizeBusinessScopeId } from './deliverySetup';
import { isDeliveryOpsBusinessType, isRestaurantBusinessType } from './deliveryOpsTypes';
import {
  catalogImportIdentityKey,
  catalogLooseIdentityKey,
} from '../../../shared/catalog/catalogItemIdentity.js';

export type CatalogBusinessScopeOptions = {
  /** Número de empresas en la cuenta (evita mezclar legacy sin business_id). */
  accountBusinessCount?: number;
  /** Tipo de la empresa activa — desbloquea bebidas/complementos/postres sin línea (delivery + restaurante). */
  activeBusinessType?: string;
};

export function readCatalogItemBusinessId(
  item: Pick<CatalogItem, 'business_id'> & { businessId?: string },
): string {
  const raw = item.business_id ?? (item as { businessId?: string }).businessId;
  return normalizeBusinessScopeId(String(raw || ''));
}

export function readCatalogItemVertical(item: Pick<CatalogItem, 'vertical'>): string {
  return String(item.vertical || '').trim().toLowerCase();
}

/** Artículos visibles solo para la empresa activa (marca / business_id / vertical). */
export function catalogItemBelongsToBusinessScope(
  item: CatalogItem,
  businessId: string,
  brandIds: Set<string>,
  options?: CatalogBusinessScopeOptions,
): boolean {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return false;

  const activeType = String(options?.activeBusinessType || '').trim().toLowerCase();
  const itemVertical = readCatalogItemVertical(item);
  const itemBusinessId = readCatalogItemBusinessId(item);
  const accountN = options?.accountBusinessCount;
  const multiAccount = accountN !== undefined && accountN >= 2;

  if (itemVertical === 'delivery' && !isDeliveryBusinessType(activeType)) {
    return false;
  }
  if (itemVertical === 'restaurant' && !isRestaurantBusinessType(activeType)) {
    return false;
  }
  if (isDeliveryBusinessType(activeType) && itemVertical && itemVertical !== 'delivery') {
    return false;
  }
  if (isRestaurantBusinessType(activeType) && itemVertical && itemVertical !== 'restaurant') {
    return false;
  }

  if (itemBusinessId) {
    return itemBusinessId === bid;
  }

  if (itemVertical && activeType && itemVertical === activeType) {
    return true;
  }

  const itemBrandIds = (item.brandIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  if (itemBrandIds.some((id) => brandIds.has(id))) {
    return true;
  }

  const universalCategory = shouldClearBrandForCategory(String(item.category || ''));
  if (universalCategory) {
    if (activeType && !isDeliveryOpsBusinessType(activeType)) return false;
    if (multiAccount) return isDeliveryOpsBusinessType(activeType);
    if (isRestaurantBusinessType(activeType)) return true;
    return brandIds.size > 0;
  }

  if (multiAccount) {
    return false;
  }

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

/** Clave estable para detectar el mismo producto importado o legacy duplicado. */
export function catalogItemIdentityKey(
  item: Pick<CatalogItem, 'sku' | 'name' | 'category' | 'module' | 'business_id'>,
): string {
  return catalogImportIdentityKey(item);
}

/** Clave laxa (nombre + categoría) tras filtrar por empresa activa. */
export function catalogItemLooseIdentityKey(
  item: Pick<CatalogItem, 'name' | 'category' | 'module'>,
): string {
  return catalogLooseIdentityKey(item);
}

function isCatalogMenuItem(item: CatalogItem): boolean {
  return String(item.module || 'catalog') === 'catalog';
}

/** Incluye duplicados legacy con la misma identidad (para borrado masivo completo). */
export function expandCatalogItemsForDeletion(
  selected: CatalogItem[],
  allItems: CatalogItem[],
): CatalogItem[] {
  const keys = new Set(selected.map((item) => catalogItemLooseIdentityKey(item)));
  const byId = new Map<string, CatalogItem>();

  for (const item of allItems) {
    if (!isCatalogMenuItem(item)) continue;
    if (keys.has(catalogItemLooseIdentityKey(item))) {
      byId.set(item._id, item);
    }
  }

  for (const item of selected) {
    if (isCatalogMenuItem(item)) byId.set(item._id, item);
  }

  return [...byId.values()];
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
    const key = catalogItemLooseIdentityKey(item);
    const prev = bestByKey.get(key);
    if (!prev || catalogItemDisplayRank(item, businessId) > catalogItemDisplayRank(prev, businessId)) {
      bestByKey.set(key, item);
    }
  }
  return [...bestByKey.values()];
}
