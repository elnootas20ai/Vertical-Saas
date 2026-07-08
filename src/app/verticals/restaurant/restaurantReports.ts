import type { DiningOrder } from '../../lib/salaApi';

export interface RestaurantReportTotals {
  totalSales: number;
  ticketCount: number;
  avgTicket: number;
  totalGuests: number;
  totalTips: number;
}

export interface RestaurantDayRow {
  day: string;
  sales: number;
  tickets: number;
}

export interface RestaurantProductRow {
  name: string;
  quantity: number;
  revenue: number;
}

export interface RestaurantZoneRow {
  zone: string;
  sales: number;
  tickets: number;
}

function isBilledOrder(order: DiningOrder): boolean {
  return order.status === 'paid' || order.status === 'closed';
}

export function filterBilledOrders(
  orders: DiningOrder[],
  scopeBusinessId?: string,
): DiningOrder[] {
  const scope = String(scopeBusinessId || '').trim();
  return (orders || []).filter((order) => {
    if (!isBilledOrder(order)) return false;
    if (scope && order.businessId && order.businessId !== scope) return false;
    return true;
  });
}

export function computeRestaurantTotals(orders: DiningOrder[]): RestaurantReportTotals {
  let totalSales = 0;
  let totalGuests = 0;
  let totalTips = 0;
  for (const order of orders) {
    totalSales += Number(order.total) || 0;
    totalGuests += Number(order.guests) || 0;
    for (const payment of order.payments || []) {
      totalTips += Number(payment.tip) || 0;
    }
  }
  const ticketCount = orders.length;
  return {
    totalSales,
    ticketCount,
    avgTicket: ticketCount > 0 ? totalSales / ticketCount : 0,
    totalGuests,
    totalTips,
  };
}

function orderDay(order: DiningOrder): string {
  const raw = order.paidAt || order.closedAt || order.createdAt || '';
  return String(raw).slice(0, 10);
}

export function computeSalesByDay(orders: DiningOrder[]): RestaurantDayRow[] {
  const byDay = new Map<string, RestaurantDayRow>();
  for (const order of orders) {
    const day = orderDay(order);
    if (!day) continue;
    const row = byDay.get(day) || { day, sales: 0, tickets: 0 };
    row.sales += Number(order.total) || 0;
    row.tickets += 1;
    byDay.set(day, row);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function computeTopProducts(orders: DiningOrder[], limit = 10): RestaurantProductRow[] {
  const byProduct = new Map<string, RestaurantProductRow>();
  for (const order of orders) {
    for (const comanda of order.comandas || []) {
      if (comanda.status === 'cancelled') continue;
      for (const item of comanda.items || []) {
        if (item.status === 'cancelled') continue;
        const key = item.productId || item.name;
        const row = byProduct.get(key) || { name: item.name, quantity: 0, revenue: 0 };
        const qty = Number(item.quantity) || 1;
        row.quantity += qty;
        row.revenue += qty * (Number(item.price) || 0);
        byProduct.set(key, row);
      }
    }
  }
  return [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function computeSalesByZone(orders: DiningOrder[]): RestaurantZoneRow[] {
  const byZone = new Map<string, RestaurantZoneRow>();
  for (const order of orders) {
    const zone = order.zone || 'Sin zona';
    const row = byZone.get(zone) || { zone, sales: 0, tickets: 0 };
    row.sales += Number(order.total) || 0;
    row.tickets += 1;
    byZone.set(zone, row);
  }
  return [...byZone.values()].sort((a, b) => b.sales - a.sales);
}
