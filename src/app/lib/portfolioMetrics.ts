import type { DeliveryOrder, DeliveryOrderStatus, TpvRegisterSession } from './deliveryApi';
import { dedupeOpenRegisterSessions } from './tpvCajaScope';

export type PortfolioMetrics = {
  revenueToday: number;
  revenueMonth: number;
  revenuePrevMonth: number;
  ordersToday: number;
  ordersMonth: number;
  ordersPrevMonth: number;
  deliveredToday: number;
  deliveredMonth: number;
  deliveredPrevMonth: number;
  activeOrders: number;
  cancelledMonth: number;
  avgTicketMonth: number;
  openCashRegisters: number;
  cashInRegisters: number;
  revenueByChannel: Record<string, number>;
  revenueByBrand: Record<string, number>;
};

export type PortfolioClientMetrics = {
  totalClients: number;
  newClientsMonth: number;
  newClientsPrevMonth: number;
};

export type PortfolioFinanceTotals = {
  incomeMonth: number;
  expensesMonth: number;
  incomePrevMonth: number;
  expensesPrevMonth: number;
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
    revenuePrevMonth: 0,
    ordersToday: 0,
    ordersMonth: 0,
    ordersPrevMonth: 0,
    deliveredToday: 0,
    deliveredMonth: 0,
    deliveredPrevMonth: 0,
    activeOrders: 0,
    cancelledMonth: 0,
    avgTicketMonth: 0,
    openCashRegisters: 0,
    cashInRegisters: 0,
    revenueByChannel: {},
    revenueByBrand: {},
  };
}

export function prevCalendarMonthKey(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month) return monthKey;
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Inicio del mes anterior (UTC) para pedir pedidos con cobertura MoM completa. */
export function portfolioOrderFetchFrom(monthKey: string): string {
  return `${prevCalendarMonthKey(monthKey)}-01T00:00:00.000Z`;
}

export function monthOverMonthPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function emptyPortfolioClientMetrics(): PortfolioClientMetrics {
  return { totalClients: 0, newClientsMonth: 0, newClientsPrevMonth: 0 };
}

export function computePortfolioClientMetrics(
  clients: Array<{ createdAt?: Date | string }>,
  monthKey: string,
): PortfolioClientMetrics {
  const prevKey = prevCalendarMonthKey(monthKey);
  let newClientsMonth = 0;
  let newClientsPrevMonth = 0;
  for (const client of clients) {
    const raw = client.createdAt;
    const iso = raw instanceof Date ? raw.toISOString() : String(raw || '');
    if (!iso) continue;
    if (isInMonth(iso, monthKey)) newClientsMonth += 1;
    else if (isInMonth(iso, prevKey)) newClientsPrevMonth += 1;
  }
  return { totalClients: clients.length, newClientsMonth, newClientsPrevMonth };
}

export function orderBelongsToPdvScope(
  order: DeliveryOrder,
  pdvIds: Set<string>,
  primaryPdvId: string | null,
  pdvWorkCenterId?: string | null,
  wcIdsInScope?: Set<string>,
): boolean {
  const oid = String(order.salesPointId || '').trim();
  if (oid) {
    if (pdvIds.has(oid)) return true;
    if (wcIdsInScope?.has(oid)) return true;
    const wcId = String(pdvWorkCenterId || '').trim();
    if (wcId && oid === wcId) return true;
    return false;
  }
  if (pdvIds.size === 0 && (!wcIdsInScope || wcIdsInScope.size === 0)) return false;
  return primaryPdvId ? pdvIds.has(primaryPdvId) : false;
}

function isToday(iso: string, todayKey: string): boolean {
  return String(iso || '').slice(0, 10) === todayKey;
}

function isInMonth(iso: string, monthKey: string): boolean {
  return String(iso || '').slice(0, 7) === monthKey;
}

/** Fecha efectiva de entrega (alineado con KPIs del backend). */
function orderDeliveredAtIso(order: DeliveryOrder): string {
  return String(order.deliveredAt || order.updatedAt || order.createdAt || '').trim();
}

function isDeliveredOrder(order: DeliveryOrder): boolean {
  return String(order.status || '').toLowerCase() === 'entregado';
}

function isDeliveredOnDay(order: DeliveryOrder, dayKey: string): boolean {
  if (!isDeliveredOrder(order)) return false;
  const when = orderDeliveredAtIso(order);
  return when ? isToday(when, dayKey) : false;
}

function isDeliveredInMonth(order: DeliveryOrder, monthKey: string): boolean {
  if (!isDeliveredOrder(order)) return false;
  const when = orderDeliveredAtIso(order);
  return when ? isInMonth(when, monthKey) : false;
}

/** Pedidos dentro del scope PDV/tienda (para gráficas y actividad del dashboard). */
export function filterOrdersToPortfolioScope(
  orders: DeliveryOrder[],
  pdvIds: string[],
  primaryPdvId: string | null,
  wcIdsInScope?: Set<string>,
): DeliveryOrder[] {
  const pdvSet = new Set(pdvIds);
  if (!pdvSet.size && (!wcIdsInScope || wcIdsInScope.size === 0)) return [];
  return orders.filter((o) => orderBelongsToPdvScope(o, pdvSet, primaryPdvId, null, wcIdsInScope));
}

export function sumDeliveredRevenueOnDay(orders: DeliveryOrder[], dayKey: string): number {
  return orders
    .filter((o) => isDeliveredOnDay(o, dayKey))
    .reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
}

export function countOrdersCreatedOnDay(orders: DeliveryOrder[], dayKey: string): number {
  return orders.filter((o) => isToday(String(o.createdAt || ''), dayKey)).length;
}

export function getDeliveryOrderDeliveredAtIso(order: DeliveryOrder): string {
  return orderDeliveredAtIso(order);
}

export function isDeliveryOrderDelivered(order: DeliveryOrder): boolean {
  return isDeliveredOrder(order);
}

export type StoreDeliveryMetrics = {
  deliveredToday: number;
  deliveredMonth: number;
  revenueMonth: number;
  activeOrders: number;
};

export function computeStoreDeliveryMetrics(
  orders: DeliveryOrder[],
  pdvId: string,
  todayKey: string,
  monthKey: string,
  pdvWorkCenterId?: string | null,
): StoreDeliveryMetrics {
  const pdvSet = new Set([pdvId]);
  const scoped = orders.filter((o) => orderBelongsToPdvScope(o, pdvSet, pdvId, pdvWorkCenterId));
  const deliveredMonth = scoped.filter((o) => isDeliveredInMonth(o, monthKey));
  const deliveredToday = scoped.filter((o) => isDeliveredOnDay(o, todayKey));
  const revenueMonth = deliveredMonth.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const activeOrders = scoped.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  return {
    deliveredToday: deliveredToday.length,
    deliveredMonth: deliveredMonth.length,
    revenueMonth: Math.round(revenueMonth * 100) / 100,
    activeOrders,
  };
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
  wcIdsInScope?: Set<string>,
): PortfolioMetrics {
  const pdvSet = new Set(pdvIds);
  if (!pdvSet.size && (!wcIdsInScope || wcIdsInScope.size === 0)) return emptyPortfolioMetrics();

  const monthKey = todayKey.slice(0, 7);
  const prevMonthKey = prevCalendarMonthKey(monthKey);
  const scoped = orders.filter((o) =>
    orderBelongsToPdvScope(o, pdvSet, primaryPdvId, null, wcIdsInScope),
  );
  const todayCreated = scoped.filter((o) => isToday(o.createdAt, todayKey));
  const deliveredToday = scoped.filter((o) => isDeliveredOnDay(o, todayKey));
  const deliveredMonth = scoped.filter((o) => isDeliveredInMonth(o, monthKey));
  const deliveredPrevMonth = scoped.filter((o) => isDeliveredInMonth(o, prevMonthKey));

  const revenueToday = deliveredToday.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const revenueMonth = deliveredMonth.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const revenuePrevMonth = deliveredPrevMonth.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);

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

  const activeOrders = scoped.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  const cancelledMonth = scoped.filter(
    (o) => o.status === 'cancelled' && isInMonth(String(o.updatedAt || o.createdAt || ''), monthKey),
  ).length;
  const avgTicketMonth =
    deliveredMonth.length > 0 ? revenueMonth / deliveredMonth.length : 0;

  return {
    revenueToday,
    revenueMonth,
    revenuePrevMonth: Math.round(revenuePrevMonth * 100) / 100,
    ordersToday: todayCreated.length,
    ordersMonth: scoped.filter((o) => isInMonth(String(o.createdAt || ''), monthKey)).length,
    ordersPrevMonth: scoped.filter((o) => isInMonth(String(o.createdAt || ''), prevMonthKey)).length,
    deliveredToday: deliveredToday.length,
    deliveredMonth: deliveredMonth.length,
    deliveredPrevMonth: deliveredPrevMonth.length,
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
  const open = dedupeOpenRegisterSessions(
    sessions.filter((s) => s.status === 'open' && pdvSet.has(String(s.pointOfSaleId || '').trim())),
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

function normalizeFinanceBusinessId(value: unknown): string {
  return String(value || '').replace(/^business:/, '').trim();
}

/** Finanzas del mes filtradas por empresa (movimientos con businessId). */
export function sumFinanceMonthForBusiness(
  movements: {
    date: string;
    type: string;
    totalAmount: number;
    status?: string;
    businessId?: string;
  }[],
  monthKey: string,
  businessId: string,
): PortfolioFinanceTotals {
  const bid = normalizeFinanceBusinessId(businessId);
  if (!bid) return sumFinanceMonth([], monthKey);
  return sumFinanceMonth(
    movements.filter((m) => normalizeFinanceBusinessId(m.businessId) === bid),
    monthKey,
  );
}

/** Suma finanzas por filas de empresa; con 1 empresa incluye movimientos legacy sin businessId. */
export function consolidatePortfolioFinance(
  movements: {
    date: string;
    type: string;
    totalAmount: number;
    status?: string;
    businessId?: string;
  }[],
  monthKey: string,
  businessIds: string[],
): PortfolioFinanceTotals {
  const totals: PortfolioFinanceTotals = {
    incomeMonth: 0,
    expensesMonth: 0,
    incomePrevMonth: 0,
    expensesPrevMonth: 0,
    profitMonth: 0,
    ebitdaMonth: 0,
    ebitdaMarginMonth: 0,
    pendingAmount: 0,
    cashBalance: 0,
  };

  const prevMonthKey = prevCalendarMonthKey(monthKey);

  for (const bid of businessIds) {
    const row = sumFinanceMonthForBusiness(movements, monthKey, bid);
    const rowPrev = sumFinanceMonthForBusiness(movements, prevMonthKey, bid);
    totals.incomeMonth += row.incomeMonth;
    totals.expensesMonth += row.expensesMonth;
    totals.incomePrevMonth += rowPrev.incomeMonth;
    totals.expensesPrevMonth += rowPrev.expensesMonth;
    totals.profitMonth += row.profitMonth;
    totals.pendingAmount += row.pendingAmount;
  }

  if (businessIds.length === 1) {
    const legacy = sumFinanceMonth(
      movements.filter((m) => !normalizeFinanceBusinessId(m.businessId)),
      monthKey,
    );
    const legacyPrev = sumFinanceMonth(
      movements.filter((m) => !normalizeFinanceBusinessId(m.businessId)),
      prevMonthKey,
    );
    totals.incomeMonth += legacy.incomeMonth;
    totals.expensesMonth += legacy.expensesMonth;
    totals.incomePrevMonth += legacyPrev.incomeMonth;
    totals.expensesPrevMonth += legacyPrev.expensesMonth;
    totals.profitMonth += legacy.profitMonth;
    totals.pendingAmount += legacy.pendingAmount;
  }

  totals.incomeMonth = Math.round(totals.incomeMonth * 100) / 100;
  totals.expensesMonth = Math.round(totals.expensesMonth * 100) / 100;
  totals.incomePrevMonth = Math.round(totals.incomePrevMonth * 100) / 100;
  totals.expensesPrevMonth = Math.round(totals.expensesPrevMonth * 100) / 100;
  totals.profitMonth = Math.round(totals.profitMonth * 100) / 100;
  totals.pendingAmount = Math.round(totals.pendingAmount * 100) / 100;
  return totals;
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
    incomePrevMonth: 0,
    expensesPrevMonth: 0,
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

export function fmtPercent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}

// ─── Desglose facturación por marca y tienda (misma empresa) ─────────────────

export type BrandStoreBillingCell = {
  storeId: string;
  revenueMonth: number;
  revenueToday: number;
  deliveredMonth: number;
  deliveredToday: number;
};

export type BrandBillingBreakdown = {
  brandId: string;
  revenueMonth: number;
  revenueToday: number;
  deliveredMonth: number;
  deliveredToday: number;
  sharePercent: number;
  stores: BrandStoreBillingCell[];
};

export type StoreBrandBillingCell = {
  brandId: string;
  revenueMonth: number;
  deliveredMonth: number;
};

export type StoreBillingBreakdown = {
  storeId: string;
  pdvId?: string;
  revenueMonth: number;
  revenueToday: number;
  deliveredMonth: number;
  deliveredToday: number;
  activeOrders: number;
  sharePercent: number;
  brands: StoreBrandBillingCell[];
};

export type CompanyBillingBreakdown = {
  totalRevenueMonth: number;
  totalRevenueToday: number;
  totalDeliveredMonth: number;
  unbrandedRevenueMonth: number;
  brands: BrandBillingBreakdown[];
  stores: StoreBillingBreakdown[];
};

type BillingCellAcc = {
  revenueMonth: number;
  revenueToday: number;
  deliveredMonth: number;
  deliveredToday: number;
};

function emptyBillingCell(): BillingCellAcc {
  return { revenueMonth: 0, revenueToday: 0, deliveredMonth: 0, deliveredToday: 0 };
}

function lineItemRevenue(item: {
  total?: number;
  unitPrice?: number;
  quantity?: number;
}): number {
  const total = Number(item?.total ?? 0);
  if (total > 0) return total;
  return Number(item?.unitPrice ?? 0) * Number(item?.quantity ?? 0);
}

function resolveOrderWorkCenterId(
  order: DeliveryOrder,
  primaryPdvId: string | null,
  pdvToWc: Map<string, string>,
  knownWcIds: Set<string>,
): string | null {
  const ref = String(order.salesPointId || '').trim();
  if (ref) {
    if (knownWcIds.has(ref)) return ref;
    const wc = pdvToWc.get(ref);
    if (wc) return wc;
  }
  if (primaryPdvId) {
    const wc = pdvToWc.get(primaryPdvId);
    if (wc) return wc;
  }
  return null;
}

function bumpDeliveredCount(cell: BillingCellAcc, order: DeliveryOrder, todayKey: string) {
  cell.deliveredMonth += 1;
  if (isDeliveredOnDay(order, todayKey)) cell.deliveredToday += 1;
}

/**
 * Facturación delivery del mes desglosada por marca comercial y tienda (centro de trabajo).
 * Usa líneas de pedido entregado con brandIds; bebidas/complementos sin marca → unbrandedRevenueMonth.
 */
export function computeCompanyBillingBreakdown(
  orders: DeliveryOrder[],
  brandIds: string[],
  storeRows: Array<{ id: string; pdvId?: string }>,
  pdvIds: string[],
  primaryPdvId: string | null,
  pdvToWc: Map<string, string>,
  todayKey: string,
  activeOrdersByStore?: Map<string, number>,
): CompanyBillingBreakdown {
  const monthKey = todayKey.slice(0, 7);
  const pdvSet = new Set(pdvIds);
  const knownWcIds = new Set(storeRows.map((s) => s.id));
  const scoped = orders.filter((o) =>
    orderBelongsToPdvScope(o, pdvSet, primaryPdvId, null, knownWcIds),
  );

  const brandMatrix = new Map<string, Map<string, BillingCellAcc>>();
  const storeTotals = new Map<string, BillingCellAcc>();
  const storeBrandMatrix = new Map<string, Map<string, { revenueMonth: number; deliveredMonth: number }>>();
  let unbrandedRevenueMonth = 0;
  let totalRevenueMonth = 0;
  let totalRevenueToday = 0;
  let totalDeliveredMonth = 0;

  for (const brandId of brandIds) {
    brandMatrix.set(brandId, new Map());
  }
  for (const store of storeRows) {
    storeTotals.set(store.id, emptyBillingCell());
    storeBrandMatrix.set(store.id, new Map());
  }

  for (const order of scoped) {
    if (!isDeliveredInMonth(order, monthKey)) continue;

    const storeId = resolveOrderWorkCenterId(order, primaryPdvId, pdvToWc, knownWcIds);
    const orderTotal = Number(order.totalAmount) || 0;
    totalRevenueMonth += orderTotal;
    if (isDeliveredOnDay(order, todayKey)) totalRevenueToday += orderTotal;
    totalDeliveredMonth += 1;

    const items = order.items || [];
    const brandsInOrder = new Set<string>();
    let brandedAmount = 0;

    for (const item of items) {
      const amount = lineItemRevenue(item);
      if (amount <= 0) continue;

      const itemBrandIds = (item.brandIds ?? [])
        .map((b) => String(b || '').trim())
        .filter(Boolean);

      if (itemBrandIds.length === 0) {
        unbrandedRevenueMonth += amount;
        continue;
      }

      brandedAmount += amount;
      const share = amount / itemBrandIds.length;

      for (const bid of itemBrandIds) {
        if (!brandMatrix.has(bid)) brandMatrix.set(bid, new Map());
        brandsInOrder.add(bid);

        const byStore = brandMatrix.get(bid)!;
        if (storeId) {
          if (!byStore.has(storeId)) byStore.set(storeId, emptyBillingCell());
          const cell = byStore.get(storeId)!;
          cell.revenueMonth += share;
          if (isDeliveredOnDay(order, todayKey)) cell.revenueToday += share;

          if (!storeBrandMatrix.get(storeId)!.has(bid)) {
            storeBrandMatrix.get(storeId)!.set(bid, { revenueMonth: 0, deliveredMonth: 0 });
          }
          const sb = storeBrandMatrix.get(storeId)!.get(bid)!;
          sb.revenueMonth += share;
        }
      }
    }

    if (brandedAmount <= 0 && orderTotal > 0) {
      unbrandedRevenueMonth += orderTotal;
    }

    if (storeId && storeTotals.has(storeId)) {
      const st = storeTotals.get(storeId)!;
      st.revenueMonth += orderTotal;
      if (isDeliveredOnDay(order, todayKey)) st.revenueToday += orderTotal;
      bumpDeliveredCount(st, order, todayKey);
    }

    for (const bid of brandsInOrder) {
      if (!storeId) continue;
      const byStore = brandMatrix.get(bid);
      const cell = byStore?.get(storeId);
      if (cell) bumpDeliveredCount(cell, order, todayKey);
      const sb = storeBrandMatrix.get(storeId)?.get(bid);
      if (sb) sb.deliveredMonth += 1;
    }
  }

  unbrandedRevenueMonth = Math.round(unbrandedRevenueMonth * 100) / 100;
  totalRevenueMonth = Math.round(totalRevenueMonth * 100) / 100;
  totalRevenueToday = Math.round(totalRevenueToday * 100) / 100;

  const brands: BrandBillingBreakdown[] = brandIds
    .map((brandId) => {
      const byStore = brandMatrix.get(brandId) || new Map();
      let revenueMonth = 0;
      let revenueToday = 0;
      let deliveredMonth = 0;
      let deliveredToday = 0;
      const stores: BrandStoreBillingCell[] = [];

      for (const [storeId, cell] of byStore.entries()) {
        revenueMonth += cell.revenueMonth;
        revenueToday += cell.revenueToday;
        deliveredMonth += cell.deliveredMonth;
        deliveredToday += cell.deliveredToday;
        stores.push({
          storeId,
          revenueMonth: Math.round(cell.revenueMonth * 100) / 100,
          revenueToday: Math.round(cell.revenueToday * 100) / 100,
          deliveredMonth: cell.deliveredMonth,
          deliveredToday: cell.deliveredToday,
        });
      }

      stores.sort((a, b) => b.revenueMonth - a.revenueMonth);

      return {
        brandId,
        revenueMonth: Math.round(revenueMonth * 100) / 100,
        revenueToday: Math.round(revenueToday * 100) / 100,
        deliveredMonth,
        deliveredToday,
        sharePercent:
          totalRevenueMonth > 0 ? Math.round((revenueMonth / totalRevenueMonth) * 1000) / 10 : 0,
        stores,
      };
    })
    .filter((b) => b.revenueMonth > 0 || b.deliveredMonth > 0)
    .sort((a, b) => b.revenueMonth - a.revenueMonth);

  const stores: StoreBillingBreakdown[] = storeRows
    .map((store) => {
      const cell = storeTotals.get(store.id) || emptyBillingCell();
      const brandCells = storeBrandMatrix.get(store.id) || new Map();
      const brandsForStore: StoreBrandBillingCell[] = [...brandCells.entries()]
        .map(([brandId, sb]) => ({
          brandId,
          revenueMonth: Math.round(sb.revenueMonth * 100) / 100,
          deliveredMonth: sb.deliveredMonth,
        }))
        .filter((b) => b.revenueMonth > 0)
        .sort((a, b) => b.revenueMonth - a.revenueMonth);

      return {
        storeId: store.id,
        pdvId: store.pdvId,
        revenueMonth: Math.round(cell.revenueMonth * 100) / 100,
        revenueToday: Math.round(cell.revenueToday * 100) / 100,
        deliveredMonth: cell.deliveredMonth,
        deliveredToday: cell.deliveredToday,
        activeOrders: activeOrdersByStore?.get(store.id) ?? 0,
        sharePercent:
          totalRevenueMonth > 0 ? Math.round((cell.revenueMonth / totalRevenueMonth) * 1000) / 10 : 0,
        brands: brandsForStore,
      };
    })
    .filter((s) => s.revenueMonth > 0 || s.deliveredMonth > 0 || s.activeOrders > 0)
    .sort((a, b) => b.revenueMonth - a.revenueMonth);

  return {
    totalRevenueMonth,
    totalRevenueToday,
    totalDeliveredMonth,
    unbrandedRevenueMonth,
    brands,
    stores,
  };
}
