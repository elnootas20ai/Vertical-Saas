import type { CatalogItem } from './deliveryApi';

const STOCK_CATEGORIES = new Set([
  'ingredient',
  'beverage',
  'packaging',
  'cleaning',
  'consumable',
]);

/**
 * Artículos que van en inventario (almacén): ingredientes, bebidas a granel, envases…
 * No incluye platos de carta (pizzas, hamburguesas) salvo que estén marcados explícitamente como stock.
 */
export function isStockInventoryItem(item: CatalogItem | null | undefined): boolean {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.itemType && item.itemType !== 'product') return false;

  if (item.isStockItem === true) return true;
  if (item.module === 'stock') return true;

  if (item.stockCategory === 'finished_product') return false;

  if (item.stockCategory && STOCK_CATEGORIES.has(item.stockCategory)) return true;

  // Productos de carta (module catalog) sin flag de inventario → no van al almacén
  if (item.module === 'catalog') return false;

  return false;
}

export function filterStockInventoryItems(items: CatalogItem[]): CatalogItem[] {
  return items.filter(isStockInventoryItem);
}

/** Resumen para borrado de Carta: cuántos también afectan al almacén. */
export type CatalogDeleteScopeSummary = {
  total: number;
  /** Solo venta / carta (no aparecen como inventario). */
  cartaOnly: number;
  /** Productos de carta que también controlan stock / salen en Almacén. */
  alsoWarehouse: number;
};

export function summarizeCatalogDeleteScope(
  items: Array<CatalogItem | null | undefined>,
): CatalogDeleteScopeSummary {
  const list = (items || []).filter(Boolean) as CatalogItem[];
  let alsoWarehouse = 0;
  for (const item of list) {
    if (isStockInventoryItem(item) || item.isStockItem === true) {
      alsoWarehouse += 1;
    }
  }
  return {
    total: list.length,
    cartaOnly: Math.max(0, list.length - alsoWarehouse),
    alsoWarehouse,
  };
}
