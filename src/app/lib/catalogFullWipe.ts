/**
 * Tras vaciar la Carta: limpia restos del Excel/import (almacén sync, ingredientes TPV,
 * recetas y organizadores vacíos). La plantilla Excel de descarga no se toca.
 */
import { deleteBrandRequest, listBrandsRequest, updateBrandRequest, type Brand } from './brandsApi';
import { commercialLineBrands } from './deliveryCatalogImportLogic';
import { isDefaultCommercialBrand } from './brandUtils';
import { commercialLinesWithoutCatalogItems } from './catalogItemMove';
import { deleteCatalogItemsRelentlessly } from './catalogBulkDelete';
import {
  filterCatalogItemsForBusinessScope,
} from './catalogBusinessScope';
import {
  getDeliveryConfigRequest,
  listCatalogItemsRequest,
  updateDeliveryConfigRequest,
  type CatalogItem,
} from './deliveryApi';
import {
  notifyDeliveryBrandsChanged,
  notifyDeliveryCatalogChanged,
  notifyDeliveryConfigChanged,
  normalizeBusinessScopeId,
} from './deliverySetup';
import { normalizeTenantUserId } from './tenantUserId';
import { deleteRecipeRequest, listRecipesRequest } from './recipeApi';
import { filterStockInventoryItems } from './stockInventoryScope';

export type CatalogFullWipeResult = {
  stockDeleted: number;
  cartaLeftoversDeleted: number;
  recipesDeleted: number;
  organizersDeleted: number;
  ingredientsCleared: boolean;
};

function itemInBusinessScope(item: CatalogItem, businessId: string): boolean {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return true;
  const ob = normalizeBusinessScopeId(
    String((item as { business_id?: string; businessId?: string }).business_id
      || (item as { businessId?: string }).businessId
      || ''),
  );
  return !ob || ob === bid;
}

export async function wipeCatalogLeftoversAfterEmptyCarta(
  userId: string,
  businessId: string | undefined,
  options?: {
    brands?: Brand[];
    accountBusinessCount?: number;
    businessType?: string;
  },
): Promise<CatalogFullWipeResult> {
  const uid = normalizeTenantUserId(userId);
  const bid = normalizeBusinessScopeId(businessId || '');
  if (!uid) {
    return {
      stockDeleted: 0,
      cartaLeftoversDeleted: 0,
      recipesDeleted: 0,
      organizersDeleted: 0,
      ingredientsCleared: false,
    };
  }

  const allItems = await listCatalogItemsRequest(uid).catch(() => [] as CatalogItem[]);
  const scoped = bid
    ? filterCatalogItemsForBusinessScope(
      allItems,
      bid,
      options?.brands || [],
      {
        accountBusinessCount: options?.accountBusinessCount,
        activeBusinessType: options?.businessType,
      },
    )
    : allItems.filter((item) => itemInBusinessScope(item, bid));

  const leftoverCarta = scoped.filter((item) => (item.module || 'catalog') === 'catalog' && !item.deletedAt);
  const stockItems = filterStockInventoryItems(scoped);

  let cartaLeftoversDeleted = 0;
  let stockDeleted = 0;

  if (leftoverCarta.length > 0) {
    const r = await deleteCatalogItemsRelentlessly(
      uid,
      leftoverCarta.map((i) => i._id),
      { maxRounds: 4 },
    );
    cartaLeftoversDeleted = r.deleted;
  }

  if (stockItems.length > 0) {
    const r = await deleteCatalogItemsRelentlessly(
      uid,
      stockItems.map((i) => i._id),
      { maxRounds: 4 },
    );
    stockDeleted = r.deleted;
  }

  let ingredientsCleared = false;
  try {
    const cfg = await getDeliveryConfigRequest(uid);
    const hasIngredients = Array.isArray(cfg.storeIngredients) && cfg.storeIngredients.length > 0;
    if (hasIngredients) {
      await updateDeliveryConfigRequest(uid, {
        _id: cfg._id || `dlvconf-${uid}`,
        _rev: cfg._rev,
        storeIngredients: [],
      });
      ingredientsCleared = true;
      notifyDeliveryConfigChanged();
    }
  } catch {
    /* best-effort */
  }

  let recipesDeleted = 0;
  try {
    const recipes = await listRecipesRequest(uid).catch(() => []);
    for (const recipe of recipes) {
      if (!recipe?._id || recipe.active === false) continue;
      try {
        await deleteRecipeRequest(uid, recipe._id);
        recipesDeleted += 1;
      } catch {
        /* best-effort */
      }
    }
  } catch {
    /* best-effort */
  }

  let organizersDeleted = 0;
  if (bid) {
    try {
      const brands = options?.brands?.length
        ? options.brands
        : await listBrandsRequest(bid).catch(() => [] as Brand[]);
      const commercial = commercialLineBrands(brands);
      // Tras wipe, carta vacía → todos los organizadores no-General están vacíos.
      const emptyLines = commercialLinesWithoutCatalogItems(commercial, []);
      for (const line of emptyLines) {
        if (isDefaultCommercialBrand(line)) continue;
        try {
          await deleteBrandRequest(bid, line._id);
          organizersDeleted += 1;
        } catch {
          /* best-effort */
        }
      }

      // Limpia pestañas/categorías TPV huérfanas en marcas que queden.
      const remaining = await listBrandsRequest(bid).catch(() => [] as Brand[]);
      for (const brand of remaining) {
        const cats = brand.catalogCategories || [];
        if (cats.length === 0) continue;
        try {
          await updateBrandRequest(bid, { ...brand, catalogCategories: [] });
        } catch {
          /* best-effort */
        }
      }

      if (organizersDeleted > 0) notifyDeliveryBrandsChanged();
    } catch {
      /* best-effort */
    }
  }

  notifyDeliveryCatalogChanged(uid, bid || undefined);

  return {
    stockDeleted,
    cartaLeftoversDeleted,
    recipesDeleted,
    organizersDeleted,
    ingredientsCleared,
  };
}
