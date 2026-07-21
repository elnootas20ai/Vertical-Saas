import type { DeliveryOrder, DeliveryOrderItem } from './deliveryApi';
import { AGGREGATOR_PLATFORMS } from './deliveryIntegrationsUi';
import {
  filterOrdersForRegisterSession,
} from './registerShiftSalesBreakdown';
import type { TpvRegisterSession } from './deliveryApi';

export type FoodFamilyKey = 'pizza' | 'burger' | 'taco';

export type FoodFamilyCounts = {
  pizza: number;
  burger: number;
  taco: number;
};

export type ShiftFoodFamilyReport = {
  total: FoodFamilyCounts;
  /** Por canal (glovo, ubereats, justeat, flipdish, tpv, …). */
  byChannel: Record<string, FoodFamilyCounts>;
  /** Solo los 4 integradores. */
  byAggregator: Record<string, FoodFamilyCounts>;
};

export function emptyFoodFamilyCounts(): FoodFamilyCounts {
  return { pizza: 0, burger: 0, taco: 0 };
}

function fold(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Clasifica una línea de pedido en pizza / burger / taco (o null si no aplica). */
export function classifyFoodFamily(
  category: string | undefined,
  name: string | undefined,
): FoodFamilyKey | null {
  const cat = fold(category || '');
  const nm = fold(name || '');
  if (/taco/.test(cat) || /\btacos?\b/.test(nm)) return 'taco';
  if (/burger|hamburg|smash/.test(cat) || /burger|hamburg|smash/.test(nm)) return 'burger';
  if (/pizza|calzone/.test(cat) || /pizza|calzone/.test(nm)) return 'pizza';
  return null;
}

function addCounts(target: FoodFamilyCounts, key: FoodFamilyKey, qty: number): void {
  if (qty <= 0) return;
  target[key] += qty;
}

function mergeCounts(a: FoodFamilyCounts, b: FoodFamilyCounts): FoodFamilyCounts {
  return {
    pizza: a.pizza + b.pizza,
    burger: a.burger + b.burger,
    taco: a.taco + b.taco,
  };
}

function countItem(item: DeliveryOrderItem): FoodFamilyCounts {
  const out = emptyFoodFamilyCounts();
  const qty = Number(item.quantity || 0);
  if (qty <= 0) return out;
  const family = classifyFoodFamily(item.category, item.name);
  if (family) addCounts(out, family, qty);
  return out;
}

const AGGREGATOR_CHANNELS = new Set(AGGREGATOR_PLATFORMS.map((p) => p.channel));

/** Recuento pizzas / burgers / tacos del turno (y por canal / integrador). */
export function buildShiftFoodFamilyReport(orders: DeliveryOrder[]): ShiftFoodFamilyReport {
  const total = emptyFoodFamilyCounts();
  const byChannel: Record<string, FoodFamilyCounts> = {};
  const byAggregator: Record<string, FoodFamilyCounts> = {};

  for (const platform of AGGREGATOR_PLATFORMS) {
    byAggregator[platform.channel] = emptyFoodFamilyCounts();
  }

  for (const order of orders) {
    const channel = String(order.channel || 'direct').trim() || 'direct';
    if (!byChannel[channel]) byChannel[channel] = emptyFoodFamilyCounts();

    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const line = countItem(item);
      byChannel[channel] = mergeCounts(byChannel[channel], line);
      total.pizza += line.pizza;
      total.burger += line.burger;
      total.taco += line.taco;
      if (AGGREGATOR_CHANNELS.has(channel)) {
        byAggregator[channel] = mergeCounts(byAggregator[channel] || emptyFoodFamilyCounts(), line);
      }
    }
  }

  return { total, byChannel, byAggregator };
}

export function buildShiftFoodFamilyReportForSession(
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'>,
  orders: DeliveryOrder[],
): ShiftFoodFamilyReport {
  return buildShiftFoodFamilyReport(filterOrdersForRegisterSession(session, orders));
}

export function sumFoodFamilyCounts(list: FoodFamilyCounts[]): FoodFamilyCounts {
  return list.reduce((acc, c) => mergeCounts(acc, c), emptyFoodFamilyCounts());
}

export function foodFamilyCountsFromSession(
  session: Pick<TpvRegisterSession, 'productClosingCounts' | 'closedAt'>,
): FoodFamilyCounts | null {
  const raw = session.productClosingCounts;
  if (!raw) return null;
  return {
    pizza: Math.max(0, Math.floor(Number(raw.pizza) || 0)),
    burger: Math.max(0, Math.floor(Number(raw.burger) || 0)),
    taco: Math.max(0, Math.floor(Number(raw.taco) || 0)),
  };
}

/** Suma conteos guardados en cierres del día; si no hay, null. */
export function sumProductClosingCountsForDay(
  sessions: TpvRegisterSession[],
  dayKey: string,
  pdvIds?: string[],
): FoodFamilyCounts | null {
  const pdvSet = pdvIds?.length ? new Set(pdvIds) : null;
  const closed = sessions.filter((s) => {
    if (String(s.status || '') !== 'closed') return false;
    const day = String(s.closedAt || s.openedAt || '').slice(0, 10);
    if (day !== dayKey) return false;
    if (pdvSet && !pdvSet.has(String(s.pointOfSaleId || '').trim())) return false;
    return Boolean(s.productClosingCounts);
  });
  if (closed.length === 0) return null;
  return sumFoodFamilyCounts(
    closed.map((s) => foodFamilyCountsFromSession(s) || emptyFoodFamilyCounts()),
  );
}

export function foodFamilyCountsFromOrdersToday(
  orders: DeliveryOrder[],
  dayKey: string,
): FoodFamilyCounts {
  const dayOrders = orders.filter((o) => {
    if (o.status === 'cancelled') return false;
    const day = String(o.deliveredAt || o.createdAt || o.updatedAt || '').slice(0, 10);
    return day === dayKey;
  });
  return buildShiftFoodFamilyReport(dayOrders).total;
}
