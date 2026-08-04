import type { DiningOrder } from '../../lib/salaApi';
import type { TpvRegisterSession, TpvRegisterTransaction } from '../../lib/deliveryApi';
import { registerSessionOrderLoadBounds } from '../../lib/tpvCajaScope';

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

type SessionTx = TpvRegisterTransaction & {
  linkedDiningOrderId?: string;
  tip?: number;
};

/** IDs de cuentas de mesa registradas en el turno (caja nativa sala). */
export function diningOrderIdsFromRegisterSession(
  session: Pick<TpvRegisterSession, 'transactions' | 'linkedOrderIds'> | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!session) return ids;
  for (const raw of session.linkedOrderIds || []) {
    const id = String(raw || '').trim();
    if (id) ids.add(id);
  }
  for (const tx of (session.transactions || []) as SessionTx[]) {
    if (String(tx.type || '') !== 'sale') continue;
    const linked = String(tx.linkedDiningOrderId || '').trim();
    if (linked) {
      ids.add(linked);
      continue;
    }
    const channel = String(tx.channel || '').trim().toLowerCase();
    const orderId = String(tx.orderId || '').trim();
    if (channel === 'sala' && orderId) ids.add(orderId);
  }
  return ids;
}

/**
 * Filtra cuentas cobradas del turno: prioriza IDs de caja;
 * si no hay vínculos, usa el rango temporal de la sesión.
 */
export function filterOrdersForRegisterSession(
  orders: DiningOrder[],
  session: Pick<
    TpvRegisterSession,
    'openedAt' | 'closedAt' | 'status' | 'transactions' | 'linkedOrderIds'
  > | null | undefined,
): DiningOrder[] {
  if (!session) return orders;
  const ids = diningOrderIdsFromRegisterSession(session);
  if (ids.size > 0) {
    return (orders || []).filter((order) => ids.has(String(order._id || '').trim()));
  }
  const bounds = registerSessionOrderLoadBounds(session);
  const fromMs = Date.parse(bounds.from);
  const toMs = Date.parse(bounds.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return orders;
  return (orders || []).filter((order) => {
    const ts = Date.parse(String(order.paidAt || order.closedAt || order.createdAt || ''));
    return Number.isFinite(ts) && ts >= fromMs && ts <= toMs;
  });
}

export function formatRegisterSessionLabel(session: TpvRegisterSession): string {
  const opened = session.openedAt
    ? new Date(session.openedAt).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
  const store = String(session.pointOfSaleName || session.pointOfSaleId || 'Caja').trim();
  const state = session.status === 'open' ? 'abierta' : 'cerrada';
  return `${store} · ${opened} (${state})`;
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

export interface RestaurantWaiterRow {
  waiterId: string;
  waiterName: string;
  sales: number;
  tickets: number;
  tips: number;
}

/** Ventas atribuidas al camarero que cobra (paidBy) o, si no, quien abrió la cuenta. */
export function computeSalesByWaiter(orders: DiningOrder[]): RestaurantWaiterRow[] {
  const byWaiter = new Map<string, RestaurantWaiterRow>();
  for (const order of orders) {
    const payments = order.payments || [];
    if (payments.length > 0) {
      for (const p of payments) {
        const waiterId = String(p.paidBy || order.createdBy || 'sin-asignar');
        const waiterName = String(p.paidByName || order.createdByName || 'Sin asignar');
        const row = byWaiter.get(waiterId) || {
          waiterId,
          waiterName,
          sales: 0,
          tickets: 0,
          tips: 0,
        };
        row.sales += Number(p.amount || 0);
        row.tips += Number(p.tip || 0);
        row.tickets += 1;
        byWaiter.set(waiterId, row);
      }
    } else {
      const waiterId = String(order.createdBy || 'sin-asignar');
      const waiterName = String(order.createdByName || 'Sin asignar');
      const row = byWaiter.get(waiterId) || {
        waiterId,
        waiterName,
        sales: 0,
        tickets: 0,
        tips: 0,
      };
      row.sales += Number(order.total || 0);
      row.tickets += 1;
      byWaiter.set(waiterId, row);
    }
  }
  return [...byWaiter.values()].sort((a, b) => b.sales - a.sales);
}

/** Export CSV simple (UTF-8 BOM para Excel ES). */
export function exportRestaurantReportCsv(params: {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}): void {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    params.headers.map(escape).join(';'),
    ...params.rows.map((r) => r.map(escape).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = params.filename;
  a.click();
  URL.revokeObjectURL(url);
}
