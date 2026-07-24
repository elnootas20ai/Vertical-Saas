import type { DeliveryOrder, DeliveryOrderItem } from './deliveryApi';
import { AGGREGATOR_PLATFORMS } from './deliveryIntegrationsUi';
import {
  filterOrdersForRegisterSession,
} from './registerShiftSalesBreakdown';
import type { TpvRegisterSession } from './deliveryApi';
import { localCalendarDayKey } from './tpvCajaScope';

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

/**
 * Unidades de pizza por producto de menú (cierre de caja).
 * Individual → 1, Dúo → 2, Familiar → 3. null si no es ese tipo de menú.
 */
export function pizzaUnitsFromProductLabel(
  category: string | undefined,
  name: string | undefined,
): number | null {
  const blob = `${fold(category || '')} ${fold(name || '')}`.trim();
  if (!blob) return null;
  // Familiar primero: más específico que un “combo” genérico.
  if (/\bfamiliar\b|\bfamily\b/.test(blob)) return 3;
  if (/\bduos?\b/.test(blob)) return 2;
  if (/\bindividual(es)?\b|\bestandar\b/.test(blob)) return 1;
  return null;
}

/** Líneas `▸ Margarita` / `▸ Margarita ×2` guardadas en extras del combo TPV. */
export function parseComboExtraLine(raw: string): { name: string; units: number } | null {
  let s = String(raw || '').trim();
  if (!s.startsWith('▸') && !s.startsWith('>')) return null;
  s = s.replace(/^[▸>]\s*/, '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*[×x]\s*(\d+)\s*$/i);
  if (m) {
    const name = m[1].trim();
    if (!name) return null;
    return { name, units: Math.max(1, Number(m[2]) || 1) };
  }
  return { name: s, units: 1 };
}

function isLikelyNonMainComboExtra(name: string): boolean {
  const n = fold(name);
  return /bebida|refresco|agua|coca|fanta|sprite|cerveza|vino|cafe|te\b|patata|frita|complemento|acompan|postre|helado|nugget|alita|ensalada|salad|dip|salsa|brownie|cookie|batido|smoothie|zumo|nestea|aquarius|red.?bull|monster|maiz|pan\b|aros/.test(
    n,
  );
}

function looksLikeMenuProduct(category: string | undefined, name: string | undefined): boolean {
  const blob = fold(`${category || ''} ${name || ''}`);
  return /menu|combo|menus|combos|individual|duo|familiar|family|estandar/.test(blob);
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
  const sizeUnits = pizzaUnitsFromProductLabel(item.category, item.name);
  const extras = Array.isArray(item.extras) ? item.extras : [];
  const comboParts = extras
    .map((raw) => parseComboExtraLine(raw))
    .filter((p): p is { name: string; units: number } => Boolean(p));

  // Menús TPV: las pizzas reales van en extras (▸ Pizza), no en el nombre del combo.
  if (comboParts.length > 0) {
    const pizzaMenu =
      sizeUnits != null ||
      family === 'pizza' ||
      (looksLikeMenuProduct(item.category, item.name) && family !== 'burger');
    const burgerMenu = family === 'burger';

    for (const part of comboParts) {
      if (isLikelyNonMainComboExtra(part.name)) continue;
      const partFamily = classifyFoodFamily('', part.name);
      if (partFamily === 'taco') {
        addCounts(out, 'taco', part.units * qty);
        continue;
      }
      if (partFamily === 'burger') {
        addCounts(out, 'burger', part.units * qty);
        continue;
      }
      if (partFamily === 'pizza') {
        addCounts(out, 'pizza', part.units * qty);
        continue;
      }
      // Margarita, Pepperoni… sin la palabra “pizza”: cuentan como principal del menú.
      if (burgerMenu) addCounts(out, 'burger', part.units * qty);
      else if (pizzaMenu) addCounts(out, 'pizza', part.units * qty);
    }

    // Fallback: Individual/Dúo/Familiar sin extras de pizza (pedidos viejos / apps).
    if (
      out.pizza === 0 &&
      out.burger === 0 &&
      sizeUnits != null &&
      family !== 'burger' &&
      family !== 'taco'
    ) {
      addCounts(out, 'pizza', sizeUnits * qty);
    }
    return out;
  }

  if (sizeUnits != null && family !== 'burger' && family !== 'taco') {
    addCounts(out, 'pizza', qty * sizeUnits);
    return out;
  }
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

/** Unidades TPV del turno = total − lo que ya va en apps (Glovo/Uber/…). */
export function tpvOnlyFoodFromReport(report: ShiftFoodFamilyReport): FoodFamilyCounts {
  const apps = sumFoodFamilyCounts(Object.values(report.byAggregator || {}));
  return {
    pizza: Math.max(0, (report.total?.pizza || 0) - apps.pizza),
    burger: Math.max(0, (report.total?.burger || 0) - apps.burger),
    taco: Math.max(0, (report.total?.taco || 0) - apps.taco),
  };
}

/** Cierre: unidades TPV + suma de lo declarado por cada integración. */
export function mergeTpvAndAppsFoodCounts(
  tpv: FoodFamilyCounts,
  appsByChannel: Record<string, FoodFamilyCounts>,
): FoodFamilyCounts {
  return mergeCounts(tpv, sumFoodFamilyCounts(Object.values(appsByChannel || {})));
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
    const raw = String(o.deliveredAt || o.createdAt || o.updatedAt || '').trim();
    if (!raw) return false;
    const d = new Date(raw);
    const day = Number.isNaN(d.getTime()) ? raw.slice(0, 10) : localCalendarDayKey(d);
    return day === dayKey;
  });
  return buildShiftFoodFamilyReport(dayOrders).total;
}
