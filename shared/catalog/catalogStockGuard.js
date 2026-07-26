/**
 * Reglas de isStockItem para no “perder” la carta en el TPV.
 *
 * Bug histórico: al guardar un producto de carta sin enviar isStockItem,
 * Couch heredaba sticky `true` y, con stockCategory de almacén, el TPV lo ocultaba.
 */

const WAREHOUSE_STOCK_CATEGORIES = new Set([
  'ingredient',
  'packaging',
  'cleaning',
  'consumable',
  'raw_material',
]);

/**
 * @param {{ data?: object, existing?: object|null, module?: string }} args
 * @returns {boolean}
 */
export function resolveCatalogItemIsStockItem({ data = {}, existing = null, module } = {}) {
  const mod = String(module || data.module || existing?.module || 'catalog').trim() || 'catalog';

  if (mod === 'stock') {
    if (data.isStockItem !== undefined) return Boolean(data.isStockItem);
    if (existing?.isStockItem !== undefined) return Boolean(existing.isStockItem);
    return true;
  }

  // module === 'catalog' (carta vendible)
  if (data.isStockItem === false) return false;
  if (data.isStockItem === true) {
    // Permitir control de stock en carta (finished_product) sin convertir en almacén.
    return true;
  }

  // Campo omitido: NUNCA heredar sticky true en carta.
  // (Antes: existing.isStockItem true se quedaba para siempre.)
  return false;
}

/**
 * Fusiona customFields sin borrar allowlists/surcharges de combos
 * si el cliente no los manda en el update.
 */
export function mergeCatalogCustomFields(existingCf, incomingCf) {
  const prev = existingCf && typeof existingCf === 'object' ? { ...existingCf } : {};
  if (!incomingCf || typeof incomingCf !== 'object') return prev;
  const merged = { ...prev, ...incomingCf };
  for (const key of ['comboSlotAllowlists', 'comboSlotSurcharges']) {
    if (incomingCf[key] === undefined && prev[key] != null) {
      merged[key] = prev[key];
    }
  }
  return merged;
}

export { WAREHOUSE_STOCK_CATEGORIES };
