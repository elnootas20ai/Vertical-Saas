/**
 * Guardas para alertas de inventario: solo evaluar si el negocio tiene stock realmente configurado.
 */

/** Artículo de catálogo con seguimiento de inventario explícito. */
export function isStockTrackedCatalogItem(item) {
  if (!item || item.active === false || item.deletedAt) return false;
  if (item.isStockItem === true) return true;
  if (item.module === 'stock') return true;
  if (Array.isArray(item.warehouseStock) && item.warehouseStock.some((ws) => ws?.warehouseId)) return true;
  return false;
}

export function filterStockTrackedCatalogItems(items) {
  return (Array.isArray(items) ? items : []).filter(isStockTrackedCatalogItem);
}

/** Hay al menos un artículo con inventario activo. */
export function hasCatalogStockSetup(items) {
  return filterStockTrackedCatalogItems(items).length > 0;
}

/** Infraestructura de stock: almacenes, movimientos o artículos inventariables. */
export function hasStockInfrastructureDocs(docs) {
  const arr = Array.isArray(docs) ? docs : [];
  if (arr.some((d) => d?.type === 'warehouse' && d.active !== false && !d.deletedAt)) return true;
  if (arr.some((d) => d?.type === 'stock_movement' && !d.deletedAt)) return true;
  return hasCatalogStockSetup(arr.filter((d) => d?.type === 'catalog_item'));
}

/** ¿Puede emitir alertas de stock de catálogo? Requiere infraestructura + artículos inventariables. */
export function canEmitCatalogStockAlerts(catalogItems, infrastructureDocs = []) {
  const items = Array.isArray(catalogItems) ? catalogItems : [];
  const infra = [...items, ...(Array.isArray(infrastructureDocs) ? infrastructureDocs : [])];
  if (!hasStockInfrastructureDocs(infra)) return false;
  return hasCatalogStockSetup(items);
}

/** Pieza de taller con umbral de stock configurado. */
export function isStockTrackedPart(part) {
  if (!part || part.deletedAt) return false;
  return Number(part.minStock || 0) > 0;
}

export function filterStockTrackedParts(parts) {
  return (Array.isArray(parts) ? parts : []).filter(isStockTrackedPart);
}

export function hasPartsStockSetup(parts) {
  return filterStockTrackedParts(parts).length > 0;
}
