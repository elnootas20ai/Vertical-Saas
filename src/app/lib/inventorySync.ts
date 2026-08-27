import type { CatalogItem } from './deliveryApi';
import { createCatalogItemRequest, listCatalogItemsRequest, updateCatalogItemRequest } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import { filterStockInventoryItems } from './stockInventoryScope';
import {
  collectInventoryCandidates,
  defaultUnitForIngredient,
  foldIngredientKey,
  inventoryCandidateExclusionKey,
  inventoryItemKey,
  resolveCandidateCost,
  slugInventorySku,
} from './inventorySyncLogic';
import {
  findVertialStockTemplate,
  resolveVertialMinStock,
  resolveVertialReorderQuantity,
} from './vertialStockDefaults';

export type InventorySyncResult = {
  created: number;
  updated: number;
  skipped: number;
  candidates: number;
};

export { collectInventoryCandidates, buildInventoryLookupMaps } from './inventorySyncLogic';

function categoryLabelForCandidate(candidate: {
  stockCategory: string;
  source: string;
  templateId?: string;
}): string {
  if (candidate.templateId) {
    return findVertialStockTemplate(candidate.templateId)?.categoryLabel || 'Envases';
  }
  if (candidate.source === 'catalog_resale') {
    return candidate.stockCategory === 'beverage' ? 'Bebidas' : 'Reventa';
  }
  return 'Ingredientes';
}

export async function syncInventoryCatalogFromSources(
  userId: string,
  options: {
    businessType: string;
    businessId?: string;
    storeIngredients: StoreIngredient[];
    catalogItems?: CatalogItem[];
    brands?: Array<{ _id: string; deliveryLineKind?: string }>;
    /** Claves de artículos que el usuario eliminó del almacén (no recrear al sincronizar). */
    inventorySyncExcludedKeys?: string[];
  },
): Promise<InventorySyncResult> {
  const uid = String(userId || '').trim();
  if (!uid) return { created: 0, updated: 0, skipped: 0, candidates: 0 };

  const catalog = options.catalogItems ?? (await listCatalogItemsRequest(uid).catch(() => []));
  const inventoryItems = filterStockInventoryItems(catalog);
  const candidates = collectInventoryCandidates(options.storeIngredients, catalog);

  const existingByKey = new Map<string, CatalogItem>();
  for (const item of inventoryItems) {
    existingByKey.set(inventoryItemKey(item), item);
    existingByKey.set(`name:${foldIngredientKey(item.name)}`, item);
  }

  const usedSkus = new Set(
    catalog.map((i) => String(i.sku || '').trim().toLowerCase()).filter(Boolean),
  );

  const excludedKeys = new Set(
    (options.inventorySyncExcludedKeys || [])
      .map((k) => String(k || '').trim())
      .filter(Boolean),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (excludedKeys.has(inventoryCandidateExclusionKey(candidate))) {
      skipped += 1;
      continue;
    }
    const nameKey = foldIngredientKey(candidate.name);
    const hit =
      (candidate.templateId ? existingByKey.get(`tpl:${candidate.templateId}`) : undefined) ??
      (candidate.linkedCatalogItemId
        ? existingByKey.get(`cat:${candidate.linkedCatalogItemId}`)
        : undefined) ??
      (candidate.storeIngredientId
        ? existingByKey.get(`id:${candidate.storeIngredientId}`)
        : undefined) ??
      existingByKey.get(`name:${nameKey}`);

    const costPrice = resolveCandidateCost(candidate, options.brands);
    const minStock = resolveVertialMinStock(candidate.stockCategory);
    const reorderQuantity = resolveVertialReorderQuantity(candidate.stockCategory);

    if (!hit) {
      let sku = slugInventorySku(candidate.name);
      let suffix = 1;
      while (usedSkus.has(sku.toLowerCase())) {
        sku = `${slugInventorySku(candidate.name)}-${suffix}`;
        suffix += 1;
      }
      usedSkus.add(sku.toLowerCase());

      try {
        const createdItem = await createCatalogItemRequest(uid, {
          name: candidate.name,
          sku,
          category: categoryLabelForCandidate(candidate),
          module: 'stock',
          itemType: 'product',
          vertical: options.businessType || 'delivery',
          stockCategory: candidate.stockCategory,
          isStockItem: true,
          unit: candidate.unit || defaultUnitForIngredient(candidate.name, candidate.stockCategory),
          minStock,
          reorderQuantity,
          autoReorder: true,
          costPrice,
          stockQuantity: 0,
          active: true,
          available: true,
          webVisible: false,
          ...(options.businessId ? { business_id: options.businessId } : {}),
          customFields: {
            ...(candidate.storeIngredientId ? { storeIngredientId: candidate.storeIngredientId } : {}),
            ...(candidate.templateId ? { vertialStockTemplateId: candidate.templateId } : {}),
            ...(candidate.linkedCatalogItemId
              ? { linkedCatalogItemId: candidate.linkedCatalogItemId }
              : {}),
            inventorySyncSource: candidate.source,
            inventorySyncedAt: new Date().toISOString(),
            vertialStockAuto: true,
          },
        });
        existingByKey.set(inventoryItemKey(createdItem), createdItem);
        existingByKey.set(`name:${nameKey}`, createdItem);
        created += 1;
      } catch {
        skipped += 1;
      }
      continue;
    }

    const needsLink =
      (candidate.storeIngredientId &&
        String(hit.customFields?.storeIngredientId || '') !== candidate.storeIngredientId) ||
      (candidate.templateId &&
        String(hit.customFields?.vertialStockTemplateId || '') !== candidate.templateId) ||
      (candidate.linkedCatalogItemId &&
        String(hit.customFields?.linkedCatalogItemId || '') !== candidate.linkedCatalogItemId);
    const needsCost =
      costPrice > 0 &&
      !(Number(hit.costPrice) > 0) &&
      !(Number(hit.customFields?.costPriceLocked) > 0);
    const needsMin = !(Number(hit.minStock) > 0) && minStock > 0;
    const needsAutoReorder = hit.autoReorder !== true;

    if (!needsLink && !needsCost && !needsMin && !needsAutoReorder) {
      skipped += 1;
      continue;
    }

    try {
      const nextCustomFields = {
        ...(hit.customFields || {}),
        ...(needsLink && candidate.storeIngredientId
          ? { storeIngredientId: candidate.storeIngredientId }
          : {}),
        ...(needsLink && candidate.templateId
          ? { vertialStockTemplateId: candidate.templateId }
          : {}),
        ...(needsLink && candidate.linkedCatalogItemId
          ? { linkedCatalogItemId: candidate.linkedCatalogItemId }
          : {}),
        inventorySyncedAt: new Date().toISOString(),
        vertialStockAuto: true,
      };
      await updateCatalogItemRequest(uid, {
        ...hit,
        ...(needsCost ? { costPrice } : {}),
        ...(needsMin ? { minStock, reorderQuantity } : {}),
        ...(needsAutoReorder ? { autoReorder: true } : {}),
        customFields: nextCustomFields,
      });
      updated += 1;
    } catch {
      skipped += 1;
    }
  }

  return { created, updated, skipped, candidates: candidates.length };
}
