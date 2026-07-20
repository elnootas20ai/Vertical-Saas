import type { Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { listBrandsRequest } from './brandsApi';
import {
  filterCatalogItemsForBusinessScope,
  type CatalogBusinessScopeOptions,
} from './catalogBusinessScope';
import { deliveryBusinessIdForTpv, resolveTpvCatalogBusinessId } from './tpvRegisterScope';
import { isRestaurantBusinessType } from './deliveryOpsTypes';

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
  const deliveryId = deliveryBusinessIdForTpv(businesses);
  const match = businesses.find(
    (b) =>
      String(b.business_id || b.id || '')
        .replace(/^business:/, '')
        .trim() === catalogBusinessId,
  );
  const activeBusinessType =
    match?.businessType ||
    (catalogBusinessId && catalogBusinessId === deliveryId ? 'delivery' : undefined);
  return {
    scopeBusinessId: String(scopeBusinessId || '').trim(),
    catalogBusinessId,
    accountBusinessCount,
    activeBusinessType,
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

  const catalogMatch = businesses.find(
    (b) =>
      String(b.business_id || b.id || '')
        .replace(/^business:/, '')
        .trim() === scope.catalogBusinessId,
  );
  if (isRestaurantBusinessType(catalogMatch?.businessType)) {
    return tryLoadBrands(scope.catalogBusinessId);
  }

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

  // Solo carta vendible: nunca ingredientes/stock en el TPV.
  const sellableRaw = rawItems.filter((item) => {
    if ((item.module || 'catalog') !== 'catalog') return false;
    if (item.module === 'stock' || item.isStockItem === true) return false;
    if (item.stockCategory && item.stockCategory !== 'finished_product') {
      const stockLike = ['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable'];
      if (stockLike.includes(item.stockCategory)) return false;
    }
    return item.itemType === 'product' || item.itemType === 'combo';
  });

  let items = filterCatalogItemsForBusinessScope(
    sellableRaw,
    scope.catalogBusinessId,
    brands,
    options,
  );

  if (items.length > 0 || sellableRaw.length === 0 || brands.length === 0) {
    return items;
  }

  // Restaurante: incluir productos importados sin vertical estricta si pertenecen a la cuenta.
  if (isRestaurantBusinessType(scope.activeBusinessType)) {
    const bid = scope.catalogBusinessId;
    const brandIds = new Set(brands.map((b) => String(b._id || '').trim()).filter(Boolean));
    const relaxed = sellableRaw.filter((item) => {
      const v = String(item.vertical || '').trim().toLowerCase();
      if (v === 'delivery') return false;
      if (v === 'restaurant') return true;
      const itemBid = String(item.business_id || (item as { businessId?: string }).businessId || '')
        .replace(/^business:/, '')
        .trim();
      if (itemBid && itemBid === bid) return true;
      const itemBrandIds = (item.brandIds ?? []).map((id) => String(id).trim()).filter(Boolean);
      if (itemBrandIds.some((id) => brandIds.has(id))) return true;
      return !v && brandIds.size === 0 && !itemBid;
    });
    if (relaxed.length > 0) return relaxed;
  }

  // Legacy sin business_id: conservar productos cuya línea comercial pertenece a esta cuenta.
  const brandIds = new Set(brands.map((b) => String(b._id || '').trim()).filter(Boolean));
  return sellableRaw.filter((item) =>
    (item.brandIds ?? []).some((id) => brandIds.has(String(id).trim())),
  );
}

export function tpvCatalogCacheKey(userId: string, scope: TpvCatalogLoadScope): string {
  return `${String(userId || '').trim()}:${scope.catalogBusinessId || 'no-biz'}`;
}
