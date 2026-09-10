import type { CatalogItem } from './deliveryApi';
import { isSellableCartaCatalogSignal } from './tpvWarehouseCatalog';

const STOCK_CATEGORIES = new Set([
  'ingredient',
  'beverage',
  'packaging',
  'cleaning',
  'consumable',
]);

/**
 * Artículos de inventario (almacén).
 * isStockItem / module stock mandan (también platos o pizzas si controlan stock).
 * Sin eso, finished_product de carta pura queda fuera del almacén genérico.
 */
export function isStockInventoryItem(item: CatalogItem | null | undefined): boolean {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.itemType && item.itemType !== 'product') return false;

  if (item.isStockItem === true) return true;
  if (item.module === 'stock') return true;

  // Plato/carta sin control de stock: fuera del almacén.
  if (item.stockCategory === 'finished_product') return false;

  if (item.stockCategory && STOCK_CATEGORIES.has(item.stockCategory)) return true;

  if (item.module === 'catalog') return false;

  return false;
}

export function filterStockInventoryItems(items: CatalogItem[]): CatalogItem[] {
  return items.filter(isStockInventoryItem);
}

/**
 * Lo que se puede marcar / pedir a un proveedor («Qué te vende», pedidos, albaranes).
 * Almacén real (ingredientes, bebidas, envases…).
 * No incluye el plato de carta aunque tenga isStockItem (control de stock en ficha):
 * la carta se compra vía ingredientes de almacén, no el producto final de TPV.
 */
export function isSupplierOrderStockItem(item: CatalogItem | null | undefined): boolean {
  if (!isStockInventoryItem(item) || !item) return false;

  const mod = String(item.module || 'catalog').trim() || 'catalog';
  if (mod === 'stock') return true;

  const sc = String(item.stockCategory || '').trim();
  // Categoría de compra real aunque el doc diga module catalog.
  if (sc && STOCK_CATEGORIES.has(sc)) return true;

  // Plato / elaborado de carta (finished_product o señales TPV) → no comprable.
  if (sc === 'finished_product') return false;
  if (isSellableCartaCatalogSignal(item)) return false;

  return false;
}

export function filterSupplierOrderStockItems(items: CatalogItem[]): CatalogItem[] {
  return (items || []).filter(isSupplierOrderStockItem);
}

/** Comprable a proveedor (pedido / albarán). */
export function isSupplierPurchasableItem(item: CatalogItem | null | undefined): boolean {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.itemType && item.itemType !== 'product') return false;
  if (String(item.supplierId || '').trim()) return true;
  if (String(item.supplierName || '').trim()) return true;
  if (item.autoReorder === true) return true;
  return false;
}

/**
 * Qué puede salir en «Qué revisar» / pase de lista TPV:
 * almacén + control de stock + comprables a proveedor (aunque sea plato/pizza).
 */
export function isStockRevisionItem(item: CatalogItem | null | undefined): boolean {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.itemType && item.itemType !== 'product') return false;
  if (isStockInventoryItem(item)) return true;
  if (isSupplierPurchasableItem(item)) return true;
  return false;
}

export function filterStockRevisionItems(items: CatalogItem[]): CatalogItem[] {
  return (items || []).filter(isStockRevisionItem);
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
