import type { DeliveryOrder, DeliveryOrderStatus, TpvRegisterSession } from './deliveryApi';

export type PortfolioMetrics = {
  revenueToday: number;
  revenueMonth: number;
  ordersToday: number;
  ordersMonth: number;
  deliveredToday: number;
  deliveredMonth: number;
  activeOrders: number;
  cancelledMonth: number;
  avgTicketMonth: number;
  openCashRegisters: number;
  cashInRegisters: number;
  revenueByChannel: Record<string, number>;
  revenueByBrand: Record<string, number>;
};

export type PortfolioFinanceTotals = {
  incomeMonth: number;
  expensesMonth: number;
  profitMonth: number;
  ebitdaMonth: number;
  ebitdaMarginMonth: number;
  pendingAmount: number;
  cashBalance: number;
};

const ACTIVE_STATUSES: DeliveryOrderStatus[] = ['nuevo', 'cocina', 'listo', 'en_reparto', 'incident'];

export function emptyPortfolioMetrics(): PortfolioMetrics {
  return {
    revenueToday: 0,
    revenueMonth: 0,
    ordersToday: 0,
    ordersMonth: 0,
    deliveredToday: 0,
    deliveredMonth: 0,
    activeOrders: 0,
    cancelledMonth: 0,
    avgTicketMonth: 0,
    openCashRegisters: 0,
    cashInRegisters: 0,
    revenueByChannel: {},
    revenueByBrand: {},
  };
}

export function orderBelongsToPdvScope(
  order: DeliveryOrder,
  pdvIds: Set<string>,
  primaryPdvId: string | null,
): boolean {
  if (pdvIds.size === 0) return false;
  const oid = String(order.salesPointId || '').trim();
  if (!oid) {
    return primaryPdvId ? pdvIds.has(primaryPdvId) : false;
  }
  return pdvIds.has(oid);
}

function isToday(iso: string, todayKey: string): boolean {
  return String(iso || '').slice(0, 10) === todayKey;
}

function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    direct: 'Directo',
    phone: 'Teléfono',
    web: 'Web',
    app: 'App',
    tpv: 'TPV',
    glovo: 'Glovo',
    justeat: 'Just Eat',
    ubereats: 'Uber Eats',
  };
  return map[ch] || ch || 'Otro';
}

export function computePortfolioMetrics(
  orders: DeliveryOrder[],
  pdvIds: string[],
  primaryPdvId: string | null,
  todayKey: string,
): PortfolioMetrics {
  const pdvSet = new Set(pdvIds);
  if (!pdvSet.size) return emptyPortfolioMetrics();

  const scoped = orders.filter((o) => orderBelongsToPdvScope(o, pdvSet, primaryPdvId));
  const todayOrders = scoped.filter((o) => isToday(o.createdAt, todayKey));
  const monthOrders = scoped;

  const deliveredToday = todayOrders.filter((o) => o.status === 'entregado');
  const deliveredMonth = monthOrders.filter((o) => o.status === 'entregado');

  const revenueToday = deliveredToday.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const revenueMonth = deliveredMonth.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);

  const revenueByChannel: Record<string, number> = {};
  const revenueByBrand: Record<string, number> = {};

  for (const o of deliveredMonth) {
    const ch = channelLabel(o.channel);
    revenueByChannel[ch] = (revenueByChannel[ch] || 0) + (Number(o.totalAmount) || 0);
    for (const item of o.items || []) {
      const share = (Number(item.total) || 0) > 0 ? Number(item.total) : Number(item.unitPrice) * Number(item.quantity);
      const brands = item.brandIds?.length ? item.brandIds : ['_sin_marca'];
      for (const bid of brands) {
        const key = String(bid || '_sin_marca');
        revenueByBrand[key] = (revenueByBrand[key] || 0) + share / brands.length;
      }
    }
  }

  const activeOrders = monthOrders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  const cancelledMonth = monthOrders.filter((o) => o.status === 'cancelled').length;
  const avgTicketMonth =
    deliveredMonth.length > 0 ? revenueMonth / deliveredMonth.length : 0;

  return {
    revenueToday,
    revenueMonth,
    ordersToday: todayOrders.length,
    ordersMonth: monthOrders.length,
    deliveredToday: deliveredToday.length,
    deliveredMonth: deliveredMonth.length,
    activeOrders,
    cancelledMonth,
    avgTicketMonth,
    openCashRegisters: 0,
    cashInRegisters: 0,
    revenueByChannel,
    revenueByBrand,
  };
}

export function applyTpvCashMetrics(
  metrics: PortfolioMetrics,
  sessions: TpvRegisterSession[],
  pdvIds: string[],
): PortfolioMetrics {
  const pdvSet = new Set(pdvIds);
  const open = sessions.filter(
    (s) => s.status === 'open' && pdvSet.has(String(s.pointOfSaleId || '').trim()),
  );
  const cashIn = open.reduce((sum, s) => {
    const sales = (s.transactions || [])
      .filter((t) => t.type === 'sale' && t.paymentMethod === 'efectivo')
      .reduce((a, t) => a + (Number(t.amount) || 0), 0);
    return sum + (Number(s.initialCashAmount) || 0) + sales;
  }, 0);
  return {
    ...metrics,
    openCashRegisters: open.length,
    cashInRegisters: Math.round(cashIn * 100) / 100,
  };
}

export function pickPrimaryPdvIdFromList(pdvIds: string[], createdAtById: Map<string, string>): string | null {
  if (!pdvIds.length) return null;
  const sorted = [...pdvIds].sort((a, b) => {
    const ta = createdAtById.get(a) || '';
    const tb = createdAtById.get(b) || '';
    if (ta !== tb) return ta.localeCompare(tb);
    return a.localeCompare(b);
  });
  return sorted[0] || null;
}

export function sumFinanceMonth(
  movements: { date: string; type: string; totalAmount: number; status?: string }[],
  monthKey: string,
): PortfolioFinanceTotals {
  let incomeMonth = 0;
  let expensesMonth = 0;
  let pendingAmount = 0;

  for (const m of movements) {
    if (!String(m.date || '').startsWith(monthKey)) continue;
    const amt = Number(m.totalAmount) || 0;
    if (m.type === 'cobro') incomeMonth += amt;
    else expensesMonth += amt;
    if (m.status === 'pendiente' || m.status === 'pending') pendingAmount += amt;
  }

  return {
    incomeMonth,
    expensesMonth,
    profitMonth: incomeMonth - expensesMonth,
    ebitdaMonth: 0,
    ebitdaMarginMonth: 0,
    pendingAmount,
    cashBalance: 0,
  };
}

export function fmtEuro(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M€`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)} k€`;
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
