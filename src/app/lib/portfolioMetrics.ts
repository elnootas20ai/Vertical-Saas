import type { DeliveryOrder, DeliveryOrderStatus, TpvRegisterSession } from './deliveryApi';
import {
  deliveryOrderIncomeAmount,
  shouldSyncDeliveryOrderIncome,
} from './deliveryOrderFinanceRules';
import { dedupeOpenRegisterSessions, localCalendarDayKey, sessionWorkDayKey } from './tpvCajaScope';
import { countsTowardNewClientMetrics } from './clientAcquisition';
import {
  foodFamilyCountsFromOrdersToday,
  sumProductClosingCountsForDay,
} from './shiftFoodFamilyCounts';
import { soldProductCountsForDay } from './deliverySoldProductStats';
import {
  attributeOrderRevenueByBrand,
  attributeOrderUnitsByBrand,
} from '../../../shared/delivery/orderLineRevenueSplit.js';
import type { BrandBillingSplitRules } from './brandBillingConfig';

export type PortfolioMetrics = {
  revenueToday: number;
  revenueMonth: number;
  revenuePrevMonth: number;
  /**
   * Facturación del mes anterior SOLO hasta el mismo día del mes (MTD vs MTD).
   * Para MoM justo: no comparar mes incompleto con mes anterior entero.
   */
  revenuePrevMonthMtd: number;
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
  /** Ingresos mes anterior hasta el mismo día (comparable MoM). */
  incomePrevMonthMtd: number;
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
    revenuePrevMonthMtd: 0,
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

export function monthDayNumber(dayKey: string): number {
  const n = Number(String(dayKey || '').slice(8, 10));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function lastDayOfYearMonth(yearMonth: string): number {
  const [y, m] = String(yearMonth || '').split('-').map(Number);
  if (!y || !m) return 28;
  return new Date(y, m, 0).getDate();
}

/** Día tope para MoM justo: min(día de hoy, último día del mes anterior). */
export function comparableMonthThroughDay(todayKey: string, prevMonthKey: string): number {
  return Math.min(monthDayNumber(todayKey), lastDayOfYearMonth(prevMonthKey));
}

/** Inicio del mes anterior (UTC) para pedir pedidos con cobertura MoM completa. */
export function portfolioOrderFetchFrom(monthKey: string): string {
  return `${prevCalendarMonthKey(monthKey)}-01T00:00:00.000Z`;
}

/**
 * Variación % entre dos periodos.
 * - Sin actividad en el periodo anterior (previous ≤ 0) → null
 *   (empresa nueva / aún no había histórico: no pintar -100% falso).
 * - Con actividad previa y caída a 0 (vacaciones, paro) → -100% (sí cuenta).
 */
export function monthOverMonthPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * MoM solo si ambos periodos tienen actividad (umbrales).
 * No usar para “caída a cero” (vacaciones): ahí usar monthOverMonthPct.
 */
export function comparableMomPct(
  current: number,
  previous: number,
  options?: { minAmount?: number },
): number | null {
  const min = options?.minAmount ?? 1;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous < min || current < min) return null;
  return monthOverMonthPct(current, previous);
}

/**
 * Primer día con ingreso real en el conjunto de pedidos (yyyy-mm-dd).
 * Sirve para no comparar meses anteriores al alta de la empresa.
 */
export function firstRevenueDayKey(orders: DeliveryOrder[]): string | null {
  let min: string | null = null;
  for (const o of orders || []) {
    if (!isDeliveryOrderRevenue(o)) continue;
    const when = orderRevenueAtIso(o);
    if (!when) continue;
    const d = new Date(when);
    const folded = Number.isNaN(d.getTime())
      ? String(when).slice(0, 10)
      : localCalendarDayKey(d);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(folded)) continue;
    if (!min || folded < min) min = folded;
  }
  return min;
}

/**
 * Mismos días 1..N del mes anterior (comparable al mes en curso a la fecha).
 * Ej. 2026-08-04 → 2026-07-01 … 2026-07-04.
 */
export function listPrevMonthToDateDayKeys(todayKey: string): string[] {
  const [y, m, d] = String(todayKey || '').split('-').map(Number);
  if (!y || !m || !d) return [];
  const prev = new Date(y, m - 2, 1);
  const lastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  const endDay = Math.min(d, lastDay);
  const out: string[] = [];
  for (let day = 1; day <= endDay; day += 1) {
    out.push(localCalendarDayKey(new Date(prev.getFullYear(), prev.getMonth(), day)));
  }
  return out;
}

/** True si dayKeys es mes-a-la-fecha (empieza el día 1 del mes de todayKey). */
export function isMonthToDateDayKeys(dayKeys: string[], todayKey: string): boolean {
  if (!dayKeys.length || !todayKey) return false;
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  return dayKeys[0] === monthStart && dayKeys[dayKeys.length - 1] === todayKey;
}

/**
 * Ventana anterior comparable al rango actual.
 * Mes a la fecha → mismos días del mes ant. (no el mes entero).
 * Otros rangos → N días previos contiguos.
 *
 * Nota: usa listTrailingDayKeys / shiftDayKey definidos más abajo (hoisted).
 */
export function resolvePrevComparableDayKeys(dayKeys: string[], todayKey: string): string[] {
  if (!dayKeys.length) return [];
  if (isMonthToDateDayKeys(dayKeys, todayKey)) {
    return listPrevMonthToDateDayKeys(todayKey);
  }
  const firstKey = dayKeys[0];
  const prevEnd = shiftDayKey(firstKey, -1);
  return listTrailingDayKeys(prevEnd, dayKeys.length);
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

function dayNumberFromIso(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return monthDayNumber(localCalendarDayKey(d));
}

/** Ingresos del mes hasta el día N (1..throughDay), para MoM comparable. */
function isRevenueInMonthThroughDay(
  order: DeliveryOrder,
  monthKey: string,
  throughDay: number,
): boolean {
  if (!isRevenueInMonth(order, monthKey)) return false;
  const when = orderRevenueAtIso(order);
  if (!when) return false;
  const day = dayNumberFromIso(when);
  return day != null && day >= 1 && day <= throughDay;
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
  const throughDay = comparableMonthThroughDay(todayKey, prevMonthKey);
  const revenueOrdersPrevMonthMtd = scoped.filter((o) =>
    isRevenueInMonthThroughDay(o, prevMonthKey, throughDay),
  );

  const revenueToday = revenueOrdersToday.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
  const revenueMonth = revenueOrdersMonth.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
  const revenuePrevMonth = revenueOrdersPrevMonth.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
  const revenuePrevMonthMtd = revenueOrdersPrevMonthMtd.reduce(
    (s, o) => s + deliveryOrderRevenueAmount(o),
    0,
  );

  const revenueByChannel: Record<string, number> = {};
  const revenueByBrand: Record<string, number> = {};

  for (const o of revenueOrdersMonth) {
    const orderRev = deliveryOrderRevenueAmount(o);
    const ch = channelLabel(o.channel);
    revenueByChannel[ch] = (revenueByChannel[ch] || 0) + orderRev;
    const attributed = attributeOrderRevenueByBrand(o);
    const attributedSum =
      Object.values(attributed.byBrand).reduce((s, n) => s + (Number(n) || 0), 0)
      + (Number(attributed.unbranded) || 0);
    const scale = attributedSum > 0 && orderRev > 0 ? orderRev / attributedSum : 1;
    for (const [bid, amt] of Object.entries(attributed.byBrand)) {
      revenueByBrand[bid] = (revenueByBrand[bid] || 0) + (Number(amt) || 0) * scale;
    }
    if ((Number(attributed.unbranded) || 0) > 0) {
      revenueByBrand._sin_marca =
        (revenueByBrand._sin_marca || 0) + (Number(attributed.unbranded) || 0) * scale;
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
    revenuePrevMonthMtd: Math.round(revenuePrevMonthMtd * 100) / 100,
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
  todayKey?: string,
): PortfolioFinanceTotals {
  const totals: PortfolioFinanceTotals = {
    incomeMonth: 0,
    expensesMonth: 0,
    incomePrevMonth: 0,
    incomePrevMonthMtd: 0,
    expensesPrevMonth: 0,
    profitMonth: 0,
    ebitdaMonth: 0,
    ebitdaMarginMonth: 0,
    pendingAmount: 0,
    cashBalance: 0,
  };

  const prevMonthKey = prevCalendarMonthKey(monthKey);
  const dayKey = todayKey || `${monthKey}-${String(lastDayOfYearMonth(monthKey)).padStart(2, '0')}`;
  const throughDay = comparableMonthThroughDay(dayKey, prevMonthKey);

  for (const bid of businessIds) {
    const row = sumFinanceMonthForBusiness(movements, monthKey, bid);
    const rowPrev = sumFinanceMonthForBusiness(movements, prevMonthKey, bid);
    const scoped = movements.filter((m) => normalizeFinanceBusinessId(m.businessId) === normalizeFinanceBusinessId(bid));
    totals.incomeMonth += row.incomeMonth;
    totals.expensesMonth += row.expensesMonth;
    totals.incomePrevMonth += rowPrev.incomeMonth;
    totals.incomePrevMonthMtd += sumFinanceIncomeThroughDay(scoped, prevMonthKey, throughDay);
    totals.expensesPrevMonth += rowPrev.expensesMonth;
    totals.profitMonth += row.profitMonth;
    totals.pendingAmount += row.pendingAmount;
  }

  if (businessIds.length === 1) {
    const legacyMovements = movements.filter((m) => !normalizeFinanceBusinessId(m.businessId));
    const legacy = sumFinanceMonth(legacyMovements, monthKey);
    const legacyPrev = sumFinanceMonth(legacyMovements, prevMonthKey);
    totals.incomeMonth += legacy.incomeMonth;
    totals.expensesMonth += legacy.expensesMonth;
    totals.incomePrevMonth += legacyPrev.incomeMonth;
    totals.incomePrevMonthMtd += sumFinanceIncomeThroughDay(legacyMovements, prevMonthKey, throughDay);
    totals.expensesPrevMonth += legacyPrev.expensesMonth;
    totals.profitMonth += legacy.profitMonth;
    totals.pendingAmount += legacy.pendingAmount;
  }

  totals.incomeMonth = Math.round(totals.incomeMonth * 100) / 100;
  totals.expensesMonth = Math.round(totals.expensesMonth * 100) / 100;
  totals.incomePrevMonth = Math.round(totals.incomePrevMonth * 100) / 100;
  totals.incomePrevMonthMtd = Math.round(totals.incomePrevMonthMtd * 100) / 100;
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
    incomePrevMonthMtd: 0,
    expensesPrevMonth: 0,
    profitMonth: incomeMonth - expensesMonth,
    ebitdaMonth: 0,
    ebitdaMarginMonth: 0,
    pendingAmount,
    cashBalance: 0,
  };
}

/** Ingresos de un mes solo hasta el día N (para MoM MTD vs MTD). */
export function sumFinanceIncomeThroughDay(
  movements: { date: string; type: string; totalAmount: number }[],
  monthKey: string,
  throughDay: number,
): number {
  let income = 0;
  for (const m of movements) {
    const date = String(m.date || '');
    if (!date.startsWith(monthKey)) continue;
    if (m.type !== 'cobro') continue;
    const day = monthDayNumber(date.length >= 10 ? date.slice(0, 10) : `${monthKey}-01`);
    if (day < 1 || day > throughDay) continue;
    income += Number(m.totalAmount) || 0;
  }
  return Math.round(income * 100) / 100;
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
 * Pedido 1 marca → todo a esa (incl. bebidas). Pedido cruzado → compartidos a partes iguales.
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

    const attributed = attributeOrderRevenueByBrand(order);
    const attributedSum =
      Object.values(attributed.byBrand).reduce((s, n) => s + (Number(n) || 0), 0)
      + (Number(attributed.unbranded) || 0);
    const scale = attributedSum > 0 && orderTotal > 0 ? orderTotal / attributedSum : 1;

    const brandsInOrder = new Set<string>();
    let brandedAmount = 0;

    for (const [bid, rawAmt] of Object.entries(attributed.byBrand)) {
      const amount = (Number(rawAmt) || 0) * scale;
      if (amount <= 0) continue;
      brandedAmount += amount;
      brandsInOrder.add(bid);

      if (!brandMatrix.has(bid)) brandMatrix.set(bid, new Map());
      const byStore = brandMatrix.get(bid)!;
      if (storeId) {
        if (!byStore.has(storeId)) byStore.set(storeId, emptyBillingCell());
        const cell = byStore.get(storeId)!;
        cell.revenueMonth += amount;
        if (isRevenueOnDay(order, todayKey)) cell.revenueToday += amount;

        if (!storeBrandMatrix.get(storeId)!.has(bid)) {
          storeBrandMatrix.get(storeId)!.set(bid, { revenueMonth: 0, deliveredMonth: 0 });
        }
        const sb = storeBrandMatrix.get(storeId)!.get(bid)!;
        sb.revenueMonth += amount;
      }
    }

    unbrandedRevenueMonth += (Number(attributed.unbranded) || 0) * scale;

    if (brandedAmount <= 0 && orderTotal > 0 && (Number(attributed.unbranded) || 0) <= 0) {
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

/** Columnas del Excel Uriel (EFECTIVO · TPV · X · App · UBER · JUST EAT · GLOVO). */
export type OpsExcelChannels = {
  efectivo: number;
  tpv: number;
  x: number;
  app: number;
  uber: number;
  justEat: number;
  glovo: number;
};

export function emptyOpsExcelChannels(): OpsExcelChannels {
  return {
    efectivo: 0,
    tpv: 0,
    x: 0,
    app: 0,
    uber: 0,
    justEat: 0,
    glovo: 0,
  };
}

export function sumOpsExcelChannels(a: OpsExcelChannels, b: OpsExcelChannels): OpsExcelChannels {
  return {
    efectivo: Math.round((a.efectivo + b.efectivo) * 100) / 100,
    tpv: Math.round((a.tpv + b.tpv) * 100) / 100,
    x: Math.round((a.x + b.x) * 100) / 100,
    app: Math.round((a.app + b.app) * 100) / 100,
    uber: Math.round((a.uber + b.uber) * 100) / 100,
    justEat: Math.round((a.justEat + b.justEat) * 100) / 100,
    glovo: Math.round((a.glovo + b.glovo) * 100) / 100,
  };
}

export function opsExcelChannelsTotal(c: OpsExcelChannels): number {
  return Math.round(
    (c.efectivo + c.tpv + c.x + c.app + c.uber + c.justEat + c.glovo) * 100,
  ) / 100;
}

/**
 * Reparte un importe al bucket del Excel Uriel (mismo criterio que cierres):
 * apps → Glovo/Uber/Just Eat/App; resto local por método de pago → Efectivo/TPV/X.
 */
export function addAmountToOpsExcelChannels(
  acc: OpsExcelChannels,
  amount: number,
  channel: string | undefined | null,
  paymentMethod: string | undefined | null,
): void {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (amt <= 0) return;
  const ch = String(channel || '').toLowerCase().trim();
  if (ch === 'glovo') {
    acc.glovo = Math.round((acc.glovo + amt) * 100) / 100;
    return;
  }
  if (ch === 'justeat' || ch === 'just_eat' || ch === 'just-eat') {
    acc.justEat = Math.round((acc.justEat + amt) * 100) / 100;
    return;
  }
  if (ch === 'ubereats' || ch === 'uber' || ch === 'uber_eats') {
    acc.uber = Math.round((acc.uber + amt) * 100) / 100;
    return;
  }
  if (ch === 'flipdish' || ch === 'app') {
    acc.app = Math.round((acc.app + amt) * 100) / 100;
    return;
  }
  const pm = String(paymentMethod || '').toLowerCase().trim();
  if (pm === 'efectivo' || pm === 'cash') {
    acc.efectivo = Math.round((acc.efectivo + amt) * 100) / 100;
    return;
  }
  if (pm === 'bizum' || pm === 'otro') {
    acc.x = Math.round((acc.x + amt) * 100) / 100;
    return;
  }
  if (pm === 'online') {
    acc.app = Math.round((acc.app + amt) * 100) / 100;
    return;
  }
  // tarjeta / tpv / sin método → TPV (VISA en plantilla manual)
  acc.tpv = Math.round((acc.tpv + amt) * 100) / 100;
}

function channelsFromOrders(orders: DeliveryOrder[]): OpsExcelChannels {
  const acc = emptyOpsExcelChannels();
  for (const o of orders) {
    addAmountToOpsExcelChannels(
      acc,
      deliveryOrderRevenueAmount(o),
      o.channel,
      o.paymentMethod,
    );
  }
  return acc;
}

const VERTIAL_APP_CHANNELS = ['flipdish', 'app'] as const;

/**
 * Totales de integradores declarados a mano al cierre (Caja 2).
 * Misma prioridad que el Excel Uriel: aggregatorClosingTotals > salesByChannel.
 */
export function aggregatorChannelsFromClosingSessions(
  sessions: TpvRegisterSession[],
  dayKey: string,
  pdvId: string,
  workCenterId?: string | null,
): Pick<OpsExcelChannels, 'app' | 'uber' | 'justEat' | 'glovo'> | null {
  const pid = String(pdvId || '').trim();
  if (!pid || !dayKey || !Array.isArray(sessions) || sessions.length === 0) return null;
  const aliases = new Set([pid]);
  const wc = String(workCenterId || '').trim();
  if (wc) aliases.add(wc);

  const daySessions = sessions.filter((s) => {
    const sid = String(s.pointOfSaleId || '').trim();
    if (!sid || !aliases.has(sid)) return false;
    const workDay = sessionWorkDayKey(s);
    return workDay === dayKey;
  });
  if (daySessions.length === 0) return null;

  const channelAmt = (session: TpvRegisterSession, channel: string): number => {
    const fromAgg = Number(session.aggregatorClosingTotals?.[channel] || 0);
    if (fromAgg > 0) return Math.round(fromAgg * 100) / 100;
    const fromSummary = Number(session.summary?.salesByChannel?.[channel] || 0);
    const fromSession = Number(session.salesByChannel?.[channel] || 0);
    return Math.round((fromAgg || fromSummary || fromSession) * 100) / 100;
  };

  let glovo = 0;
  let uber = 0;
  let justEat = 0;
  let app = 0;
  let declared = false;
  for (const s of daySessions) {
    const hasAgg =
      s.aggregatorClosingTotals &&
      Object.values(s.aggregatorClosingTotals).some((v) => Number(v) > 0);
    if (hasAgg) declared = true;
    glovo += channelAmt(s, 'glovo');
    uber += channelAmt(s, 'ubereats');
    justEat += channelAmt(s, 'justeat');
    for (const ch of VERTIAL_APP_CHANNELS) {
      app += channelAmt(s, ch);
    }
  }
  glovo = Math.round(glovo * 100) / 100;
  uber = Math.round(uber * 100) / 100;
  justEat = Math.round(justEat * 100) / 100;
  app = Math.round(app * 100) / 100;

  if (!declared && glovo <= 0 && uber <= 0 && justEat <= 0 && app <= 0) return null;
  return { glovo, uber, justEat, app };
}

/** Pedidos locales + overlay de lo tecleado en Caja 2 (Glovo / Uber / Just Eat / App). */
function channelsForOpsDay(
  orders: DeliveryOrder[],
  sessions: TpvRegisterSession[] | undefined,
  dayKey: string,
  pdvId: string,
  workCenterId?: string | null,
): { channels: OpsExcelChannels; fromClosing: boolean } {
  const base = channelsFromOrders(orders);
  if (!sessions?.length) return { channels: base, fromClosing: false };
  const fromClosing = aggregatorChannelsFromClosingSessions(sessions, dayKey, pdvId, workCenterId);
  if (!fromClosing) return { channels: base, fromClosing: false };
  return {
    channels: {
      ...base,
      glovo: fromClosing.glovo,
      uber: fromClosing.uber,
      justEat: fromClosing.justEat,
      app: fromClosing.app,
    },
    fromClosing: true,
  };
}

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
  /** Desglose tipo Excel Uriel del día */
  channels: OpsExcelChannels;
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
  /** Totales del rango · mismas columnas que el Excel */
  channels: OpsExcelChannels;
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
    channels: emptyOpsExcelChannels(),
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
    /** Sesiones de caja: Glovo/Uber/JE/App desde lo declarado al cierre (Caja 2). */
    sessions?: TpvRegisterSession[];
  },
): StoreOpsPulse {
  const {
    storeId,
    storeName,
    businessId,
    businessName,
    pdvId,
    workCenterId,
    todayKey,
    dayKeys,
    sessions,
  } = opts;
  if (!pdvId || dayKeys.length === 0) {
    return emptyStoreOpsPulse({ storeId, storeName, businessId, businessName, pdvId });
  }

  const pdvSet = new Set([pdvId]);
  const scoped = orders.filter((o) => orderBelongsToPdvScope(o, pdvSet, pdvId, workCenterId));

  const days: StoreOpsDay[] = dayKeys.map((dayKey, index) => {
    const food = foodCountsForDay(scoped, dayKey);
    const revenueOrders = scoped.filter((o) => isRevenueOnDay(o, dayKey));
    const orderRevenue =
      Math.round(revenueOrders.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0) * 100) / 100;
    const ordersCount = revenueOrders.length;
    const { channels, fromClosing } = channelsForOpsDay(
      revenueOrders,
      sessions,
      dayKey,
      pdvId,
      workCenterId,
    );
    // Con Caja 2: Ventas = suma de canales (pedidos locales + integradores declarados).
    // Sin cierre: Ventas = pedidos cobrados (coincide con el desglose de canales).
    const revenue = fromClosing ? opsExcelChannelsTotal(channels) : orderRevenue;
    const prevKey = index > 0 ? dayKeys[index - 1] : null;
    let revenueDeltaPct: number | null = null;
    if (prevKey) {
      const prevOrders = scoped.filter((o) => isRevenueOnDay(o, prevKey));
      const prevOrderRev = prevOrders.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
      const prevCh = channelsForOpsDay(prevOrders, sessions, prevKey, pdvId, workCenterId);
      const prevRev = prevCh.fromClosing ? opsExcelChannelsTotal(prevCh.channels) : prevOrderRev;
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
      channels,
    };
  });

  const revenuePeriod = Math.round(days.reduce((s, d) => s + d.revenue, 0) * 100) / 100;
  const ordersPeriod = days.reduce((s, d) => s + d.orders, 0);
  const foodTot = sumDayFood(days);
  const channels = days.reduce(
    (acc, d) => sumOpsExcelChannels(acc, d.channels),
    emptyOpsExcelChannels(),
  );

  const prevKeys = resolvePrevComparableDayKeys(dayKeys, todayKey);
  let revenuePrevPeriod = 0;
  for (const pk of prevKeys) {
    const prevOrders = scoped.filter((o) => isRevenueOnDay(o, pk));
    const prevOrderRev = prevOrders.reduce((s, o) => s + deliveryOrderRevenueAmount(o), 0);
    const prevCh = channelsForOpsDay(prevOrders, sessions, pk, pdvId, workCenterId);
    revenuePrevPeriod += prevCh.fromClosing ? opsExcelChannelsTotal(prevCh.channels) : prevOrderRev;
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
    channels,
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
  channels: OpsExcelChannels;
} {
  const revenuePeriod = Math.round(pulses.reduce((s, p) => s + p.revenuePeriod, 0) * 100) / 100;
  const revenuePrevPeriod = Math.round(pulses.reduce((s, p) => s + p.revenuePrevPeriod, 0) * 100) / 100;
  const ordersPeriod = pulses.reduce((s, p) => s + p.ordersPeriod, 0);
  const channels = pulses.reduce(
    (acc, p) => sumOpsExcelChannels(acc, p.channels || emptyOpsExcelChannels()),
    emptyOpsExcelChannels(),
  );
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
    channels,
  };
}

/**
 * Mismo día del mes hacia atrás (incluye hoy).
 * Ej. 2026-08-04 + monthsBack 3 → 04/05, 04/06, 04/07, 04/08.
 * Si el día no existe en el mes (31), se usa el último día de ese mes.
 */
export function listSameDayOfMonthKeys(todayKey: string, monthsBack = 3): string[] {
  const [y, m, d] = String(todayKey || '').split('-').map(Number);
  if (!y || !m || !d) return todayKey ? [todayKey] : [];
  const back = Math.max(0, Math.floor(monthsBack));
  const out: string[] = [];
  for (let i = back; i >= 0; i -= 1) {
    const anchor = new Date(y, m - 1 - i, 1);
    const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const day = Math.min(d, lastDay);
    out.push(localCalendarDayKey(new Date(anchor.getFullYear(), anchor.getMonth(), day)));
  }
  return out;
}

export type BrandSameDayPoint = {
  dayKey: string;
  aUnits: number;
  bUnits: number;
  aRevenue: number;
  bRevenue: number;
  /** False = antes del alta / primera venta de esa tienda (no comparar en negativo). */
  aActive: boolean;
  bActive: boolean;
};

export type BrandSameDaySeries = {
  brandId: string;
  brandName: string;
  color: string;
  points: BrandSameDayPoint[];
};

export type PdvBrandSameDayCompare = {
  dayKeys: string[];
  dayOfMonth: number;
  storeAName: string;
  storeBName: string;
  brands: BrandSameDaySeries[];
};

type BrandMetaForCompare = {
  id: string;
  name: string;
  color?: string;
};

function brandDayTotals(
  orders: DeliveryOrder[],
  dayKey: string,
  pdvId: string,
  workCenterId: string | null | undefined,
  brandIds: string[],
  rules?: BrandBillingSplitRules | null,
): { units: Record<string, number>; revenue: Record<string, number> } {
  const units: Record<string, number> = {};
  const revenue: Record<string, number> = {};
  for (const id of brandIds) {
    units[id] = 0;
    revenue[id] = 0;
  }
  if (!pdvId) return { units, revenue };

  const pdvSet = new Set([pdvId]);
  const scoped = orders.filter((o) => orderBelongsToPdvScope(o, pdvSet, pdvId, workCenterId));
  const dayOrders = scoped.filter((o) => isRevenueOnDay(o, dayKey));

  for (const order of dayOrders) {
    const rev = deliveryOrderRevenueAmount(order);
    const attributed = attributeOrderRevenueByBrand(order, rules || undefined);
    const unitMap = attributeOrderUnitsByBrand(order, rules || undefined);
    const attributedSum =
      Object.values(attributed.byBrand).reduce((s, n) => s + (Number(n) || 0), 0)
      + (Number(attributed.unbranded) || 0);
    const scale = attributedSum > 0 && rev > 0 ? rev / attributedSum : 1;

    for (const bid of brandIds) {
      const u = Number(unitMap[bid]) || 0;
      const r = (Number(attributed.byBrand[bid]) || 0) * scale;
      if (u > 0) units[bid] = (units[bid] || 0) + u;
      if (r > 0) revenue[bid] = (revenue[bid] || 0) + r;
    }
  }

  for (const bid of brandIds) {
    units[bid] = Math.round((units[bid] || 0) * 10) / 10;
    revenue[bid] = Math.round((revenue[bid] || 0) * 100) / 100;
  }
  return { units, revenue };
}

/**
 * Comparativa de marcas entre 2 PDVs: mismas unidades/€ el día N de los últimos meses.
 */
export function buildPdvBrandSameDayCompare(
  orders: DeliveryOrder[],
  opts: {
    todayKey: string;
    monthsBack?: number;
    storeA: { storeName: string; pdvId: string; workCenterId?: string | null };
    storeB: { storeName: string; pdvId: string; workCenterId?: string | null };
    brands: BrandMetaForCompare[];
    rules?: BrandBillingSplitRules | null;
  },
): PdvBrandSameDayCompare {
  const todayKey = opts.todayKey;
  const dayKeys = listSameDayOfMonthKeys(todayKey, opts.monthsBack ?? 3);
  const dayOfMonth = Number(String(todayKey).slice(8, 10)) || 0;
  const brands = (opts.brands || [])
    .map((b) => ({
      id: String(b.id || '').trim(),
      name: String(b.name || '').trim() || 'Marca',
      color: b.color || '#2563EB',
    }))
    .filter((b) => b.id);

  if (brands.length === 0 || dayKeys.length === 0) {
    return {
      dayKeys,
      dayOfMonth,
      storeAName: opts.storeA.storeName,
      storeBName: opts.storeB.storeName,
      brands: [],
    };
  }

  const brandIds = brands.map((b) => b.id);

  const ordersA = orders.filter((o) =>
    orderBelongsToPdvScope(
      o,
      new Set([opts.storeA.pdvId]),
      opts.storeA.pdvId,
      opts.storeA.workCenterId,
    ),
  );
  const ordersB = orders.filter((o) =>
    orderBelongsToPdvScope(
      o,
      new Set([opts.storeB.pdvId]),
      opts.storeB.pdvId,
      opts.storeB.workCenterId,
    ),
  );
  const firstA = firstRevenueDayKey(ordersA);
  const firstB = firstRevenueDayKey(ordersB);

  const aByDay = dayKeys.map((dk) =>
    brandDayTotals(
      orders,
      dk,
      opts.storeA.pdvId,
      opts.storeA.workCenterId,
      brandIds,
      opts.rules,
    ),
  );
  const bByDay = dayKeys.map((dk) =>
    brandDayTotals(
      orders,
      dk,
      opts.storeB.pdvId,
      opts.storeB.workCenterId,
      brandIds,
      opts.rules,
    ),
  );

  const series: BrandSameDaySeries[] = brands
    .map((b) => {
      const points: BrandSameDayPoint[] = dayKeys.map((dayKey, i) => {
        const aActive = !firstA || dayKey >= firstA;
        const bActive = !firstB || dayKey >= firstB;
        return {
          dayKey,
          aUnits: aActive ? aByDay[i].units[b.id] || 0 : 0,
          bUnits: bActive ? bByDay[i].units[b.id] || 0 : 0,
          aRevenue: aActive ? aByDay[i].revenue[b.id] || 0 : 0,
          bRevenue: bActive ? bByDay[i].revenue[b.id] || 0 : 0,
          aActive,
          bActive,
        };
      });
      return {
        brandId: b.id,
        brandName: b.name,
        color: b.color,
        points,
      };
    })
    .filter((s) =>
      s.points.some(
        (p) =>
          (p.aActive && (p.aUnits > 0 || p.aRevenue > 0))
          || (p.bActive && (p.bUnits > 0 || p.bRevenue > 0)),
      ),
    )
    .sort((x, y) => {
      const xu = x.points.reduce(
        (s, p) => s + (p.aActive ? p.aUnits : 0) + (p.bActive ? p.bUnits : 0),
        0,
      );
      const yu = y.points.reduce(
        (s, p) => s + (p.aActive ? p.aUnits : 0) + (p.bActive ? p.bUnits : 0),
        0,
      );
      return yu - xu || x.brandName.localeCompare(y.brandName, 'es');
    });

  return {
    dayKeys,
    dayOfMonth,
    storeAName: opts.storeA.storeName,
    storeBName: opts.storeB.storeName,
    brands: series,
  };
}
