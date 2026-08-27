/**
 * Validación de stock disponible en almacén de origen para traspasos entre tiendas.
 */
import { quantityForWarehouse } from './warehouseStockQty.js';

/**
 * @param {Array<{ catalogItemId: string, name?: string, quantity: number }>} items
 * @param {Map<string, object>|Record<string, object>} catalogById
 * @param {string} warehouseId
 * @throws {Error} si alguna línea supera el disponible
 */
export function assertItemsAvailableInWarehouse(items, catalogById, warehouseId) {
  const wh = String(warehouseId || '').trim();
  if (!wh) throw new Error('Falta el almacén de origen para validar stock');

  const get = (id) => {
    if (!catalogById) return null;
    if (typeof catalogById.get === 'function') return catalogById.get(id) || null;
    return catalogById[id] || null;
  };

  for (const item of items || []) {
    const catalogItemId = String(item?.catalogItemId || '').trim();
    const qty = Number(item?.quantity || 0);
    if (!catalogItemId || !(qty > 0)) continue;
    const cat = get(catalogItemId);
    const available = quantityForWarehouse(cat, wh);
    if (qty > available + 1e-9) {
      const label = String(item?.name || cat?.name || catalogItemId).trim();
      const shown = Math.round(available * 10000) / 10000;
      throw new Error(
        `Stock insuficiente de "${label}" en origen (disponible: ${shown}, pedido: ${qty})`,
      );
    }
  }
}

/**
 * ¿Ya existe un movimiento de traspaso para esta línea (idempotencia)?
 */
export function hasStoreTransferLineMovement(movements, {
  movementType,
  catalogItemId,
  warehouseId,
}) {
  const type = String(movementType || '').trim();
  const itemId = String(catalogItemId || '').trim();
  const wh = String(warehouseId || '').trim();
  if (!type || !itemId) return false;
  return (movements || []).some(
    (m) =>
      String(m?.movementType || '') === type &&
      String(m?.catalogItemId || '') === itemId &&
      String(m?.warehouseId || '').trim() === wh,
  );
}
