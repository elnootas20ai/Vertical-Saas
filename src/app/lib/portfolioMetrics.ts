import type { DeliveryOrder, DeliveryOrderStatus, TpvRegisterSession } from './deliveryApi';
import {
  deliveryOrderIncomeAmount,
  shouldSyncDeliveryOrderIncome,
} from './deliveryOrderFinanceRules';
import { dedupeOpenRegisterSessions, localCalendarDayKey } from './tpvCajaScope';
import { countsTowardNewClientMetrics } from './clientAcquisition';
import {
  foodFamilyCountsFromOrdersToday,
  sumProductClosingCountsForDay,
} from './shiftFoodFamilyCounts';
import { soldProductCountsForDay } from './deliverySoldProductStats';

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
  /** Conteo diario pizzas / burgers / tacos / kebab (pedidos del día). */
  pizzasToday: number;
  burgersToday: number;
  tacosToday: number;
  kebabsToday: number;
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
    pizzasToday: 0,
    burgersToday: 0,
    tacosToday: 0,
    kebabsToday: 0,
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
  clients: Array<{
    createdAt?: Date | string;
    stats?: { acquisitionKind?: string; createdFrom?: string; excludeFromNewMetrics?: boolean } | null;
  }>,
  monthKey: string,
): PortfolioClientMetrics {
  const prevKey = prevCalendarMonthKey(monthKey);
  let newClientsMonth = 0;
  let newClientsPrevMonth = 0;
  for (const client of clients) {
    if (!countsTowardNewClientMetrics(client)) continue;
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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return localCalendarDayKey(d) === todayKey;
}

function isInMonth(iso: string, monthKey: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return localCalendarDayKey(d).slice(0, 7) === monthKey;
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
    .filter((o) => isRevenueOnDay(o, dayKey))
    .reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
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

/** Ingreso real: mismo criterio que el cobro financiero (pagado, no cancelado/devuelto). */
export function isDeliveryOrderRevenue(order: DeliveryOrder): boolean {
  return shouldSyncDeliveryOrderIncome(order);
}

export function deliveryOrderRevenueAmount(order: DeliveryOrder): number {
  if (!isDeliveryOrderRevenue(order)) return 0;
  return deliveryOrderIncomeAmount(order);
}

/** Día del cobro (ingresos); cae a entrega/creación si no hay paidAt. */
function orderRevenueAtIso(order: DeliveryOrder): string {
  return String(order.paidAt || order.deliveredAt || order.updatedAt || order.createdAt || '').trim();
}

function isRevenueOnDay(order: DeliveryOrder, dayKey: string): boolean {
  if (!isDeliveryOrderRevenue(order)) return false;
  const when = orderRevenueAtIso(order);
  return when ? isToday(when, dayKey) : false;
}

function isRevenueInMonth(order: DeliveryOrder, monthKey: string): boolean {
  if (!isDeliveryOrderRevenue(order)) return false;
  const when = orderRevenueAtIso(order);
  return when ? isInMonth(when, monthKey) : false;
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
  const revenueMonth = scoped
    .filter((o) => isRevenueInMonth(o, monthKey))
    .reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
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
  const revenueOrdersToday = scoped.filter((o) => isRevenueOnDay(o, todayKey));
  const revenueOrdersMonth = scoped.filter((o) => isRevenueInMonth(o, monthKey));
  const revenueOrdersPrevMonth = scoped.filter((o) => isRevenueInMonth(o, prevMonthKey));

  const revenueToday = revenueOrdersToday.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
  const revenueMonth = revenueOrdersMonth.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
  const revenuePrevMonth = revenueOrdersPrevMonth.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);

  const revenueByChannel: Record<string, number> = {};
  const revenueByBrand: Record<string, number> = {};

  for (const o of revenueOrdersMonth) {
    const orderRev = deliveryOrderRevenueAmount(o);
    const ch = channelLabel(o.channel);
    revenueByChannel[ch] = (revenueByChannel[ch] || 0) + orderRev;
    const items = o.items || [];
    const itemsTotal = items.reduce((s, item) => {
      const line = (Number(item.total) || 0) > 0 ? Number(item.total) : Number(item.unitPrice) * Number(item.quantity);
      return s + (Number.isFinite(line) ? line : 0);
    }, 0);
    for (const item of items) {
      const line = (Number(item.total) || 0) > 0 ? Number(item.total) : Number(item.unitPrice) * Number(item.quantity);
      const shareBase = itemsTotal > 0 ? (line / itemsTotal) * orderRev : 0;
      const brands = item.brandIds?.length ? item.brandIds : ['_sin_marca'];
      for (const bid of brands) {
        const key = String(bid || '_sin_marca');
        revenueByBrand[key] = (revenueByBrand[key] || 0) + shareBase / brands.length;
      }
    }
  }

  const activeOrders = scoped.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  const cancelledMonth = scoped.filter(
    (o) => o.status === 'cancelled' && isInMonth(String(o.updatedAt || o.createdAt || ''), monthKey),
  ).length;
  const avgTicketMonth =
    revenueOrdersMonth.length > 0 ? revenueMonth / revenueOrdersMonth.length : 0;

  const foodToday = foodFamilyCountsFromOrdersToday(scoped, todayKey);
  const soldToday = soldProductCountsForDay(scoped, todayKey);

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
    pizzasToday: Math.max(foodToday.pizza, soldToday.pizza),
    burgersToday: Math.max(foodToday.burger, soldToday.burger),
    tacosToday: Math.max(foodToday.taco, soldToday.taco),
    kebabsToday: soldToday.kebab,
  };
}

export function applyTpvCashMetrics(
  metrics: PortfolioMetrics,
  sessions: TpvRegisterSession[],
  pdvIds: string[],
  todayKey?: string,
): PortfolioMetrics {
  const pdvSet = new Set(pdvIds);
  const open = dedupeOpenRegisterSessions(
    sessions.filter((s) => s.status === 'open' && pdvSet.has(String(s.pointOfSaleId || '').trim())),
  );
  // Dinero físico en cajón = fondo de apertura + ventas en efectivo.
  // No es “ingreso/ganancia”: el fondo es capital del cajón, no cobro del día.
  const cashIn = open.reduce((sum, s) => {
    const sales = (s.transactions || [])
      .filter((t) => t.type === 'sale' && t.paymentMethod === 'efectivo')
      .reduce((a, t) => a + (Number(t.amount) || 0), 0);
    return sum + (Number(s.initialCashAmount) || 0) + sales;
  }, 0);

  const day = todayKey || new Date().toISOString().slice(0, 10);
  const fromClosings = sumProductClosingCountsForDay(sessions, day, pdvIds);

  return {
    ...metrics,
    openCashRegisters: open.length,
    cashInRegisters: Math.round(cashIn * 100) / 100,
    ...(fromClosings
      ? {
          pizzasToday: fromClosings.pizza,
          burgersToday: fromClosings.burger,
          tacosToday: fromClosings.taco,
        }
      : {}),
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
    if (!isRevenueInMonth(order, monthKey)) continue;

    const storeId = resolveOrderWorkCenterId(order, primaryPdvId, pdvToWc, knownWcIds);
    const orderTotal = deliveryOrderRevenueAmount(order);
    totalRevenueMonth += orderTotal;
    if (isRevenueOnDay(order, todayKey)) totalRevenueToday += orderTotal;
    totalDeliveredMonth += 1;

    const items = order.items || [];
    const brandsInOrder = new Set<string>();
    let brandedAmount = 0;
    const itemsTotal = items.reduce((s, item) => s + lineItemRevenue(item), 0);

    for (const item of items) {
      const amountRaw = lineItemRevenue(item);
      if (amountRaw <= 0) continue;
      const amount = itemsTotal > 0 ? (amountRaw / itemsTotal) * orderTotal : 0;
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
          if (isRevenueOnDay(order, todayKey)) cell.revenueToday += share;

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
      if (isRevenueOnDay(order, todayKey)) st.revenueToday += orderTotal;
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

// ─── Pulso operativo por tienda (7 días / mes) ───────────────────────────────

export type StoreOpsDay = {
  dayKey: string;
  /** Ej. "Lun 22" */
  label: string;
  /** Ej. "Lunes" */
  weekdayLabel: string;
  revenue: number;
  orders: number;
  pizza: number;
  burger: number;
  taco: number;
  kebab: number;
  /** vs día anterior; null el primero del rango */
  revenueDeltaPct: number | null;
};

export type StoreOpsPulse = {
  storeId: string;
  storeName: string;
  businessId: string;
  businessName: string;
  pdvId: string;
  days: StoreOpsDay[];
  revenuePeriod: number;
  revenuePrevPeriod: number;
  revenueMomPct: number | null;
  ordersPeriod: number;
  avgTicket: number;
  pizza: number;
  burger: number;
  taco: number;
  kebab: number;
  revenueToday: number;
  /** % del total del ranking; 0 hasta rankStoreOpsPulses */
  sharePercent: number;
};

const WEEKDAY_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAY_LONG_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function parseDayKeyLocal(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatOpsDayLabel(dayKey: string): { label: string; weekdayLabel: string } {
  const dt = parseDayKeyLocal(dayKey);
  const wd = dt.getDay();
  const dayNum = dt.getDate();
  return {
    label: `${WEEKDAY_SHORT_ES[wd]} ${dayNum}`,
    weekdayLabel: WEEKDAY_LONG_ES[wd],
  };
}

/** Claves de día locales consecutivas hacia atrás desde todayKey (incluye hoy). */
export function listTrailingDayKeys(todayKey: string, days: number): string[] {
  const n = Math.max(1, Math.floor(days));
  const base = parseDayKeyLocal(todayKey);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    out.push(localCalendarDayKey(dt));
  }
  return out;
}

/** Del día 1 del mes de todayKey hasta todayKey inclusive. */
export function listMonthToDateDayKeys(todayKey: string): string[] {
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const start = parseDayKeyLocal(monthStart);
  const end = parseDayKeyLocal(todayKey);
  const out: string[] = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    out.push(localCalendarDayKey(dt));
  }
  return out.length > 0 ? out : [todayKey];
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const dt = parseDayKeyLocal(dayKey);
  dt.setDate(dt.getDate() + deltaDays);
  return localCalendarDayKey(dt);
}

function foodCountsForDay(orders: DeliveryOrder[], dayKey: string): {
  pizza: number;
  burger: number;
  taco: number;
  kebab: number;
} {
  const food = foodFamilyCountsFromOrdersToday(orders, dayKey);
  const sold = soldProductCountsForDay(orders, dayKey);
  return {
    pizza: Math.max(food.pizza, sold.pizza || 0),
    burger: Math.max(food.burger, sold.burger || 0),
    taco: Math.max(food.taco, sold.taco || 0),
    kebab: sold.kebab || 0,
  };
}

function sumDayFood(days: StoreOpsDay[]): Pick<StoreOpsPulse, 'pizza' | 'burger' | 'taco' | 'kebab'> {
  return days.reduce(
    (acc, d) => ({
      pizza: acc.pizza + d.pizza,
      burger: acc.burger + d.burger,
      taco: acc.taco + d.taco,
      kebab: acc.kebab + d.kebab,
    }),
    { pizza: 0, burger: 0, taco: 0, kebab: 0 },
  );
}

export function emptyStoreOpsPulse(partial?: Partial<StoreOpsPulse>): StoreOpsPulse {
  return {
    storeId: '',
    storeName: '',
    businessId: '',
    businessName: '',
    pdvId: '',
    days: [],
    revenuePeriod: 0,
    revenuePrevPeriod: 0,
    revenueMomPct: null,
    ordersPeriod: 0,
    avgTicket: 0,
    pizza: 0,
    burger: 0,
    taco: 0,
    kebab: 0,
    revenueToday: 0,
    sharePercent: 0,
    ...partial,
  };
}

/**
 * Serie operativa de un PDV/tienda para un rango de días (p. ej. 7d o mes a la fecha).
 * Incluye comparación vs la ventana anterior de la misma longitud.
 */
export function buildStoreOpsPulse(
  orders: DeliveryOrder[],
  opts: {
    storeId: string;
    storeName: string;
    businessId: string;
    businessName: string;
    pdvId: string;
    workCenterId?: string | null;
    todayKey: string;
    dayKeys: string[];
  },
): StoreOpsPulse {
  const { storeId, storeName, businessId, businessName, pdvId, workCenterId, todayKey, dayKeys } = opts;
  if (!pdvId || dayKeys.length === 0) {
    return emptyStoreOpsPulse({ storeId, storeName, businessId, businessName, pdvId });
  }

  const pdvSet = new Set([pdvId]);
  const scoped = orders.filter((o) => orderBelongsToPdvScope(o, pdvSet, pdvId, workCenterId));

  const days: StoreOpsDay[] = dayKeys.map((dayKey, index) => {
    const food = foodCountsForDay(scoped, dayKey);
    const revenueOrders = scoped.filter((o) => isRevenueOnDay(o, dayKey));
    const revenue = Math.round(revenueOrders.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0) * 100) / 100;
    const ordersCount = revenueOrders.length;
    const prevKey = index > 0 ? dayKeys[index - 1] : null;
    let revenueDeltaPct: number | null = null;
    if (prevKey) {
      const prevRev = scoped
        .filter((o) => isRevenueOnDay(o, prevKey))
        .reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
      revenueDeltaPct = monthOverMonthPct(revenue, prevRev);
    }
    const labels = formatOpsDayLabel(dayKey);
    return {
      dayKey,
      label: labels.label,
      weekdayLabel: labels.weekdayLabel,
      revenue,
      orders: ordersCount,
      pizza: food.pizza,
      burger: food.burger,
      taco: food.taco,
      kebab: food.kebab,
      revenueDeltaPct,
    };
  });

  const revenuePeriod = Math.round(days.reduce((s, d) => s + d.revenue, 0) * 100) / 100;
  const ordersPeriod = days.reduce((s, d) => s + d.orders, 0);
  const foodTot = sumDayFood(days);

  const span = dayKeys.length;
  const firstKey = dayKeys[0];
  const prevEnd = shiftDayKey(firstKey, -1);
  const prevKeys = listTrailingDayKeys(prevEnd, span);
  let revenuePrevPeriod = 0;
  for (const pk of prevKeys) {
    revenuePrevPeriod += scoped
      .filter((o) => isRevenueOnDay(o, pk))
      .reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
  }
  revenuePrevPeriod = Math.round(revenuePrevPeriod * 100) / 100;

  const todayDay = days.find((d) => d.dayKey === todayKey);

  return {
    storeId,
    storeName,
    businessId,
    businessName,
    pdvId,
    days,
    revenuePeriod,
    revenuePrevPeriod,
    revenueMomPct: monthOverMonthPct(revenuePeriod, revenuePrevPeriod),
    ordersPeriod,
    avgTicket: ordersPeriod > 0 ? Math.round((revenuePeriod / ordersPeriod) * 100) / 100 : 0,
    pizza: foodTot.pizza,
    burger: foodTot.burger,
    taco: foodTot.taco,
    kebab: foodTot.kebab,
    revenueToday: todayDay?.revenue ?? 0,
    sharePercent: 0,
  };
}

/** Ordena por € del periodo y rellena sharePercent. */
export function rankStoreOpsPulses(pulses: StoreOpsPulse[]): StoreOpsPulse[] {
  const sorted = [...pulses].sort(
    (a, b) => b.revenuePeriod - a.revenuePeriod || a.storeName.localeCompare(b.storeName, 'es'),
  );
  const total = sorted.reduce((s, p) => s + p.revenuePeriod, 0);
  return sorted.map((p) => ({
    ...p,
    sharePercent: total > 0 ? Math.round((p.revenuePeriod / total) * 1000) / 10 : 0,
  }));
}

export function aggregateStoreOpsPulses(pulses: StoreOpsPulse[]): {
  revenuePeriod: number;
  revenuePrevPeriod: number;
  revenueMomPct: number | null;
  ordersPeriod: number;
  avgTicket: number;
  pizza: number;
  burger: number;
  taco: number;
  kebab: number;
  revenueToday: number;
} {
  const revenuePeriod = Math.round(pulses.reduce((s, p) => s + p.revenuePeriod, 0) * 100) / 100;
  const revenuePrevPeriod = Math.round(pulses.reduce((s, p) => s + p.revenuePrevPeriod, 0) * 100) / 100;
  const ordersPeriod = pulses.reduce((s, p) => s + p.ordersPeriod, 0);
  return {
    revenuePeriod,
    revenuePrevPeriod,
    revenueMomPct: monthOverMonthPct(revenuePeriod, revenuePrevPeriod),
    ordersPeriod,
    avgTicket: ordersPeriod > 0 ? Math.round((revenuePeriod / ordersPeriod) * 100) / 100 : 0,
    pizza: pulses.reduce((s, p) => s + p.pizza, 0),
    burger: pulses.reduce((s, p) => s + p.burger, 0),
    taco: pulses.reduce((s, p) => s + p.taco, 0),
    kebab: pulses.reduce((s, p) => s + p.kebab, 0),
    revenueToday: Math.round(pulses.reduce((s, p) => s + p.revenueToday, 0) * 100) / 100,
  };
}
