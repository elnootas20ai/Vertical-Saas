const STOCK_CATEGORIES = new Set([
  'ingredient',
  'beverage',
  'packaging',
  'cleaning',
  'consumable',
]);

/** Artículos de almacén (no platos de carta). */
export function isStockInventoryItem(item) {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.itemType && item.itemType !== 'product') return false;
  if (item.isStockItem === true) return true;
  if (item.module === 'stock') return true;
  if (item.stockCategory === 'finished_product') return false;
  if (item.stockCategory && STOCK_CATEGORIES.has(item.stockCategory)) return true;
  if (item.module === 'catalog') return false;
  return false;
}

export function filterStockInventoryItems(items) {
  return (Array.isArray(items) ? items : []).filter(isStockInventoryItem);
}
