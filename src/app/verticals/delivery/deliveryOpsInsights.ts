/**
 * Insights del dashboard empresa delivery:
 * tiempos por tienda con solapamiento (capacidad paralela), bases 20/30 min,
 * pérdida atención rápida, comida.
 */
import type { DeliveryOrder } from '../../lib/deliveryApi';
import {
  getDeliveryOrderDeliveredAtIso,
  isDeliveryOrderDelivered,
  listPrevMonthToDateDayKeys,
  monthOverMonthPct,
} from '../../lib/portfolioMetrics';
import { foodFamilyCountsFromOrders } from '../../lib/shiftFoodFamilyCounts';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';

export type OpsInsightRange = 'day' | 'week' | 'month';

/** Base cocina/prep por pedido (min). Varios se solapan. */
export const PREP_BASELINE_MIN = 20;
/** Base tiempo total cliente por pedido (min). */
export const ORDER_BASELINE_MIN = 30;

export type DeliveryStoreRef = {
  id: string;
  name: string;
};

function foldDay(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return localCalendarDayKey(d);
}

function orderDayKey(order: DeliveryOrder): string {
  const delivered = getDeliveryOrderDeliveredAtIso(order);
  if (delivered) {
    const k = foldDay(delivered);
    if (k) return k;
  }
  if (isDeliveryOrderDelivered(order)) {
    const k = foldDay(String(order.updatedAt || ''));
    if (k) return k;
  }
  return foldDay(String(order.createdAt || ''));
}

function addDaysToDayKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localCalendarDayKey(dt);
}

function orderInRange(order: DeliveryOrder, range: OpsInsightRange, todayKey: string): boolean {
  const day = orderDayKey(order);
  if (!day) return false;
  if (range === 'day') return day === todayKey;
  if (range === 'week') {
    // Últimos 7 días inclusive (hoy-6 … hoy).
    const weekStart = addDaysToDayKey(todayKey, -6);
    return Boolean(weekStart) && day >= weekStart && day <= todayKey;
  }
  // Mes en curso a la fecha (1..hoy), no el mes civil completo futuro.
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  return day >= monthStart && day <= todayKey;
}

function orderInPrevRange(order: DeliveryOrder, range: OpsInsightRange, todayKey: string): boolean {
  const day = orderDayKey(order);
  if (!day) return false;
  if (range === 'day') return day === addDaysToDayKey(todayKey, -1);
  if (range === 'week') {
    // Semana anterior: hoy-13 … hoy-7.
    const prevEnd = addDaysToDayKey(todayKey, -7);
    const prevStart = addDaysToDayKey(todayKey, -13);
    return Boolean(prevStart && prevEnd) && day >= prevStart && day <= prevEnd;
  }
  return listPrevMonthToDateDayKeys(todayKey).includes(day);
}

function minutesBetween(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avgOf(values: number[]): number | null {
  if (!values.length) return null;
  return round1(values.reduce((s, v) => s + v, 0) / values.length);
}

function timingOf(order: DeliveryOrder): {
  kitchen: number | null;
  assembly: number | null;
  delivery: number | null;
  total: number | null;
  prep: number | null;
} {
  const assemblyStart = order.assemblyStartedAt || order.createdAt;
  const assemblyEnd = order.assemblyCompletedAt || undefined;
  const prepStart = order.kitchenStartedAt || order.assemblyStartedAt || order.createdAt;
  // Ida estimada: marcan salida y vuelta al local, no la puerta → (ida+vuelta) / 2.
  const roundTrip =
    String(order.deliveryType || '') === 'recogida'
      ? null
      : minutesBetween(order.departedAt || order.assemblyCompletedAt, order.deliveredAt);
  const oneWay = roundTrip != null && roundTrip > 0 ? roundTrip / 2 : null;
  return {
    kitchen: minutesBetween(order.kitchenStartedAt, order.kitchenCompletedAt),
    assembly: minutesBetween(assemblyStart, assemblyEnd),
    delivery: oneWay,
    total: minutesBetween(order.createdAt, order.deliveredAt),
    prep: minutesBetween(prepStart, assemblyEnd),
  };
}

/**
 * Atención rápida solo con nombre (sin teléfono completo) → no entra en CRM.
 */
export function isQuickAttentionLostOrder(order: DeliveryOrder): boolean {
  const clientId = String(order.clientId || '').trim();
  const isWalkIn = !clientId || clientId.startsWith('tpv-');
  if (!isWalkIn) return false;
  const name = String(order.customerName || '').trim();
  if (name.length < 2) return false;
  const phoneDigits = String(order.customerPhone || '').replace(/\D/g, '');
  return phoneDigits.length < 9;
}

function orderHasPizza(order: DeliveryOrder): boolean {
  return foodFamilyCountsFromOrders([order]).pizza > 0;
}

export type TimingBucket = {
  avgMinutes: number | null;
  sampleSize: number;
  diffMinutes: number | null;
  pct: number | null;
};

export type BaselineStatus = 'ok' | 'warn' | 'bad' | 'empty';

/**
 * Métricas de tiempos de una tienda (o total), con solapamiento.
 *
 * Lógica:
 * - Cada pedido tiene un prep individual (~20 min base).
 * - En cocina se solapan: 10 pedidos × 20 min de trabajo ≠ 200 min de reloj.
 * - `busyMinutes` = unión de intervalos prep (reloj real de cocina ocupada).
 * - `workMinutes` = suma de preps individuales.
 * - `parallelFactor` = work / busy → “cuántas líneas” implícitas.
 * - `ordersPerBusyHour` = pedidos / (busy/60) → ritmo real (ej. 10 en 30 min ≈ 20/h).
 */
export type StoreTimingInsights = {
  storeId: string;
  storeName: string;
  deliveredCount: number;
  deliveredPrevCount: number;
  times: {
    total: TimingBucket;
    kitchen: TimingBucket;
    assembly: TimingBucket;
    delivery: TimingBucket;
    prep: TimingBucket;
    pizzaKitchen: TimingBucket;
  };
  /** Minutos de reloj con cocina/montaje activos (intervalos unidos). */
  busyMinutes: number | null;
  /** Suma de preps individuales (trabajo “persona·min”). */
  workMinutes: number | null;
  /** work / busy — líneas paralelas implícitas. */
  parallelFactor: number | null;
  /** Pedidos por hora de cocina ocupada (ritmo real con solape). */
  ordersPerBusyHour: number | null;
  /** Minutos de reloj por pedido (busy / n). Ej. 30 min / 10 ped = 3. */
  clockMinutesPerOrder: number | null;
  /** Pico de pedidos solapados a la vez. */
  peakConcurrency: number;
  /** Pedidos/h teóricos a 1 línea con base 20 min (= 3/h). */
  baselineOrdersPerHour: number;
  vsPrepBase: BaselineStatus;
  vsOrderBase: BaselineStatus;
  /** Ritmo vs 1 línea a 20 min: >1 = más rápido que secuencial. */
  throughputVsBaseline: number | null;
};

export type DeliveryOpsInsights = {
  range: OpsInsightRange;
  todayKey: string;
  vsLabel: string;
  deliveredCount: number;
  deliveredPrevCount: number;
  prepBaselineMin: number;
  orderBaselineMin: number;
  /** Totales empresa (todas las tiendas). */
  overall: StoreTimingInsights;
  /** Una fila por tienda delivery. */
  byStore: StoreTimingInsights[];
  food: {
    pizzas: number;
    pizzasPrev: number;
    pizzasPct: number | null;
    burgers: number;
    burgersPrev: number;
    tacos: number;
    tacosPrev: number;
  };
  clients: {
    lostQuickAttention: number;
    lostQuickAttentionPrev: number;
    lostPct: number | null;
    lostSharePercent: number;
    lostSharePrevPercent: number;
  };
};

function buildTimingBucket(cur: number[], prev: number[]): TimingBucket {
  const avg = avgOf(cur);
  const prevAvg = avgOf(prev);
  return {
    avgMinutes: avg,
    sampleSize: cur.length,
    diffMinutes: avg != null && prevAvg != null ? round1(avg - prevAvg) : null,
    pct: avg != null && prevAvg != null ? monthOverMonthPct(avg, prevAvg) : null,
  };
}

function collectTimings(orders: DeliveryOrder[]): {
  total: number[];
  kitchen: number[];
  assembly: number[];
  delivery: number[];
  prep: number[];
  pizzaKitchen: number[];
} {
  const total: number[] = [];
  const kitchen: number[] = [];
  const assembly: number[] = [];
  const delivery: number[] = [];
  const prep: number[] = [];
  const pizzaKitchen: number[] = [];

  for (const order of orders) {
    if (!isDeliveryOrderDelivered(order)) continue;
    const t = timingOf(order);
    if (t.total != null) total.push(t.total);
    if (t.kitchen != null) kitchen.push(t.kitchen);
    if (t.assembly != null) assembly.push(t.assembly);
    if (t.delivery != null) delivery.push(t.delivery);
    if (t.prep != null) prep.push(t.prep);
    if (t.kitchen != null && orderHasPizza(order)) pizzaKitchen.push(t.kitchen);
  }

  return { total, kitchen, assembly, delivery, prep, pizzaKitchen };
}

/** Une intervalos [start,end] en ms → minutos de ocupación real. */
export function unionBusyMinutes(intervals: Array<{ startMs: number; endMs: number }>): number {
  const valid = intervals
    .filter((i) => Number.isFinite(i.startMs) && Number.isFinite(i.endMs) && i.endMs > i.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  if (!valid.length) return 0;

  let busyMs = 0;
  let curStart = valid[0].startMs;
  let curEnd = valid[0].endMs;
  for (let i = 1; i < valid.length; i += 1) {
    const next = valid[i];
    if (next.startMs <= curEnd) {
      curEnd = Math.max(curEnd, next.endMs);
    } else {
      busyMs += curEnd - curStart;
      curStart = next.startMs;
      curEnd = next.endMs;
    }
  }
  busyMs += curEnd - curStart;
  return busyMs / 60000;
}

/** Pico de concurrencia (máx. intervalos abiertos a la vez). */
export function peakOverlap(intervals: Array<{ startMs: number; endMs: number }>): number {
  const events: Array<{ t: number; d: number }> = [];
  for (const i of intervals) {
    if (!(i.endMs > i.startMs)) continue;
    events.push({ t: i.startMs, d: 1 });
    events.push({ t: i.endMs, d: -1 });
  }
  if (!events.length) return 0;
  events.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.d - b.d));
  let cur = 0;
  let peak = 0;
  for (const e of events) {
    cur += e.d;
    if (cur > peak) peak = cur;
  }
  return peak;
}

function prepInterval(order: DeliveryOrder): { startMs: number; endMs: number } | null {
  const startIso = order.kitchenStartedAt || order.createdAt;
  const endIso =
    order.assemblyCompletedAt ||
    order.kitchenCompletedAt ||
    order.deliveredAt ||
    order.updatedAt;
  if (!startIso || !endIso) return null;
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

function baselineStatus(avg: number | null, okMax: number, warnMax: number): BaselineStatus {
  if (avg == null) return 'empty';
  if (avg <= okMax) return 'ok';
  if (avg <= warnMax) return 'warn';
  return 'bad';
}

function buildStoreTiming(
  storeId: string,
  storeName: string,
  curDelivered: DeliveryOrder[],
  prevDelivered: DeliveryOrder[],
): StoreTimingInsights {
  const curT = collectTimings(curDelivered);
  const prevT = collectTimings(prevDelivered);
  const n = curDelivered.length;

  const intervals = curDelivered
    .map(prepInterval)
    .filter((x): x is { startMs: number; endMs: number } => Boolean(x));

  const busy = intervals.length ? round1(unionBusyMinutes(intervals)) : null;
  const work = curT.prep.length ? round1(curT.prep.reduce((s, v) => s + v, 0)) : null;
  const parallel =
    busy != null && busy > 0 && work != null ? round1(work / busy) : null;
  const ordersPerBusyHour =
    busy != null && busy > 0 && n > 0 ? round1(n / (busy / 60)) : null;
  const clockPerOrder = busy != null && busy > 0 && n > 0 ? round1(busy / n) : null;
  const peak = peakOverlap(intervals);
  const baselinePerHour = round1(60 / PREP_BASELINE_MIN);
  const throughputVs =
    ordersPerBusyHour != null ? round1(ordersPerBusyHour / baselinePerHour) : null;

  const prepAvg = avgOf(curT.prep);
  const totalAvg = avgOf(curT.total);

  return {
    storeId,
    storeName,
    deliveredCount: n,
    deliveredPrevCount: prevDelivered.length,
    times: {
      total: buildTimingBucket(curT.total, prevT.total),
      kitchen: buildTimingBucket(curT.kitchen, prevT.kitchen),
      assembly: buildTimingBucket(curT.assembly, prevT.assembly),
      delivery: buildTimingBucket(curT.delivery, prevT.delivery),
      prep: buildTimingBucket(curT.prep, prevT.prep),
      pizzaKitchen: buildTimingBucket(curT.pizzaKitchen, prevT.pizzaKitchen),
    },
    busyMinutes: busy != null && busy > 0 ? busy : null,
    workMinutes: work != null && work > 0 ? work : null,
    parallelFactor: parallel,
    ordersPerBusyHour,
    clockMinutesPerOrder: clockPerOrder,
    peakConcurrency: peak,
    baselineOrdersPerHour: baselinePerHour,
    vsPrepBase: baselineStatus(prepAvg, PREP_BASELINE_MIN, ORDER_BASELINE_MIN),
    vsOrderBase: baselineStatus(totalAvg, ORDER_BASELINE_MIN, ORDER_BASELINE_MIN + 10),
    throughputVsBaseline: throughputVs,
  };
}

function orderStoreId(order: DeliveryOrder): string {
  return String(order.salesPointId || '').trim() || '_sin_tienda';
}

function orderStoreName(order: DeliveryOrder): string {
  return String(order.salesPointName || '').trim() || 'Sin tienda';
}

/** PDVs conocidos + cualquier tienda que aparezca en pedidos. */
export function resolveDeliveryStores(
  stores: DeliveryStoreRef[] | undefined,
  orders: DeliveryOrder[],
): DeliveryStoreRef[] {
  const map = new Map<string, string>();
  for (const s of stores || []) {
    const id = String(s.id || '').trim();
    if (!id) continue;
    map.set(id, String(s.name || id).trim() || id);
  }
  for (const o of orders || []) {
    const id = orderStoreId(o);
    if (id === '_sin_tienda') continue;
    if (!map.has(id)) map.set(id, orderStoreName(o));
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function buildDeliveryOpsInsights(
  orders: DeliveryOrder[],
  range: OpsInsightRange,
  todayKey = localCalendarDayKey(),
  stores?: DeliveryStoreRef[],
): DeliveryOpsInsights {
  const active = (orders || []).filter(
    (o) => !/cancel/.test(String(o.status || '').toLowerCase()),
  );
  const curOrders = active.filter((o) => orderInRange(o, range, todayKey));
  const prevOrders = active.filter((o) => orderInPrevRange(o, range, todayKey));

  const curDelivered = curOrders.filter((o) => isDeliveryOrderDelivered(o));
  const prevDelivered = prevOrders.filter((o) => isDeliveryOrderDelivered(o));

  const storeList = resolveDeliveryStores(stores, [...curOrders, ...prevOrders, ...active]);

  const byStore: StoreTimingInsights[] = storeList.map((s) => {
    const cur = curDelivered.filter((o) => orderStoreId(o) === s.id);
    const prev = prevDelivered.filter((o) => orderStoreId(o) === s.id);
    return buildStoreTiming(s.id, s.name, cur, prev);
  });

  // Pedidos sin salesPointId (si hay)
  const orphanCur = curDelivered.filter((o) => orderStoreId(o) === '_sin_tienda');
  const orphanPrev = prevDelivered.filter((o) => orderStoreId(o) === '_sin_tienda');
  if (orphanCur.length || orphanPrev.length) {
    byStore.push(buildStoreTiming('_sin_tienda', 'Sin tienda', orphanCur, orphanPrev));
  }

  const overall = buildStoreTiming('__all__', 'Todas las tiendas', curDelivered, prevDelivered);

  const foodNow = foodFamilyCountsFromOrders(curDelivered);
  const foodPrev = foodFamilyCountsFromOrders(prevDelivered);

  const lostNow = curOrders.filter(isQuickAttentionLostOrder).length;
  const lostPrev = prevOrders.filter(isQuickAttentionLostOrder).length;
  const curBase = curOrders.length || 0;
  const prevBase = prevOrders.length || 0;

  return {
    range,
    todayKey,
    vsLabel:
      range === 'day'
        ? 'vs ayer'
        : range === 'week'
          ? 'vs sem. ant.'
          : 'vs mismos días mes ant.',
    deliveredCount: curDelivered.length,
    deliveredPrevCount: prevDelivered.length,
    prepBaselineMin: PREP_BASELINE_MIN,
    orderBaselineMin: ORDER_BASELINE_MIN,
    overall,
    byStore,
    food: {
      pizzas: Math.round(foodNow.pizza * 10) / 10,
      pizzasPrev: Math.round(foodPrev.pizza * 10) / 10,
      pizzasPct: monthOverMonthPct(foodNow.pizza, foodPrev.pizza),
      burgers: Math.round(foodNow.burger * 10) / 10,
      burgersPrev: Math.round(foodPrev.burger * 10) / 10,
      tacos: Math.round(foodNow.taco * 10) / 10,
      tacosPrev: Math.round(foodPrev.taco * 10) / 10,
    },
    clients: {
      lostQuickAttention: lostNow,
      lostQuickAttentionPrev: lostPrev,
      lostPct: monthOverMonthPct(lostNow, lostPrev),
      lostSharePercent: curBase > 0 ? Math.round((lostNow / curBase) * 1000) / 10 : 0,
      lostSharePrevPercent: prevBase > 0 ? Math.round((lostPrev / prevBase) * 1000) / 10 : 0,
    },
  };
}

export function formatMinutesEs(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${formatNumberLocal(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

function formatNumberLocal(n: number): string {
  return n.toLocaleString('es-ES', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}
