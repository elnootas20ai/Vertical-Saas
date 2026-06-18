import type { DeliveryOrder, DeliveryOrderItem, TpvRegisterSession } from './deliveryApi';
import {
  isCancelledDeliveryOrder,
  isCompletedShiftOrder,
  isRefundedDeliveryOrder,
  orderInRegisterSession,
} from './tpvCajaScope';

export type ShiftProductLine = {
  key: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
};

export type ShiftCategoryGroup = {
  category: string;
  quantity: number;
  revenue: number;
  products: ShiftProductLine[];
};

export type ShiftOrderItemLine = {
  name: string;
  quantity: number;
  total: number;
  extras: string[];
};

export type ShiftOrderLine = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  paymentMethod: string;
  channel: string;
  total: number;
  itemCount: number;
  createdAt: string;
  items: ShiftOrderItemLine[];
};

export type ShiftSalesBreakdown = {
  orderCount: number;
  totalUnits: number;
  totalRevenue: number;
  categories: ShiftCategoryGroup[];
  orders: ShiftOrderLine[];
};

function lineRevenue(item: DeliveryOrderItem): number {
  const fromTotal = Number(item.total);
  if (Number.isFinite(fromTotal) && fromTotal > 0) return fromTotal;
  return Number(item.quantity || 0) * Number(item.unitPrice || 0);
}

/** Reparte el descuento del pedido proporcionalmente entre líneas. */
export function orderLineDiscountRatio(order: Pick<DeliveryOrder, 'totalAmount' | 'discountAmount'>, itemsSubtotal: number): number {
  if (itemsSubtotal <= 0) return 1;
  const discount = Number(order.discountAmount || 0);
  const explicitTotal = Number(order.totalAmount || 0);
  const netTotal = Number.isFinite(explicitTotal) && explicitTotal >= 0
    ? explicitTotal
    : Math.max(0, itemsSubtotal - (Number.isFinite(discount) && discount > 0 ? discount : 0));
  if (netTotal >= itemsSubtotal) return 1;
  return Math.max(0, netTotal / itemsSubtotal);
}

function netLineRevenue(item: DeliveryOrderItem, ratio: number): number {
  return Math.round(lineRevenue(item) * ratio * 100) / 100;
}

/** Ajusta centimos de redondeo para que las líneas sumen el total del pedido. */
export function distributeOrderLineTotals(lineTotals: number[], targetTotal: number): number[] {
  if (lineTotals.length === 0) return lineTotals;
  const raw = lineTotals.reduce((s, v) => s + v, 0);
  if (raw <= 0) return lineTotals.map(() => 0);
  const ratio = targetTotal / raw;
  const adjusted = lineTotals.map((v) => Math.round(v * ratio * 100) / 100);
  const diff = Math.round((targetTotal - adjusted.reduce((s, v) => s + v, 0)) * 100) / 100;
  if (diff !== 0) {
    adjusted[adjusted.length - 1] = Math.round((adjusted[adjusted.length - 1] + diff) * 100) / 100;
  }
  return adjusted;
}

function productKey(name: string, category: string): string {
  return `${category}::${name}`.toLowerCase();
}

/** Recuento cierre caja: ventas cobradas o entregadas en el turno. */
export function filterOrdersForRegisterSession(
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'>,
  orders: DeliveryOrder[],
): DeliveryOrder[] {
  return orders.filter((order) => {
    if (isCancelledDeliveryOrder(order)) return false;
    if (isRefundedDeliveryOrder(order)) return false;
    if (!orderInRegisterSession(order, session)) return false;
    return isCompletedShiftOrder(order);
  });
}

export function buildShiftSalesBreakdown(orders: DeliveryOrder[]): ShiftSalesBreakdown {
  const productMap = new Map<string, ShiftProductLine>();
  const categoryMap = new Map<string, ShiftCategoryGroup>();
  const orderLines: ShiftOrderLine[] = [];

  let totalUnits = 0;
  let totalRevenue = 0;

  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : [];
    const orderItemLines: ShiftOrderItemLine[] = [];
    let orderUnits = 0;
    let itemsSubtotal = 0;

    for (const item of items) {
      const qty = Number(item.quantity || 0);
      if (qty <= 0) continue;
      itemsSubtotal += lineRevenue(item);
    }

    const discountRatio = orderLineDiscountRatio(order, itemsSubtotal);
    const orderNetTotal = Number(order.totalAmount || 0);
    const resolvedOrderTotal = Number.isFinite(orderNetTotal) && orderNetTotal >= 0
      ? orderNetTotal
      : Math.round(itemsSubtotal * discountRatio * 100) / 100;

    const lineItems: Array<{ item: DeliveryOrderItem; qty: number; category: string; name: string; key: string; rawRevenue: number }> = [];
    for (const item of items) {
      const qty = Number(item.quantity || 0);
      if (qty <= 0) continue;
      const category = String(item.category || 'Sin categoría').trim() || 'Sin categoría';
      const name = String(item.name || 'Producto').trim() || 'Producto';
      lineItems.push({
        item,
        qty,
        category,
        name,
        key: productKey(name, category),
        rawRevenue: netLineRevenue(item, discountRatio),
      });
    }

    const adjustedTotals = distributeOrderLineTotals(
      lineItems.map((l) => l.rawRevenue),
      resolvedOrderTotal,
    );

    lineItems.forEach((line, idx) => {
      const revenue = adjustedTotals[idx] ?? line.rawRevenue;
      totalUnits += line.qty;
      orderUnits += line.qty;

      const existing = productMap.get(line.key);
      if (existing) {
        existing.quantity += line.qty;
        existing.revenue += revenue;
      } else {
        productMap.set(line.key, {
          key: line.key,
          name: line.name,
          category: line.category,
          quantity: line.qty,
          revenue,
        });
      }

      orderItemLines.push({
        name: line.name,
        quantity: line.qty,
        total: revenue,
        extras: Array.isArray(line.item.extras) ? line.item.extras.filter(Boolean) : [],
      });
    });

    totalRevenue += resolvedOrderTotal;

    orderLines.push({
      orderId: order._id || order.id,
      orderNumber: order.orderNumber || order.ticketNumber || order._id || '—',
      customerName: String(order.customerName || 'Cliente').trim() || 'Cliente',
      paymentMethod: String(order.paymentMethod || '—'),
      channel: String(order.channel || 'direct'),
      total: resolvedOrderTotal,
      itemCount: orderUnits,
      createdAt: order.createdAt || '',
      items: orderItemLines,
    });
  }

  for (const product of productMap.values()) {
    const catName = product.category;
    const group = categoryMap.get(catName);
    if (group) {
      group.quantity += product.quantity;
      group.revenue += product.revenue;
      group.products.push(product);
    } else {
      categoryMap.set(catName, {
        category: catName,
        quantity: product.quantity,
        revenue: product.revenue,
        products: [product],
      });
    }
  }

  const categories = [...categoryMap.values()]
    .map((g) => ({
      ...g,
      products: [...g.products].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity);

  orderLines.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    orderCount: orderLines.length,
    totalUnits,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    categories,
    orders: orderLines,
  };
}
