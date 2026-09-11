/**
 * Tras vaciar la Carta: limpia restos del Excel/import (almacén sync, ingredientes TPV,
 * recetas). Las marcas NO se borran aquí — solo a mano en Ajustes → Marca.
 * La plantilla Excel de descarga no se toca.
 */
import { listBrandsRequest, updateBrandRequest, type Brand } from './brandsApi';
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
  /** Siempre 0: las marcas no se eliminan al vaciar carta. */
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

  // Marcas: nunca borrar. Solo limpiar categorías TPV huérfanas si la carta quedó vacía.
  if (bid) {
    try {
      const remaining = options?.brands?.length
        ? options.brands
        : await listBrandsRequest(bid).catch(() => [] as Brand[]);
      let catsCleared = 0;
      for (const brand of remaining) {
        if (brand.deletedAt) continue;
        const cats = Array.isArray(brand.catalogCategories) ? brand.catalogCategories : [];
        if (cats.length === 0) continue;
        try {
          await updateBrandRequest(bid, { ...brand, catalogCategories: [] });
          catsCleared += 1;
        } catch {
          /* best-effort */
        }
      }
      if (catsCleared > 0) notifyDeliveryBrandsChanged();
    } catch {
      /* best-effort */
    }
  }

  notifyDeliveryCatalogChanged(uid, bid || undefined);

  return {
    stockDeleted,
    cartaLeftoversDeleted,
    recipesDeleted,
    organizersDeleted: 0,
    ingredientsCleared,
  };
}
