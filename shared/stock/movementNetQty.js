/**
 * Neto de movimientos por artículo + almacén (salida − reverso).
 * Clave: catalogItemId + warehouseId para restaurar en el mismo almacén.
 */

const KEY_SEP = '\u0000';

export function movementNetKey(catalogItemId, warehouseId = '') {
  return `${String(catalogItemId || '').trim()}${KEY_SEP}${String(warehouseId || '').trim()}`;
}

export function parseMovementNetKey(key) {
  const raw = String(key || '');
  const i = raw.indexOf(KEY_SEP);
  if (i < 0) return { catalogItemId: raw, warehouseId: '' };
  return {
    catalogItemId: raw.slice(0, i),
    warehouseId: raw.slice(i + KEY_SEP.length),
  };
}

/**
 * @returns {Record<string, number>} mapa clave item+warehouse → neto
 */
export function netQtyByItemWarehousePair(movements, outboundType, inboundType) {
  const map = Object.create(null);
  for (const m of movements || []) {
    const id = String(m?.catalogItemId || '').trim();
    if (!id) continue;
    const q = Number(m?.quantity || 0);
    if (!(q > 0)) continue;
    const key = movementNetKey(id, m?.warehouseId);
    if (m.movementType === outboundType) map[key] = (map[key] || 0) + q;
    else if (m.movementType === inboundType) map[key] = (map[key] || 0) - q;
  }
  return map;
}

/** Agrega neto por catalogItemId (idempotencia de pedido, sin importar almacén). */
export function aggregateNetQtyByCatalogItem(netMap) {
  const out = Object.create(null);
  for (const [key, net] of Object.entries(netMap || {})) {
    const { catalogItemId } = parseMovementNetKey(key);
    if (!catalogItemId) continue;
    out[catalogItemId] = (out[catalogItemId] || 0) + Number(net || 0);
  }
  return out;
}
