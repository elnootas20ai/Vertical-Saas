import type { DeliveryOrder, DeliveryOrderItem, TpvRegisterSession } from './deliveryApi';

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

const CANCELLED = new Set(['cancelled', 'cancelado']);

function lineRevenue(item: DeliveryOrderItem): number {
  const fromTotal = Number(item.total);
  if (Number.isFinite(fromTotal) && fromTotal > 0) return fromTotal;
  return Number(item.quantity || 0) * Number(item.unitPrice || 0);
}

function productKey(name: string, category: string): string {
  return `${category}::${name}`.toLowerCase();
}

export function filterOrdersForRegisterSession(
  session: Pick<TpvRegisterSession, 'linkedOrderIds' | 'transactions'>,
  orders: DeliveryOrder[],
): DeliveryOrder[] {
  const linked = new Set((session.linkedOrderIds || []).map(String));
  for (const tx of session.transactions || []) {
    if (tx.type !== 'sale') continue;
    const id = String(tx.linkedDeliveryOrderId || tx.orderId || '').trim();
    if (id) linked.add(id);
  }

  const active = orders.filter((o) => !CANCELLED.has(String(o.status || '').toLowerCase()));

  if (linked.size === 0) return active;

  return active.filter((o) => linked.has(o._id) || linked.has(o.id) || linked.has(o.orderNumber));
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

    for (const item of items) {
      const qty = Number(item.quantity || 0);
      if (qty <= 0) continue;
      const revenue = lineRevenue(item);
      const category = String(item.category || 'Sin categoría').trim() || 'Sin categoría';
      const name = String(item.name || 'Producto').trim() || 'Producto';
      const key = productKey(name, category);

      totalUnits += qty;
      orderUnits += qty;

      const existing = productMap.get(key);
      if (existing) {
        existing.quantity += qty;
        existing.revenue += revenue;
      } else {
        productMap.set(key, { key, name, category, quantity: qty, revenue });
      }

      orderItemLines.push({
        name,
        quantity: qty,
        total: revenue,
        extras: Array.isArray(item.extras) ? item.extras.filter(Boolean) : [],
      });
    }

    const orderTotal = Number(order.totalAmount || 0);
    totalRevenue += Number.isFinite(orderTotal) ? orderTotal : orderItemLines.reduce((s, i) => s + i.total, 0);

    orderLines.push({
      orderId: order._id || order.id,
      orderNumber: order.orderNumber || order.ticketNumber || order._id || '—',
      customerName: String(order.customerName || 'Cliente').trim() || 'Cliente',
      paymentMethod: String(order.paymentMethod || '—'),
      channel: String(order.channel || 'direct'),
      total: Number.isFinite(orderTotal) ? orderTotal : orderItemLines.reduce((s, i) => s + i.total, 0),
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
