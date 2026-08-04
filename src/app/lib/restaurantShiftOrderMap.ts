/**
 * Comandas de sala → forma DeliveryOrder para facturación por marca
 * (cierre, ShiftBrandBillingSummary, panel marcas). Sin I/O.
 */
import type { DeliveryOrder, DeliveryOrderItem } from './deliveryApi';
import type { DiningOrder } from './salaApi';

function diningItemsAsDeliveryItems(order: DiningOrder): DeliveryOrderItem[] {
  const out: DeliveryOrderItem[] = [];
  for (const comanda of order.comandas || []) {
    for (const it of comanda.items || []) {
      if (String(it.status || '').toLowerCase() === 'cancelled') continue;
      const qty = Number(it.quantity) || 0;
      if (qty <= 0) continue;
      const unit = Number(it.price) || 0;
      const brandIds = Array.isArray(it.brandIds)
        ? it.brandIds.map((b) => String(b || '').trim()).filter(Boolean)
        : [];
      out.push({
        id: it.id,
        productId: it.productId || '',
        name: it.name || '',
        quantity: qty,
        unitPrice: unit,
        total: Math.round(unit * qty * 100) / 100,
        category: it.category || '',
        notes: it.notes || '',
        brandIds,
      } as DeliveryOrderItem);
    }
  }
  return out;
}

/**
 * Pedido sala cobrado/cerrado como pedido de turno delivery-shaped
 * para buildShiftBrandRevenue / CompanyBrandPerformancePanel.
 */
export function diningOrderToShiftDeliveryOrder(order: DiningOrder): DeliveryOrder {
  const status = String(order.status || '').toLowerCase();
  const cancelled = status === 'cancelled';
  const paid = status === 'paid' || status === 'closed';
  const paidAt = String(order.paidAt || order.closedAt || '').trim();
  const createdAt = paid
    ? (paidAt || String(order.createdAt || '').trim())
    : String(order.createdAt || '').trim();
  const total = Number(order.total) || 0;
  const paidSum = (order.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paidAmount = paidSum > 0 ? paidSum : (paid ? total : 0);

  return {
    _id: order._id,
    id: order.id || order._id,
    createdAt,
    updatedAt: order.updatedAt || createdAt,
    deliveredAt: paidAt || undefined,
    status: cancelled ? 'cancelado' : paid ? 'entregado' : status,
    paymentStatus: cancelled ? undefined : paid ? 'paid' : undefined,
    paymentCollected: paid,
    totalAmount: total,
    total,
    paidAmount,
    items: diningItemsAsDeliveryItems(order),
    paymentMethod: order.payments?.[0]?.method || '',
    payments: (order.payments || []).map((p) => ({
      id: p.id,
      method: p.method,
      amount: Number(p.amount) || 0,
      paidAt: p.paidAt,
    })),
  } as DeliveryOrder;
}

export function diningOrdersToShiftDeliveryOrders(orders: DiningOrder[]): DeliveryOrder[] {
  return (orders || []).map(diningOrderToShiftDeliveryOrder);
}
