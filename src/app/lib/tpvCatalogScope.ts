import type { Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { listBrandsRequest } from './brandsApi';
import {
  filterCatalogItemsForBusinessScope,
  type CatalogBusinessScopeOptions,
} from './catalogBusinessScope';
import { resolveTpvCatalogBusinessId } from './tpvRegisterScope';

export type TpvCatalogBusinessRef = {
  business_id?: string;
  id?: string;
  businessType?: string;
};

export type TpvCatalogLoadScope = {
  scopeBusinessId: string;
  catalogBusinessId: string;
  accountBusinessCount?: number;
  activeBusinessType?: string;
};

export function resolveTpvCatalogLoadScope(
  scopeBusinessId: string,
  businesses: TpvCatalogBusinessRef[],
  accountBusinessCount?: number,
): TpvCatalogLoadScope {
  const catalogBusinessId = resolveTpvCatalogBusinessId(scopeBusinessId, businesses);
  const match = businesses.find(
    (b) =>
      String(b.business_id || b.id || '')
        .replace(/^business:/, '')
        .trim() === catalogBusinessId,
  );
  return {
    scopeBusinessId: String(scopeBusinessId || '').trim(),
    catalogBusinessId,
    accountBusinessCount,
    activeBusinessType: match?.businessType,
  };
}

async function tryLoadBrands(businessId: string): Promise<Brand[]> {
  const bid = String(businessId || '').trim();
  if (!bid) return [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const brands = await listBrandsRequest(bid);
      if (brands.length > 0) return brands;
    } catch {
      /* retry */
    }
  }
  return [];
}

/** Marcas para TPV: empresa delivery del catálogo + reintentos; nunca devolver [] si hay delivery en cuenta. */
export async function loadTpvCatalogBrands(
  scope: TpvCatalogLoadScope,
  businesses: TpvCatalogBusinessRef[],
): Promise<Brand[]> {
  const primary = await tryLoadBrands(scope.catalogBusinessId);
  if (primary.length > 0) return primary;

  const delivery = businesses.find((b) => String(b.businessType || '').trim() === 'delivery');
  const deliveryId = String(delivery?.business_id || delivery?.id || '').replace(/^business:/, '').trim();
  if (deliveryId && deliveryId !== scope.catalogBusinessId) {
    const fallback = await tryLoadBrands(deliveryId);
    if (fallback.length > 0) return fallback;
  }

  return tryLoadBrands(scope.catalogBusinessId);
}

export function filterTpvCatalogItems(
  rawItems: CatalogItem[],
  scope: TpvCatalogLoadScope,
  brands: Brand[],
): CatalogItem[] {
  const options: CatalogBusinessScopeOptions = {
    accountBusinessCount: scope.accountBusinessCount,
    activeBusinessType: scope.activeBusinessType,
  };

  let items = filterCatalogItemsForBusinessScope(
    rawItems,
    scope.catalogBusinessId,
    brands,
    options,
  );

  return items;
}

export function tpvCatalogCacheKey(userId: string, scope: TpvCatalogLoadScope): string {
  return `${String(userId || '').trim()}:${scope.catalogBusinessId || 'no-biz'}`;
}
