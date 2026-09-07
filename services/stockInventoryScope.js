const STOCK_CATEGORIES = new Set([
  'ingredient',
  'beverage',
  'packaging',
  'cleaning',
  'consumable',
]);

/** Artículos de almacén. isStockItem / module stock mandan (también platos con control de stock). */
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

export function isSupplierPurchasableItem(item) {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.itemType && item.itemType !== 'product') return false;
  if (String(item.supplierId || '').trim()) return true;
  if (String(item.supplierName || '').trim()) return true;
  if (item.autoReorder === true) return true;
  return false;
}

/** Lista de revisión TPV / «Qué revisar»: almacén + comprables a proveedor. */
export function isStockRevisionItem(item) {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.itemType && item.itemType !== 'product') return false;
  if (isStockInventoryItem(item)) return true;
  if (isSupplierPurchasableItem(item)) return true;
  return false;
}

export function filterStockRevisionItems(items) {
  return (Array.isArray(items) ? items : []).filter(isStockRevisionItem);
}
