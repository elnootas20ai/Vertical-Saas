/**
 * Cantidad de stock por almacén (tienda).
 * Catálogo = mismo artículo; cantidad = por warehouseId.
 * Sin warehouseId → comportamiento legacy (stockQuantity global).
 */

export function normalizeWarehouseStockRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((ws) => ({
      warehouseId: String(ws?.warehouseId || '').trim(),
      warehouseName: String(ws?.warehouseName || '').trim(),
      quantity: Number(ws?.quantity || 0),
      minStock: Number(ws?.minStock || 0),
    }))
    .filter((ws) => ws.warehouseId);
}

export function sumWarehouseStockQuantities(rows) {
  return normalizeWarehouseStockRows(rows).reduce((s, ws) => s + Number(ws.quantity || 0), 0);
}

/**
 * Qty visible para un almacén.
 * - Con fila en warehouseStock → esa qty
 * - Sin filas aún → legacy stockQuantity (compartido hasta el 1er movimiento por almacén)
 * - Con filas pero sin esta tienda → 0
 */
export function quantityForWarehouse(item, warehouseId) {
  const wh = String(warehouseId || '').trim();
  const legacy = Number(item?.stockQuantity || 0);
  if (!wh) return legacy;

  const rows = normalizeWarehouseStockRows(item?.warehouseStock);
  if (rows.length === 0) return legacy;

  const hit = rows.find((ws) => ws.warehouseId === wh);
  return hit ? Number(hit.quantity || 0) : 0;
}

/**
 * Aplica delta (+/−) a un almacén.
 * Si warehouseStock estaba vacío, siembra el legacy en este almacén y luego aplica el delta.
 * Devuelve { warehouseStock, stockQuantity, previousQty, nextQty }.
 */
export function applyWarehouseStockDelta(item, warehouseId, delta, warehouseName = '') {
  const wh = String(warehouseId || '').trim();
  const d = Number(delta) || 0;
  if (!wh) {
    const previousQty = Number(item?.stockQuantity || 0);
    const nextQty = previousQty + d;
    return {
      warehouseStock: normalizeWarehouseStockRows(item?.warehouseStock),
      stockQuantity: nextQty,
      previousQty,
      nextQty,
    };
  }

  let rows = normalizeWarehouseStockRows(item?.warehouseStock);
  if (rows.length === 0) {
    const legacy = Number(item?.stockQuantity || 0);
    rows = [
      {
        warehouseId: wh,
        warehouseName: String(warehouseName || '').trim(),
        quantity: legacy,
        minStock: Number(item?.minStock || 0),
      },
    ];
  }

  const idx = rows.findIndex((ws) => ws.warehouseId === wh);
  const previousQty = idx >= 0 ? Number(rows[idx].quantity || 0) : 0;
  const nextQty = previousQty + d;

  if (idx >= 0) {
    rows[idx] = {
      ...rows[idx],
      quantity: nextQty,
      ...(warehouseName ? { warehouseName: String(warehouseName).trim() } : {}),
    };
  } else {
    rows.push({
      warehouseId: wh,
      warehouseName: String(warehouseName || '').trim(),
      quantity: nextQty,
      minStock: Number(item?.minStock || 0),
    });
  }

  return {
    warehouseStock: rows,
    stockQuantity: sumWarehouseStockQuantities(rows),
    previousQty,
    nextQty,
  };
}

export function storeWarehouseDisplayName(storeName) {
  const name = String(storeName || '').trim() || 'Tienda';
  if (/^almac[eé]n\b/i.test(name)) return name;
  return `Almacén ${name}`;
}
