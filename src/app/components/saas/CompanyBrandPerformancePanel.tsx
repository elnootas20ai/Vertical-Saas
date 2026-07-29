/**
 * Dashboard empresa delivery: marcas seleccionables + €/uds de hoy
 * con las reglas de Facturación (sin hardcode Modomio/BB).
 */
import { useEffect, useMemo, useState } from 'react';
import { Package, Store } from 'lucide-react';
import type { Brand } from '../../lib/brandApi';
import type { DeliveryOrder } from '../../lib/deliveryApi';
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
import { localCalendarDayKey } from '../../lib/tpvCajaScope';
import { getDeliveryOrderDeliveredAtIso, isDeliveryOrderDelivered } from '../../lib/portfolioMetrics';

function foldDay(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return localCalendarDayKey(d);
}

function orderBelongsToDay(order: DeliveryOrder, dayKey: string): boolean {
  const delivered = getDeliveryOrderDeliveredAtIso(order);
  if (delivered && foldDay(delivered) === dayKey) return true;
  if (isDeliveryOrderDelivered(order) && foldDay(String(order.updatedAt || '')) === dayKey) return true;
  return foldDay(String(order.createdAt || '')) === dayKey;
}

function orderEuro(order: DeliveryOrder): number {
  const t = Number(order.totalAmount ?? order.total);
  if (Number.isFinite(t) && t > 0) return t;
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((s, it) => s + lineRevenueAmount(it), 0);
}

function fmtEuro(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
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
};

function buildBrandDayRows(
  orders: DeliveryOrder[],
  brands: Brand[],
  rules: BrandBillingSplitRules,
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

  total = Math.round(total * 100) / 100;

  const rows: CompanyBrandDayRow[] = [];
  for (const [id, brand] of byId) {
    const r = Math.round((revenue[id] || 0) * 100) / 100;
    const u = Math.round((units[id] || 0) * 10) / 10;
    rows.push({
      brandId: id,
      name: brand.name || id,
      color: brand.primaryColor || '#6366F1',
      lineLabel: brand.deliveryLineKind
        ? deliveryBrandLineKindLabel(brand.deliveryLineKind)
        : null,
      revenue: r,
      units: u,
      orderCount: orderHit[id] || 0,
      sharePercent: total > 0 ? Math.round((r / total) * 1000) / 10 : 0,
    });
  }

  // Marcas con € aunque no estén en byId (ids huérfanos)
  for (const id of Object.keys(revenue)) {
    if (byId.has(id)) continue;
    const r = Math.round((revenue[id] || 0) * 100) / 100;
    if (r <= 0) continue;
    rows.push({
      brandId: id,
      name: id.slice(0, 8),
      color: '#9CA3AF',
      lineLabel: null,
      revenue: r,
      units: Math.round((units[id] || 0) * 10) / 10,
      orderCount: orderHit[id] || 0,
      sharePercent: total > 0 ? Math.round((r / total) * 1000) / 10 : 0,
    });
  }

  return rows.sort((a, b) => b.revenue - a.revenue);
}

type Props = {
  businessId: string;
  brands: Brand[];
  orders: DeliveryOrder[];
  loading?: boolean;
};

export function CompanyBrandPerformancePanel({
  businessId,
  brands,
  orders,
  loading = false,
}: Props) {
  const [rules, setRules] = useState<BrandBillingSplitRules>(() =>
    splitRulesFromBillingConfig(null),
  );
  const [selectedId, setSelectedId] = useState<string>('all');
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

  const todayOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          !/cancel/.test(String(o.status || '').toLowerCase()) &&
          orderBelongsToDay(o, todayKey),
      ),
    [orders, todayKey],
  );

  const rows = useMemo(
    () => buildBrandDayRows(todayOrders, brands, rules),
    [todayOrders, brands, rules],
  );

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

  const selected = selectedId === 'all' ? null : rows.find((r) => r.brandId === selectedId) || null;

  if (!loading && selectable.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-amber-600" />
            Marcas · hoy
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Según Facturación (Empresa → Marca). Elige una marca para ver cómo va.
          </p>
        </div>
        <p className="text-sm font-black tabular-nums text-gray-900 dark:text-gray-100">
          {loading ? '…' : fmtEuro(totalRevenue)}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedId('all')}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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
          const color = b.primaryColor || '#6366F1';
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedId(id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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
        <p className="mt-3 text-xs text-gray-500">Cargando…</p>
      ) : selectedId === 'all' ? (
        <div className="mt-3 space-y-1.5">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-700">
              Sin ventas de marca hoy
            </p>
          ) : (
            rows.map((row) => (
              <button
                key={row.brandId}
                type="button"
                onClick={() => setSelectedId(row.brandId)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2 text-left transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-800/50 dark:hover:border-gray-600"
              >
                <span className="min-w-0 flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
                    {row.name}
                  </span>
                  {row.lineLabel ? (
                    <span className="truncate text-[10px] text-gray-400">{row.lineLabel}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {fmtEuro(row.revenue)}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {row.sharePercent}% · {row.orderCount} ped. · {row.units} uds
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : selected ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selected.color }} />
                {selected.name}
              </p>
              {selected.lineLabel ? (
                <p className="mt-0.5 text-[11px] text-gray-500">{selected.lineLabel}</p>
              ) : null}
            </div>
            <p className="text-lg font-black tabular-nums text-gray-900 dark:text-gray-100">
              {fmtEuro(selected.revenue)}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white px-2 py-2 dark:bg-gray-900/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">% del día</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {selected.sharePercent}%
              </p>
            </div>
            <div className="rounded-lg bg-white px-2 py-2 dark:bg-gray-900/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pedidos</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {selected.orderCount}
              </p>
            </div>
            <div className="rounded-lg bg-white px-2 py-2 dark:bg-gray-900/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Unidades</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {selected.units}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-gray-400 flex items-center gap-1">
            <Store className="h-3 w-3" />
            Reparto con reglas de Facturación · {todayKey}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-500">Esta marca no tiene ventas hoy.</p>
      )}
    </section>
  );
}
