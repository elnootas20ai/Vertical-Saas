import type { Brand } from './brandsApi';
import type { CatalogItem } from './deliveryApi';
import { isDefaultCommercialBrand } from './brandUtils';
import { normalizeImportCategory, shouldClearBrandForCategory } from './deliveryCatalogImportLogic';

export type CatalogMoveBrandChoice = 'keep' | 'clear' | string;

/** Cuántos productos del catálogo usan cada línea TPV (brandIds). */
export function countCatalogItemsByBrandId(items: CatalogItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const raw of item.brandIds ?? []) {
      const id = String(raw || '').trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return counts;
}

/** Líneas comerciales / organizadores TPV sin ningún producto asignado (excepto «General»). */
export function commercialLinesWithoutCatalogItems(
  commercialLines: Brand[],
  items: CatalogItem[],
): Brand[] {
  const counts = countCatalogItemsByBrandId(items);
  return commercialLines.filter((line) => {
    if (isDefaultCommercialBrand(line)) return false;
    return (counts.get(line._id) || 0) === 0;
  });
}

export type CatalogMoveTargetInput = {
  category: string;
  brandChoice: CatalogMoveBrandChoice;
};

/** Aplica categoría y línea TPV a un producto del catálogo. */
export function applyCatalogMoveTarget(
  item: CatalogItem,
  target: CatalogMoveTargetInput,
): CatalogItem {
  const category = normalizeImportCategory(target.category);
  const next: CatalogItem = { ...item, category };

  if (shouldClearBrandForCategory(category)) {
    next.brandIds = [];
    return next;
  }

  if (target.brandChoice === 'keep') {
    return next;
  }
  if (target.brandChoice === 'clear') {
    next.brandIds = [];
    return next;
  }
  next.brandIds = target.brandChoice ? [target.brandChoice] : [];
  return next;
}
