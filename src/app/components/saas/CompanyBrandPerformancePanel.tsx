/**
 * Dashboard empresa delivery: marcas + €/uds/comida por periodo (día / mes / año)
 * con comparativa vs periodo anterior. Reglas de Facturación (sin hardcode).
 * Incluye todos los integradores (Glovo, Uber Eats, Just Eat, Flipdish, …).
 *
 * Fuentes: pedidos + cierres de caja (Caja 2). Si un día tiene declaración
 * manual para un canal, el cierre pisa a los pedidos de ese canal ese día
 * (mismo criterio anti doble conteo que el Resumen operativo).
 */
import { useEffect, useMemo, useState } from 'react';
import { Package, Radio } from 'lucide-react';
import type { Brand } from '../../lib/brandApi';
import type { DeliveryOrder, TpvRegisterSession } from '../../lib/deliveryApi';
import {
  buildClosingBrandOverlay,
  isOrderReplacedByClosing,
  mergeClosingIntoChannelRows,
  type ClosingBrandOverlay,
} from '../../lib/closingBrandOverlay';
import { getBrandBillingConfigRequest } from '../../lib/brandBillingApi';
import {
  brandsForBilling,
  splitRulesFromBillingConfig,
  type BrandBillingSplitRules,
} from '../../lib/brandBillingConfig';
import {
  attributeOrderRevenueByBrand,
  attributeOrderUnitsByBrand,
  lineRevenueAmount,
} from '../../../../shared/delivery/orderLineRevenueSplit.js';
import { isBrandActive } from '../../lib/brandUtils';
import { deliveryBrandLineKindLabel } from '../../lib/deliveryBrandLineKinds';
import { AGGREGATOR_PLATFORMS } from '../../lib/deliveryIntegrationsUi';
import { formatMoneyEs, formatNumberEs } from '../../lib/formatNumberEs';
import { isRefundedDeliveryOrder, localCalendarDayKey } from '../../lib/tpvCajaScope';
import {
  getDeliveryOrderDeliveredAtIso,
  isDeliveryOrderDelivered,
  listPrevMonthToDateDayKeys,
  monthOverMonthPct,
} from '../../lib/portfolioMetrics';
import {
  emptyFoodFamilyCounts,
  foodFamilyCountsFromOrders,
  foodFamilyCountsFromOrdersForBrand,
  sumFoodFamilyCounts,
  type FoodFamilyCounts,
} from '../../lib/shiftFoodFamilyCounts';

/** Canales propios (no agregador) que siempre listamos si hay ventas. */
const OWN_CHANNEL_DEFS: Array<{ key: string; label: string; color: string }> = [
  { key: 'tpv', label: 'TPV', color: '#2563EB' },
  { key: 'app', label: 'App', color: '#4F46E5' },
  { key: 'web', label: 'Web', color: '#0EA5E9' },
  { key: 'phone', label: 'Teléfono', color: '#64748B' },
  { key: 'direct', label: 'Directo', color: '#78716C' },
];

function normalizeOrderChannel(channel: string | undefined | null): string {
  const ch = String(channel || '').toLowerCase().trim();
  if (!ch) return 'tpv';
  if (ch === 'uber' || ch === 'uber_eats' || ch === 'uber-eats') return 'ubereats';
  if (ch === 'just_eat' || ch === 'just-eat') return 'justeat';
  return ch;
}

function channelDisplayMeta(key: string): { label: string; color: string; isAggregator: boolean } {
  const agg = AGGREGATOR_PLATFORMS.find((p) => p.channel === key);
  if (agg) {
    const colorMatch = agg.colorClass.match(/#[0-9A-Fa-f]{3,8}/);
    const fallback: Record<string, string> = {
      glovo: '#00A082',
      ubereats: '#111111',
      justeat: '#FF8000',
      flipdish: '#E32B2B',
    };
    return {
      label: agg.label,
      color: colorMatch?.[0] || fallback[agg.channel] || '#2563EB',
      isAggregator: true,
    };
  }
  const own = OWN_CHANNEL_DEFS.find((c) => c.key === key);
  if (own) return { ...own, isAggregator: false };
  return {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    color: '#9CA3AF',
    isAggregator: false,
  };
}

export type IntegratorPerfRow = {
  key: string;
  label: string;
  color: string;
  isAggregator: boolean;
  revenue: number;
  orderCount: number;
  sharePercent: number;
};

/**
 * Desglose por canal/integrador. Siempre incluye los 4 agregadores (aunque vayan a 0).
 */
function buildIntegratorRows(
  orders: DeliveryOrder[],
  opts?: {
    brandId?: string;
    rules?: BrandBillingSplitRules;
  },
): IntegratorPerfRow[] {
  const revenue: Record<string, number> = {};
  const orderHit: Record<string, number> = {};
  let total = 0;

  for (const order of orders) {
    const rev = orderEuro(order);
    if (rev <= 0) continue;

    let slice = rev;
    if (opts?.brandId && opts.rules) {
      const attributed = attributeOrderRevenueByBrand(order, opts.rules);
      const brandAmt = Number(attributed.byBrand[opts.brandId]) || 0;
      if (brandAmt <= 0) continue;
      const attributedSum =
        Object.values(attributed.byBrand).reduce((s, n) => s + (Number(n) || 0), 0) +
        (Number(attributed.unbranded) || 0);
      const scale = attributedSum > 0 ? brandAmt / attributedSum : 0;
      slice = Math.round(rev * scale * 100) / 100;
      if (slice <= 0) continue;
    }

    const key = normalizeOrderChannel(order.channel);
    revenue[key] = Math.round(((revenue[key] || 0) + slice) * 100) / 100;
    orderHit[key] = (orderHit[key] || 0) + 1;
    total += slice;
  }

  total = Math.round(total * 100) / 100;

  const rows: IntegratorPerfRow[] = [];
  const seen = new Set<string>();

  for (const platform of AGGREGATOR_PLATFORMS) {
    seen.add(platform.channel);
    const meta = channelDisplayMeta(platform.channel);
    const r = Math.round((revenue[platform.channel] || 0) * 100) / 100;
    rows.push({
      key: platform.channel,
      label: meta.label,
      color: meta.color,
      isAggregator: true,
      revenue: r,
      orderCount: orderHit[platform.channel] || 0,
      sharePercent: total > 0 ? Math.round((r / total) * 1000) / 10 : 0,
    });
  }

  for (const own of OWN_CHANNEL_DEFS) {
    if (seen.has(own.key)) continue;
    const r = Math.round((revenue[own.key] || 0) * 100) / 100;
    if (r <= 0) continue;
    seen.add(own.key);
    rows.push({
      key: own.key,
      label: own.label,
      color: own.color,
      isAggregator: false,
      revenue: r,
      orderCount: orderHit[own.key] || 0,
      sharePercent: total > 0 ? Math.round((r / total) * 1000) / 10 : 0,
    });
  }

  for (const key of Object.keys(revenue)) {
    if (seen.has(key)) continue;
    const r = Math.round((revenue[key] || 0) * 100) / 100;
    if (r <= 0) continue;
    const meta = channelDisplayMeta(key);
    rows.push({
      key,
      label: meta.label,
      color: meta.color,
      isAggregator: meta.isAggregator,
      revenue: r,
      orderCount: orderHit[key] || 0,
      sharePercent: total > 0 ? Math.round((r / total) * 1000) / 10 : 0,
    });
  }

  // Agregadores primero (orden fijo), resto por €.
  const aggregators = rows.filter((r) => r.isAggregator);
  const others = rows
    .filter((r) => !r.isAggregator)
    .sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label, 'es'));
  return [...aggregators, ...others];
}

/** € declarados al cierre para UNA marca, por canal (vista de marca). */
function closingChannelAmountsForBrand(
  closing: ClosingBrandOverlay,
  brandId: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [channel, byBrand] of Object.entries(closing.revenueByChannelByBrand)) {
    const amt = Number(byBrand[brandId]) || 0;
    if (amt > 0) out[channel] = amt;
  }
  return out;
}

function VsBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const label = `${up ? '+' : ''}${formatNumberEs(pct, { maxFraction: 1 })}%`;
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
        up
          ? 'bg-[rgba(34,197,94,0.12)] text-[var(--v-green,#22c55e)]'
          : 'bg-[rgba(225,29,72,0.1)] text-[var(--v-rose,#e11d48)]'
      }`}
    >
      {label}
    </span>
  );
}

export type BrandPerfRange = 'day' | 'month' | 'year';

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

function dayKeyInRange(day: string, range: BrandPerfRange, todayKey: string): boolean {
  if (!day) return false;
  if (range === 'day') return day === todayKey;
  if (range === 'month') {
    const monthStart = `${todayKey.slice(0, 7)}-01`;
    return day >= monthStart && day <= todayKey;
  }
  return day.slice(0, 4) === todayKey.slice(0, 4);
}

/** Periodo anterior comparable: ayer / mismos días mes ant. / mismo YTD año ant. */
function dayKeyInPrevRange(day: string, range: BrandPerfRange, todayKey: string): boolean {
  if (!day) return false;
  if (range === 'day') return day === addDaysToDayKey(todayKey, -1);
  if (range === 'month') {
    const prevKeys = listPrevMonthToDateDayKeys(todayKey);
    return prevKeys.includes(day);
  }
  const prevYear = String(Number(todayKey.slice(0, 4)) - 1);
  const ytdEnd = `${prevYear}${todayKey.slice(4)}`;
  return day.slice(0, 4) === prevYear && day <= ytdEnd;
}

function orderInRange(order: DeliveryOrder, range: BrandPerfRange, todayKey: string): boolean {
  return dayKeyInRange(orderDayKey(order), range, todayKey);
}

function orderInPrevRange(order: DeliveryOrder, range: BrandPerfRange, todayKey: string): boolean {
  return dayKeyInPrevRange(orderDayKey(order), range, todayKey);
}

function orderEuro(order: DeliveryOrder): number {
  const t = Number(order.totalAmount ?? order.total);
  if (Number.isFinite(t) && t > 0) return t;
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((s, it) => s + lineRevenueAmount(it), 0);
}

export type CompanyBrandDayRow = {
  brandId: string;
  name: string;
  color: string;
  lineLabel: string | null;
  revenue: number;
  units: number;
  orderCount: number;
  sharePercent: number;
  food: FoodFamilyCounts;
};

function buildBrandRows(
  orders: DeliveryOrder[],
  brands: Brand[],
  rules: BrandBillingSplitRules,
  closing?: ClosingBrandOverlay,
): CompanyBrandDayRow[] {
  const active = brandsForBilling(brands).filter((b) => isBrandActive(b));
  const byId = new Map(
    active.map((b) => [String(b._id || b.id || '').trim(), b] as const),
  );
  const revenue: Record<string, number> = {};
  const units: Record<string, number> = {};
  const orderHit: Record<string, number> = {};
  let total = 0;

  for (const order of orders) {
    const rev = orderEuro(order);
    total += rev;
    const attributed = attributeOrderRevenueByBrand(order, rules);
    const unitMap = attributeOrderUnitsByBrand(order, rules);
    const attributedSum =
      Object.values(attributed.byBrand).reduce((s, n) => s + (Number(n) || 0), 0) +
      (Number(attributed.unbranded) || 0);
    const scale = attributedSum > 0 && rev > 0 ? rev / attributedSum : 1;

    for (const [bid, amt] of Object.entries(attributed.byBrand)) {
      const v = (Number(amt) || 0) * scale;
      if (v <= 0) continue;
      revenue[bid] = (revenue[bid] || 0) + v;
      orderHit[bid] = (orderHit[bid] || 0) + 1;
    }
    for (const [bid, u] of Object.entries(unitMap)) {
      const n = Number(u) || 0;
      if (n <= 0) continue;
      units[bid] = (units[bid] || 0) + n;
    }
  }

  // € declarados al cierre (Caja 2) por marca: ventas de apps que pueden no
  // existir como pedidos. Los pedidos pisados ya vienen excluidos de `orders`.
  if (closing) {
    for (const [bid, amt] of Object.entries(closing.revenueByBrand)) {
      const v = Number(amt) || 0;
      if (v <= 0) continue;
      revenue[bid] = (revenue[bid] || 0) + v;
      total += v;
    }
  }

  total = Math.round(total * 100) / 100;

  const rows: CompanyBrandDayRow[] = [];
  for (const [id, brand] of byId) {
    const r = Math.round((revenue[id] || 0) * 100) / 100;
    const u = Math.round((units[id] || 0) * 10) / 10;
    rows.push({
      brandId: id,
      name: brand.name || id,
      color: brand.primaryColor || '#2563EB',
      lineLabel: brand.deliveryLineKind
        ? deliveryBrandLineKindLabel(brand.deliveryLineKind)
        : null,
      revenue: r,
      units: u,
      orderCount: orderHit[id] || 0,
      sharePercent: total > 0 ? Math.round((r / total) * 1000) / 10 : 0,
      food: foodFamilyCountsFromOrdersForBrand(orders, id),
    });
  }

  for (const id of Object.keys(revenue)) {
    if (byId.has(id)) continue;
    const r = Math.round((revenue[id] || 0) * 100) / 100;
    if (r <= 0) continue;
    rows.push({
      brandId: id,
      name: closing?.brandLabels[id] || id.slice(0, 8),
      color: '#9CA3AF',
      lineLabel: null,
      revenue: r,
      units: Math.round((units[id] || 0) * 10) / 10,
      orderCount: orderHit[id] || 0,
      sharePercent: total > 0 ? Math.round((r / total) * 1000) / 10 : 0,
      food: foodFamilyCountsFromOrdersForBrand(orders, id),
    });
  }

  return rows.sort((a, b) => b.revenue - a.revenue);
}

const RANGE_LABEL: Record<BrandPerfRange, string> = {
  day: 'Día',
  month: 'Mes',
  year: 'Año',
};

const RANGE_SHARE_LABEL: Record<BrandPerfRange, string> = {
  day: '% del día',
  month: '% del mes',
  year: '% del año',
};

const RANGE_VS_LABEL: Record<BrandPerfRange, string> = {
  day: 'vs ayer',
  month: 'vs mismos días mes ant.',
  year: 'vs año ant.',
};

function foodLine(food: FoodFamilyCounts): string {
  const parts: string[] = [];
  if (food.pizza > 0) parts.push(`${formatNumberEs(food.pizza, { maxFraction: 0 })} pizzas`);
  if (food.burger > 0) parts.push(`${formatNumberEs(food.burger, { maxFraction: 0 })} burgers`);
  if (food.taco > 0) parts.push(`${formatNumberEs(food.taco, { maxFraction: 0 })} tacos`);
  return parts.join(' · ');
}

function FoodFamilyStrip({
  food,
  prev,
  vsLabel,
}: {
  food: FoodFamilyCounts;
  prev: FoodFamilyCounts;
  vsLabel: string;
}) {
  const items: Array<{ key: keyof FoodFamilyCounts; label: string; n: number; p: number }> = [
    { key: 'pizza', label: 'Pizzas', n: food.pizza, p: prev.pizza },
    { key: 'burger', label: 'Burgers', n: food.burger, p: prev.burger },
    { key: 'taco', label: 'Tacos', n: food.taco, p: prev.taco },
  ];
  // Siempre las 3 familias arriba de marcas (aunque vayan a 0).
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1 text-[11px]">
          <span className="font-medium text-gray-500">{i.label}</span>
          <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {formatNumberEs(i.n, { maxFraction: 0 })}
          </span>
          <VsBadge pct={monthOverMonthPct(i.n, i.p)} />
        </span>
      ))}
      <span className="sr-only">{vsLabel}</span>
    </div>
  );
}

function IntegratorsBlock({
  rows,
  prevByKey,
  vsLabel,
  rangeLabel,
  scopeLabel,
}: {
  rows: IntegratorPerfRow[];
  prevByKey: Map<string, IntegratorPerfRow>;
  vsLabel: string;
  rangeLabel: string;
  scopeLabel?: string;
}) {
  const withSales = rows.filter((r) => r.revenue > 0);
  const shown = withSales.length > 0 ? withSales : rows.filter((r) => r.isAggregator).slice(0, 4);

  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">
        <Radio className="h-3 w-3" />
        Integradores · {rangeLabel}
        {scopeLabel ? ` · ${scopeLabel}` : ''}
      </p>
      {withSales.length === 0 ? (
        <p className="text-[10px] text-gray-400">Sin ventas en integradores · {vsLabel}</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {shown.map((row) => {
            const prev = prevByKey.get(row.key);
            const mom = monthOverMonthPct(row.revenue, prev?.revenue || 0);
            return (
              <div
                key={row.key}
                className="flex items-center justify-between gap-2 py-1"
              >
                <span className="min-w-0 flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate text-[11px] font-semibold text-gray-800 dark:text-gray-100">
                    {row.label}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-1.5 text-right">
                  <span className="text-[11px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatMoneyEs(row.revenue)}
                  </span>
                  <VsBadge pct={mom} />
                  <span className="text-[10px] tabular-nums text-gray-400">
                    {formatNumberEs(row.sharePercent, { maxFraction: 0 })}%
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Props = {
  businessId: string;
  brands: Brand[];
  orders: DeliveryOrder[];
  /** Cierres de caja: suma lo declarado en Caja 2 (marcas/apps) al panel. */
  sessions?: TpvRegisterSession[];
  loading?: boolean;
  /** Móvil: sin tablas anchas de canales, toggles táctiles. */
  compact?: boolean;
};

export function CompanyBrandPerformancePanel({
  businessId,
  brands,
  orders,
  sessions = [],
  loading = false,
  compact = false,
}: Props) {
  const [rules, setRules] = useState<BrandBillingSplitRules>(() =>
    splitRulesFromBillingConfig(null),
  );
  const [selectedId, setSelectedId] = useState<string>('all');
  const [range, setRange] = useState<BrandPerfRange>('month');
  const todayKey = localCalendarDayKey();

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    void getBrandBillingConfigRequest(businessId)
      .then((cfg) => {
        if (!cancelled) setRules(splitRulesFromBillingConfig(cfg));
      })
      .catch(() => {
        if (!cancelled) setRules(splitRulesFromBillingConfig(null));
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const activeOrders = useMemo(
    () =>
      orders.filter((o) => {
        const st = String(o.status || '').toLowerCase();
        if (/cancel/.test(st)) return false;
        // Devueltos no entran en Marcas (ni € ni uds).
        if (isRefundedDeliveryOrder(o)) return false;
        return true;
      }),
    [orders],
  );

  // Declarado al cierre (Caja 2) en el rango: pisa a los pedidos de ese
  // canal ese día, así que esos pedidos se excluyen (no doble conteo).
  const closingNow = useMemo(
    () => buildClosingBrandOverlay(sessions, (d) => dayKeyInRange(d, range, todayKey)),
    [sessions, range, todayKey],
  );

  const closingPrev = useMemo(
    () => buildClosingBrandOverlay(sessions, (d) => dayKeyInPrevRange(d, range, todayKey)),
    [sessions, range, todayKey],
  );

  const rangedOrders = useMemo(
    () =>
      activeOrders.filter(
        (o) =>
          orderInRange(o, range, todayKey)
          && !isOrderReplacedByClosing(closingNow, orderDayKey(o), normalizeOrderChannel(o.channel)),
      ),
    [activeOrders, range, todayKey, closingNow],
  );

  const prevOrders = useMemo(
    () =>
      activeOrders.filter(
        (o) =>
          orderInPrevRange(o, range, todayKey)
          && !isOrderReplacedByClosing(closingPrev, orderDayKey(o), normalizeOrderChannel(o.channel)),
      ),
    [activeOrders, range, todayKey, closingPrev],
  );

  const rows = useMemo(
    () => buildBrandRows(rangedOrders, brands, rules, closingNow),
    [rangedOrders, brands, rules, closingNow],
  );

  const prevRows = useMemo(
    () => buildBrandRows(prevOrders, brands, rules, closingPrev),
    [prevOrders, brands, rules, closingPrev],
  );

  const prevById = useMemo(() => {
    const m = new Map<string, CompanyBrandDayRow>();
    for (const r of prevRows) m.set(r.brandId, r);
    return m;
  }, [prevRows]);

  const selectable = useMemo(() => brandsForBilling(brands), [brands]);

  useEffect(() => {
    if (selectedId === 'all') return;
    if (!selectable.some((b) => String(b._id || b.id) === selectedId)) {
      setSelectedId('all');
    }
  }, [selectable, selectedId]);

  const totalRevenue = useMemo(
    () => Math.round(rows.reduce((s, r) => s + r.revenue, 0) * 100) / 100,
    [rows],
  );
  const prevRevenue = useMemo(
    () => Math.round(prevRows.reduce((s, r) => s + r.revenue, 0) * 100) / 100,
    [prevRows],
  );
  const revenueMom = monthOverMonthPct(totalRevenue, prevRevenue);

  // Unidades = líneas de pedidos + unidades declaradas al cierre por app.
  const foodNow = useMemo(
    () => sumFoodFamilyCounts([foodFamilyCountsFromOrders(rangedOrders), closingNow.food]),
    [rangedOrders, closingNow],
  );
  const foodPrev = useMemo(
    () => sumFoodFamilyCounts([foodFamilyCountsFromOrders(prevOrders), closingPrev.food]),
    [prevOrders, closingPrev],
  );

  const selected = selectedId === 'all' ? null : rows.find((r) => r.brandId === selectedId) || null;
  const selectedPrev = selected ? prevById.get(selected.brandId) || null : null;

  const integratorRows = useMemo(() => {
    if (selectedId !== 'all') {
      return mergeClosingIntoChannelRows(
        buildIntegratorRows(rangedOrders, { brandId: selectedId, rules }),
        closingChannelAmountsForBrand(closingNow, selectedId),
      );
    }
    return mergeClosingIntoChannelRows(
      buildIntegratorRows(rangedOrders),
      closingNow.revenueByChannel,
    );
  }, [rangedOrders, selectedId, rules, closingNow]);

  const prevIntegratorRows = useMemo(() => {
    if (selectedId !== 'all') {
      return mergeClosingIntoChannelRows(
        buildIntegratorRows(prevOrders, { brandId: selectedId, rules }),
        closingChannelAmountsForBrand(closingPrev, selectedId),
      );
    }
    return mergeClosingIntoChannelRows(
      buildIntegratorRows(prevOrders),
      closingPrev.revenueByChannel,
    );
  }, [prevOrders, selectedId, rules, closingPrev]);

  const prevIntegratorByKey = useMemo(() => {
    const m = new Map<string, IntegratorPerfRow>();
    for (const r of prevIntegratorRows) m.set(r.key, r);
    return m;
  }, [prevIntegratorRows]);

  if (!loading && selectable.length === 0) return null;

  const emptyLabel =
    range === 'day'
      ? 'Sin ventas de marca hoy'
      : range === 'month'
        ? 'Sin ventas de marca este mes'
        : 'Sin ventas de marca este año';

  const vsLabel = RANGE_VS_LABEL[range];
  const selectedFood = selected?.food || emptyFoodFamilyCounts();
  const selectedFoodPrev = selectedPrev?.food || emptyFoodFamilyCounts();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex items-center gap-2">
          <Package className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
          <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
            Marcas · {RANGE_LABEL[range].toLowerCase()}
          </p>
          <span className="hidden text-[10px] text-gray-400 sm:inline">{vsLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-900/50">
            {(['day', 'month', 'year'] as const)
              .filter((key) => !compact || key !== 'year')
              .map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  compact ? 'min-h-9 px-2.5' : ''
                } ${
                  range === key
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {RANGE_LABEL[key]}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1">
            <span className="text-xs font-black tabular-nums text-gray-900 dark:text-gray-100">
              {loading ? '…' : formatMoneyEs(totalRevenue)}
            </span>
            {!loading ? <VsBadge pct={revenueMom} /> : null}
          </span>
        </div>
      </div>

      {!loading ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Uds</span>
          <FoodFamilyStrip food={foodNow} prev={foodPrev} vsLabel={vsLabel} />
        </div>
      ) : null}

      <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setSelectedId('all')}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
            compact ? 'min-h-9 px-2.5' : ''
          } ${
            selectedId === 'all'
              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          Todas
        </button>
        {selectable.map((b) => {
          const id = String(b._id || b.id || '');
          const on = selectedId === id;
          const color = b.primaryColor || '#2563EB';
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedId(id)}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                compact ? 'min-h-9 px-2.5' : ''
              } ${
                on ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
              }`}
              style={on ? { backgroundColor: color } : undefined}
            >
              {b.name}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div
          className="mt-2.5 grid animate-pulse grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="Cargando marcas"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/40"
            >
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="mt-2 h-5 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200/70 dark:bg-gray-700" />
              <div className="mt-2 h-2.5 w-32 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      ) : selectedId === 'all' ? (
        <div className="mt-2.5 space-y-2.5">
          {rows.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-gray-400">{emptyLabel}</p>
          ) : (
            <>
              {/* Reparto del periodo entre marcas (barra apilada) */}
              {totalRevenue > 0 ? (
                <div
                  className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
                  aria-label="Reparto de facturación por marca"
                >
                  {rows
                    .filter((r) => r.revenue > 0)
                    .map((r) => (
                      <div
                        key={r.brandId}
                        className="h-full"
                        style={{
                          width: `${Math.max(2, r.sharePercent)}%`,
                          backgroundColor: r.color,
                        }}
                        title={`${r.name} · ${formatNumberEs(r.sharePercent, { maxFraction: 0 })}%`}
                      />
                    ))}
                </div>
              ) : null}

              {/* Comparativa de marcas */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((row) => {
                  const prev = prevById.get(row.brandId);
                  const mom = monthOverMonthPct(row.revenue, prev?.revenue || 0);
                  const foodTxt = foodLine(row.food);
                  const avgTicket = row.orderCount > 0 ? row.revenue / row.orderCount : 0;
                  return (
                    <button
                      key={row.brandId}
                      type="button"
                      onClick={() => setSelectedId(row.brandId)}
                      className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 text-left transition-colors hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40 dark:hover:border-gray-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="truncate text-[11px] font-bold text-gray-900 dark:text-gray-100">
                            {row.name}
                          </span>
                          {row.lineLabel ? (
                            <span className="shrink-0 text-[9px] text-gray-400">
                              {row.lineLabel}
                            </span>
                          ) : null}
                        </span>
                        <VsBadge pct={mom} />
                      </div>

                      <p className="mt-1 text-lg font-black tabular-nums tracking-tight text-gray-900 dark:text-gray-100">
                        {formatMoneyEs(row.revenue)}
                      </p>

                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200/70 dark:bg-gray-700">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(row.revenue > 0 ? 3 : 0, row.sharePercent))}%`,
                              backgroundColor: row.color,
                            }}
                          />
                        </div>
                        <span className="shrink-0 text-[10px] font-bold tabular-nums text-gray-500">
                          {formatNumberEs(row.sharePercent, { maxFraction: 0 })}%
                        </span>
                      </div>

                      <p className="mt-1 truncate text-[10px] text-gray-500">
                        {formatNumberEs(row.orderCount, { maxFraction: 0 })} ped.
                        {avgTicket > 0 ? ` · ticket ${formatMoneyEs(avgTicket)}` : ''}
                        {row.units > 0
                          ? ` · ${formatNumberEs(row.units, { maxFraction: 0 })} uds`
                          : ''}
                      </p>
                      {foodTxt ? (
                        <p className="truncate text-[10px] text-gray-400">{foodTxt}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <IntegratorsBlock
            rows={integratorRows}
            prevByKey={prevIntegratorByKey}
            vsLabel={vsLabel}
            rangeLabel={RANGE_LABEL[range].toLowerCase()}
          />
        </div>
      ) : selected ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selected.color }} />
              <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                {selected.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <p className="text-sm font-black tabular-nums text-gray-900 dark:text-gray-100">
                {formatMoneyEs(selected.revenue)}
              </p>
              <VsBadge pct={monthOverMonthPct(selected.revenue, selectedPrev?.revenue || 0)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
            <span>
              {RANGE_SHARE_LABEL[range]}{' '}
              <strong className="tabular-nums text-gray-800 dark:text-gray-200">
                {formatNumberEs(selected.sharePercent, { maxFraction: 0 })}%
              </strong>
            </span>
            <span className="inline-flex items-center gap-1">
              Ped.{' '}
              <strong className="tabular-nums text-gray-800 dark:text-gray-200">
                {formatNumberEs(selected.orderCount, { maxFraction: 0 })}
              </strong>
              <VsBadge pct={monthOverMonthPct(selected.orderCount, selectedPrev?.orderCount || 0)} />
            </span>
            <span className="inline-flex items-center gap-1">
              Uds{' '}
              <strong className="tabular-nums text-gray-800 dark:text-gray-200">
                {formatNumberEs(selected.units, { maxFraction: 1 })}
              </strong>
              <VsBadge pct={monthOverMonthPct(selected.units, selectedPrev?.units || 0)} />
            </span>
          </div>

          <FoodFamilyStrip food={selectedFood} prev={selectedFoodPrev} vsLabel={vsLabel} />

          <IntegratorsBlock
            rows={integratorRows}
            prevByKey={prevIntegratorByKey}
            vsLabel={vsLabel}
            rangeLabel={RANGE_LABEL[range].toLowerCase()}
            scopeLabel={selected.name}
          />
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">Esta marca no tiene ventas en el periodo.</p>
      )}
    </section>
  );
}
