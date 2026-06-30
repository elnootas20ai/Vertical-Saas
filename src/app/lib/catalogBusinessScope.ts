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
