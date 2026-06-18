import type { CatalogItem } from './deliveryApi';
import { normalizeImportCategory, shouldClearBrandForCategory } from './deliveryCatalogImportLogic';

export type CatalogMoveBrandChoice = 'keep' | 'clear' | string;

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
