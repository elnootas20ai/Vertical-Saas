/**
 * Descuento de stock/recetas al cobrar una cuenta de mesa (dining_order).
 * Reutiliza recipeStockService — no pasa por Delivery UI.
 */
import { deductOrderByRecipe } from './recipeStockService.js';
import logger from './logger.js';

function flattenDiningItemsForStock(order) {
  const items = [];
  for (const comanda of order?.comandas || []) {
    if (String(comanda.status || '') === 'cancelled') continue;
    for (const item of comanda.items || []) {
      if (String(item.status || '') === 'cancelled') continue;
      const catalogItemId = String(item.productId || '').trim();
      const quantity = Number(item.quantity || 0);
      if (!catalogItemId || !(quantity > 0)) continue;
      items.push({ catalogItemId, quantity });
    }
  }
  return items;
}

/**
 * Idempotente vía movimientos referenceId = dining_order id.
 */
export async function maybeDeductRecipeStockForDiningOrder(req, userId, order, {
  performedBy = 'system',
} = {}) {
  if (!order?._id) return { deducted: [], warnings: [] };
  const st = String(order.status || '').toLowerCase();
  if (st === 'cancelled') return { deducted: [], warnings: [] };
  if (!(st === 'paid' || st === 'closed')) {
    const paid = (order.payments || []).reduce((s, p) => s + Number(p?.amount || 0), 0);
    if (paid + 0.02 < Number(order.total || 0)) {
      return { deducted: [], warnings: [] };
    }
  }

  const items = flattenDiningItemsForStock(order);
  if (items.length === 0) return { deducted: [], warnings: [] };

  try {
    let warehouseId = '';
    try {
      const { resolveWarehouseIdForSalesPoint } = await import('./storeWarehouseService.js');
      warehouseId = await resolveWarehouseIdForSalesPoint(
        req,
        userId,
        order.salesPointId || order.pointOfSaleId || '',
      );
    } catch {
      warehouseId = '';
    }
    const result = await deductOrderByRecipe(req, userId, {
      orderId: order._id,
      orderType: 'dining_order',
      items,
      warehouseId,
      performedBy,
    });
    if (result.warnings?.length) {
      logger.warn({
        tag: 'DINING_STOCK',
        orderId: order._id,
        warnings: result.warnings,
      }, 'Advertencias al descontar stock mesa');
    }
    return result;
  } catch (err) {
    logger.warn({
      tag: 'DINING_STOCK',
      orderId: order._id,
      err: err?.message,
    }, 'Error descontando stock mesa');
    return { deducted: [], warnings: [err?.message || 'Error stock'], blocked: false };
  }
}
