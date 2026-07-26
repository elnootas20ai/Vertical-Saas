/**
 * Qué cuenta como “solo almacén” frente a carta vendible en TPV/combos.
 * Compartido frontend (re-export) + API listCatalogItems?view=tpv.
 */

export const WAREHOUSE_ONLY_STOCK_CATEGORIES = [
  'ingredient',
  'packaging',
  'cleaning',
  'consumable',
  'raw_material',
];

/** Categorías típicas de carta (Excel / TPV), no almacén puro. */
const CARTA_CATEGORY_RE =
  /pizza|premium|hamburg|burger|complemento|acompa|guarnici|entrante|tapa|side|calzone|bowl|men[uú]|combo|bebida|refresco|postre|helado|especialidad/i;

/**
 * IDs referenciados por allowlists / suplementos de menús (Individual, Dúo…).
 * Esos productos deben seguir en el TPV aunque alguien active control de stock.
 */
export function collectComboReferencedProductIds(items) {
  const ids = new Set();
  for (const item of items || []) {
    if (item?.itemType !== 'combo') continue;
    const cf = item.customFields;
    if (!cf || typeof cf !== 'object') continue;
    const allow = cf.comboSlotAllowlists;
    if (allow && typeof allow === 'object' && !Array.isArray(allow)) {
      for (const value of Object.values(allow)) {
        if (!Array.isArray(value)) continue;
        for (const id of value) {
          const s = String(id || '').trim();
          if (s) ids.add(s);
        }
      }
    }
    const sur = cf.comboSlotSurcharges;
    if (sur && typeof sur === 'object' && !Array.isArray(sur)) {
      for (const [key, value] of Object.entries(sur)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          for (const id of Object.keys(value)) {
            const s = String(id || '').trim();
            if (s) ids.add(s);
          }
        } else if (typeof value === 'number' && Number.isFinite(value)) {
          const s = String(key || '').trim();
          if (s) ids.add(s);
        }
      }
    }
  }
  return ids;
}

/**
 * Señales claras de producto de carta vendible (Excel / menú / precio).
 * Si aplica, NUNCA se oculta solo por isStockItem===true.
 */
export function isSellableCartaCatalogSignal(item) {
  if (!item || typeof item !== 'object') return false;
  const cf = item.customFields && typeof item.customFields === 'object' ? item.customFields : {};
  if (cf.halfHalf === true) return true;
  if (cf.buildYourOwn === true) return true;

  const itemType = String(item.itemType || 'product').trim() || 'product';
  if (itemType !== 'product' && itemType !== 'combo') return false;

  const sc = String(item.stockCategory || '').trim();
  if (sc === 'finished_product') return true;
  if (itemType === 'combo') return true;

  const cat = String(item.category || '');
  if (cat && CARTA_CATEGORY_RE.test(cat)) return true;

  const price = Number(item.unitPrice);
  const hasPrice = Number.isFinite(price) && price > 0;
  if (
    hasPrice &&
    !WAREHOUSE_ONLY_STOCK_CATEGORIES.includes(sc) &&
    (!sc || sc === 'other' || sc === 'beverage' || sc === 'finished_product')
  ) {
    return true;
  }
  return false;
}

/**
 * Almacén puro (no carta): no debe salir en TPV.
 * OJO: muchas pizzas/burgers de carta tienen isStockItem=true (control de stock)
 * y DEBEN seguir siendo vendibles.
 *
 * `comboMenuReferenced`: producto en allowlist/suplemento de un menú → solo se oculta
 * si es almacén de verdad (module stock o categoría ingredient/envase/…).
 */
export function isTpvWarehouseOnlyCatalogItem(item, options = {}) {
  if (!item || typeof item !== 'object') return true;

  const cf = item.customFields && typeof item.customFields === 'object' ? item.customFields : {};
  if (cf.halfHalf === true) return false;

  const mod = String(item.module || 'catalog').trim() || 'catalog';
  if (mod === 'stock') return true;
  if (mod !== 'catalog') return true;

  const sc = String(item.stockCategory || '').trim();
  const comboMenuReferenced = Boolean(options.comboMenuReferenced);

  // Carta vendible (finished_product, combo, categoría carta, precio, halfHalf…):
  // NUNCA ocultar por isStockItem sticky.
  if (isSellableCartaCatalogSignal(item)) return false;

  // Allowlist/suplemento de menú: solo almacén puro.
  if (comboMenuReferenced) {
    return WAREHOUSE_ONLY_STOCK_CATEGORIES.includes(sc);
  }

  if (WAREHOUSE_ONLY_STOCK_CATEGORIES.includes(sc)) return true;

  // isStockItem sin categoría de almacén → visible (control stock en carta).
  if (item.isStockItem === true) {
    return WAREHOUSE_ONLY_STOCK_CATEGORIES.includes(sc);
  }

  return false;
}
