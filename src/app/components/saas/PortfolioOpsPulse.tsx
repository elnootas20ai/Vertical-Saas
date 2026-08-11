/**
 * Resumen operativo por tienda (PDVs) + comparativa top 2 con marcas mismo día.
 * Desktop: tablas. Tablet/móvil (`compact` o &lt; lg): cards densas y legibles.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronRight,
  MapPin,
  Minus,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Brand } from '../../lib/brandApi';
import { getBrandBillingConfigRequest } from '../../lib/brandBillingApi';
import {
  brandsForBilling,
  splitRulesFromBillingConfig,
  type BrandBillingSplitRules,
} from '../../lib/brandBillingConfig';
import { isBrandActive } from '../../lib/brandUtils';
import type { DeliveryOrder } from '../../lib/deliveryApi';
import { formatDateEs } from '../../lib/formatDateEs';
import { formatNumberEs } from '../../lib/formatNumberEs';
import {
  aggregateStoreOpsPulses,
  buildPdvBrandSameDayCompare,
  emptyOpsExcelChannels,
  fmtEuro,
  monthOverMonthPct,
  opsExcelChannelsTotal,
  rankStoreOpsPulses,
  type OpsExcelChannels,
  type PdvBrandSameDayCompare,
  type StoreOpsPulse,
} from '../../lib/portfolioMetrics';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';

type RangeMode = 'day' | '7d' | 'month';

type Props = {
  pulses7d: StoreOpsPulse[];
  pulsesMonth: StoreOpsPulse[];
  refreshButton: ReactNode;
  singleBusiness?: boolean;
  businessId?: string;
  brands?: Brand[];
  orders?: DeliveryOrder[];
  /** Móvil / CeoMobileHome: sin tablas anchas ni gráfica grande. */
  compact?: boolean;
};

const EXCEL_COLS: Array<{ key: keyof OpsExcelChannels; label: string }> = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'tpv', label: 'TPV' },
  { key: 'x', label: 'X' },
  { key: 'app', label: 'App' },
  { key: 'uber', label: 'Uber' },
  { key: 'justEat', label: 'Just Eat' },
  { key: 'glovo', label: 'Glovo' },
];

/** Clave de selección: suma de todas las tiendas del ranking. */
const TOTAL_KEY = '__all__';

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-[10px] text-gray-400">—</span>;
  }
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  const tone = flat
    ? 'text-gray-500'
    : up
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums ${tone}`}>
      <Icon className="w-3 h-3" />
      {up ? '+' : ''}
      {pct}%
    </span>
  );
}

function MixLine({
  pizza,
  burger,
  taco,
  kebab,
}: {
  pizza: number;
  burger: number;
  taco: number;
  kebab: number;
}) {
  return (
    <span className="text-[10px] font-semibold tabular-nums text-gray-600 dark:text-gray-300">
      {formatNumberEs(pizza, { maxFraction: 0 })}🍕 · {formatNumberEs(burger, { maxFraction: 0 })}🍔 ·{' '}
      {formatNumberEs(taco, { maxFraction: 0 })}🌮
      {kebab > 0 ? ` · ${formatNumberEs(kebab, { maxFraction: 0 })}🥙` : ''}
    </span>
  );
}

function MoneyCell({ n }: { n: number }) {
  if (!n) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return <span className="tabular-nums">{fmtEuro(n)}</span>;
}

function dayRowStickyBg(isBest: boolean, isWorst: boolean): string {
  if (isBest) return 'bg-emerald-50 dark:bg-emerald-950';
  if (isWorst) return 'bg-rose-50 dark:bg-rose-950';
  return 'bg-white dark:bg-gray-800';
}

function ChannelMixStrip({ channels }: { channels: OpsExcelChannels }) {
  const safe = channels || emptyOpsExcelChannels();
  const total = opsExcelChannelsTotal(safe) || 1;
  const parts = EXCEL_COLS
    .map((c) => ({ ...c, amount: Number(safe[c.key]) || 0 }))
    .filter((c) => c.amount > 0);
  if (parts.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {parts.map((p) => (
          <div
            key={p.key}
            className="h-full bg-[var(--v-blue,#2563eb)]/80 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${Math.max(2, (p.amount / total) * 100)}%`,
              opacity: 0.55 + (p.amount / total) * 0.45,
            }}
            title={`${p.label}: ${fmtEuro(p.amount)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1">
        {parts.map((p) => (
          <span key={p.key} className="text-[10px] text-gray-600 dark:text-gray-300">
            <span className="font-semibold">{p.label}</span>{' '}
            <span className="tabular-nums">{fmtEuro(p.amount)}</span>
            <span className="text-gray-400">
              {' '}
              · {formatNumberEs(Math.round((p.amount / total) * 100), { maxFraction: 0 })}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function shortDayLabel(dayKey: string): string {
  const parts = formatDateEs(dayKey).split('/');
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return formatDateEs(dayKey);
}

export function PortfolioOpsPulse({
  pulses7d,
  pulsesMonth,
  refreshButton,
  singleBusiness = false,
  businessId,
  brands = [],
  orders = [],
  compact = false,
}: Props) {
  const [range, setRange] = useState<RangeMode>('7d');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [billingRules, setBillingRules] = useState<BrandBillingSplitRules | null>(null);

  useEffect(() => {
    if (!businessId) {
      setBillingRules(null);
      return;
    }
    let cancelled = false;
    getBrandBillingConfigRequest(businessId)
      .then((cfg) => {
        if (!cancelled) setBillingRules(splitRulesFromBillingConfig(cfg));
      })
      .catch(() => {
        if (!cancelled) setBillingRules(null);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  /** "Hoy": día calendario de hoy (no “el último del array”, por si el orden falla). */
  const pulsesDay = useMemo(() => {
    const todayKey = localCalendarDayKey();
    return pulses7d.map((p): StoreOpsPulse => {
      const todayIdx = p.days.findIndex((d) => d.dayKey === todayKey);
      const lastIdx = p.days.length > 0 ? p.days.length - 1 : -1;
      const idx = todayIdx >= 0 ? todayIdx : lastIdx;
      const today = idx >= 0 ? p.days[idx] : null;
      const prev = idx > 0 ? p.days[idx - 1] : null;
      const revenue = today?.revenue || 0;
      const dayOrders = today?.orders || 0;
      return {
        ...p,
        days: today ? [today] : [],
        revenuePeriod: revenue,
        revenuePrevPeriod: prev?.revenue || 0,
        revenueMomPct: prev ? monthOverMonthPct(revenue, prev.revenue) : null,
        ordersPeriod: dayOrders,
        avgTicket: dayOrders > 0 ? Math.round((revenue / dayOrders) * 100) / 100 : 0,
        pizza: today?.pizza || 0,
        burger: today?.burger || 0,
        taco: today?.taco || 0,
        kebab: today?.kebab || 0,
        revenueToday: revenue,
        sharePercent: 0,
        channels: today?.channels || emptyOpsExcelChannels(),
      };
    });
  }, [pulses7d]);

  const pulses = useMemo(
    () =>
      rankStoreOpsPulses(
        range === 'day' ? pulsesDay : range === '7d' ? pulses7d : pulsesMonth,
      ),
    [pulsesDay, pulses7d, pulsesMonth, range],
  );

  const totals = useMemo(() => aggregateStoreOpsPulses(pulses), [pulses]);

  /** Pulso sintético: suma de todas las tiendas (día a día + canales). */
  const allStoresPulse = useMemo((): StoreOpsPulse | null => {
    if (pulses.length === 0) return null;
    const byDay = new Map<
      string,
      {
        dayKey: string;
        label: string;
        weekdayLabel: string;
        revenue: number;
        orders: number;
        pizza: number;
        burger: number;
        taco: number;
        kebab: number;
        channels: OpsExcelChannels;
        revenueDeltaPct: number | null;
      }
    >();
    for (const p of pulses) {
      for (const d of p.days) {
        const prev = byDay.get(d.dayKey);
        if (!prev) {
          byDay.set(d.dayKey, {
            dayKey: d.dayKey,
            label: d.label,
            weekdayLabel: d.weekdayLabel,
            revenue: d.revenue,
            orders: d.orders,
            pizza: d.pizza,
            burger: d.burger,
            taco: d.taco,
            kebab: d.kebab,
            channels: { ...(d.channels || emptyOpsExcelChannels()) },
            revenueDeltaPct: d.revenueDeltaPct,
          });
        } else {
          prev.revenue = Math.round((prev.revenue + d.revenue) * 100) / 100;
          prev.orders += d.orders;
          prev.pizza += d.pizza;
          prev.burger += d.burger;
          prev.taco += d.taco;
          prev.kebab += d.kebab;
          const ch = d.channels || emptyOpsExcelChannels();
          for (const col of EXCEL_COLS) {
            prev.channels[col.key] =
              Math.round((Number(prev.channels[col.key] || 0) + Number(ch[col.key] || 0)) * 100) / 100;
          }
        }
      }
    }
    const days = [...byDay.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    for (let i = 0; i < days.length; i += 1) {
      const cur = days[i];
      const prev = i > 0 ? days[i - 1] : null;
      cur.revenueDeltaPct =
        prev && prev.revenue > 0
          ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 1000) / 10
          : null;
    }
    return {
      storeId: '__all__',
      storeName: `Total · ${pulses.length} tiendas`,
      businessId: pulses[0]?.businessId || '',
      businessName: pulses[0]?.businessName || '',
      pdvId: '',
      days,
      revenuePeriod: totals.revenuePeriod,
      revenuePrevPeriod: totals.revenuePrevPeriod,
      revenueMomPct: totals.revenueMomPct,
      ordersPeriod: totals.ordersPeriod,
      avgTicket: totals.avgTicket,
      pizza: totals.pizza,
      burger: totals.burger,
      taco: totals.taco,
      kebab: totals.kebab,
      revenueToday: totals.revenueToday,
      sharePercent: 100,
      channels: totals.channels,
    };
  }, [pulses, totals]);

  const brandCompare = useMemo((): PdvBrandSameDayCompare | null => {
    if (pulses.length < 2 || brands.length === 0 || orders.length === 0) return null;
    const a = pulses[0];
    const b = pulses[1];
    const active = brandsForBilling(brands).filter((br) => isBrandActive(br));
    if (active.length === 0) return null;
    return buildPdvBrandSameDayCompare(orders, {
      todayKey: localCalendarDayKey(),
      monthsBack: 3,
      storeA: {
        storeName: a.storeName,
        pdvId: a.pdvId,
        workCenterId: a.storeId,
      },
      storeB: {
        storeName: b.storeName,
        pdvId: b.pdvId,
        workCenterId: b.storeId,
      },
      brands: active.map((br) => ({
        id: String(br._id || br.id || '').trim(),
        name: String(br.name || 'Marca').trim(),
        color: br.primaryColor || '#2563EB',
      })),
      rules: billingRules,
    });
  }, [pulses, brands, orders, billingRules]);

  const selected = useMemo(() => {
    if (pulses.length === 0) return null;
    const wantTotal =
      selectedKey === TOTAL_KEY || (selectedKey === null && pulses.length > 1 && !!allStoresPulse);
    if (wantTotal && allStoresPulse) return allStoresPulse;
    if (selectedKey && selectedKey !== TOTAL_KEY) {
      return pulses.find((p) => `${p.businessId}:${p.storeId}` === selectedKey) || pulses[0];
    }
    return pulses[0];
  }, [pulses, selectedKey, allStoresPulse]);

  const totalSelected = Boolean(selected && selected.storeId === '__all__');

  const chartData = useMemo(() => {
    if (!selected) return [];
    return selected.days.map((d) => ({
      label: d.label,
      euros: d.revenue,
      pizzas: d.pizza,
      burgers: d.burger,
      tacos: d.taco,
    }));
  }, [selected]);

  const bestDayKey = useMemo(() => {
    if (!selected?.days.length) return null;
    let best = selected.days[0];
    for (const d of selected.days) {
      if (d.revenue > best.revenue) best = d;
    }
    return best.revenue > 0 ? best.dayKey : null;
  }, [selected]);

  const worstDayKey = useMemo(() => {
    if (!selected?.days.length) return null;
    const withSales = selected.days.filter((d) => d.revenue > 0 || d.orders > 0);
    if (withSales.length < 2) return null;
    let worst = withSales[0];
    for (const d of withSales) {
      if (d.revenue < worst.revenue) worst = d;
    }
    return worst.dayKey !== bestDayKey ? worst.dayKey : null;
  }, [selected, bestDayKey]);

  const rangeLabel =
    range === 'day' ? 'hoy (vs ayer)' : range === '7d' ? 'últimos 7 días' : 'mes en curso';
  const rangeShort = range === 'day' ? 'Hoy' : range === '7d' ? '7 días' : 'Mes';

  if (pulses.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:rounded-2xl sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-gray-100 sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5 text-[var(--v-blue,#2563eb)] sm:h-4 sm:w-4" />
            Resumen operativo
          </h3>
          {refreshButton}
        </div>
        <p className="text-[11px] text-gray-500 sm:text-sm">
          Sin tiendas con PDV. Cuando haya ventas, verás €, comida y comparación.
        </p>
      </section>
    );
  }

  const groupChannels = totals.channels || emptyOpsExcelChannels();

  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:rounded-2xl ${
        compact ? 'space-y-3 p-2.5' : 'space-y-3 p-3 sm:space-y-4 sm:p-4 lg:p-5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-gray-100 sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
            <span className="truncate">Resumen operativo</span>
          </h3>
          {!compact ? (
            <p className="mt-0.5 hidden text-[11px] text-gray-500 sm:block">
              {singleBusiness
                ? `Solo esta empresa · ${rangeLabel}`
                : `Grupo · ${rangeLabel}`}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-900/50">
            {(['day', '7d', 'month'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${
                  compact ? 'min-h-9 px-3' : 'sm:min-h-0'
                } ${
                  range === key
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {key === 'day' ? 'Hoy' : key === '7d' ? '7 días' : 'Mes'}
              </button>
            ))}
          </div>
          {refreshButton}
        </div>
      </div>

      {/* KPIs: ventas + P/B/T siempre (también compact/móvil) */}
      <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-8">
        <HeaderStat
          label="Ventas"
          value={fmtEuro(totals.revenuePeriod)}
          sub={<DeltaBadge pct={totals.revenueMomPct} />}
          dense={compact}
        />
        <HeaderStat
          label="Total caja"
          value={fmtEuro(opsExcelChannelsTotal(groupChannels))}
          sub={compact ? undefined : 'Cierre con todo'}
          dense={compact}
        />
        <HeaderStat
          label="Integraciones"
          value={fmtEuro(
            (Number(groupChannels.app) || 0)
              + (Number(groupChannels.uber) || 0)
              + (Number(groupChannels.justEat) || 0)
              + (Number(groupChannels.glovo) || 0),
          )}
          sub={compact ? undefined : 'App · Uber · JE · Glovo'}
          dense={compact}
        />
        <HeaderStat
          label={range === 'day' ? 'Ayer' : 'Hoy'}
          value={fmtEuro(range === 'day' ? totals.revenuePrevPeriod : totals.revenueToday)}
          sub={compact ? undefined : 'Tiendas'}
          dense={compact}
        />
        <HeaderStat
          label="Ped."
          value={formatNumberEs(totals.ordersPeriod, { maxFraction: 0 })}
          sub={compact ? undefined : rangeShort}
          dense={compact}
        />
        <HeaderStat
          label="Pizzas"
          value={formatNumberEs(totals.pizza, { maxFraction: 0 })}
          sub={rangeShort}
          dense={compact}
        />
        <HeaderStat
          label="Burgers"
          value={formatNumberEs(totals.burger, { maxFraction: 0 })}
          sub={rangeShort}
          dense={compact}
        />
        <HeaderStat
          label="Tacos"
          value={formatNumberEs(totals.taco, { maxFraction: 0 })}
          sub={
            totals.kebab > 0
              ? `Kebab ${formatNumberEs(totals.kebab, { maxFraction: 0 })}`
              : rangeShort
          }
          dense={compact}
        />
      </div>

      {/* Canales */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900/30 sm:px-3 sm:py-2.5">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Canales</p>
          <p className="text-[11px] font-black tabular-nums text-gray-900 dark:text-gray-100">
            {fmtEuro(opsExcelChannelsTotal(groupChannels))}
          </p>
        </div>
        <ChannelMixStrip channels={groupChannels} />
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wide text-gray-400">
                {EXCEL_COLS.map((c) => (
                  <th key={c.key} className="pb-1 pr-2 text-right font-semibold">
                    {c.label}
                  </th>
                ))}
                <th className="pb-1 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200 dark:border-gray-700">
                {EXCEL_COLS.map((c) => (
                  <td key={c.key} className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                    <MoneyCell n={Number(groupChannels[c.key]) || 0} />
                  </td>
                ))}
                <td className="py-1.5 text-right font-extrabold tabular-nums">
                  {fmtEuro(opsExcelChannelsTotal(groupChannels))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards móvil: solo si compact explícito. La foto/PC = tabla TIENDAS siempre. */}
      {compact ? (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Tiendas</p>
          <p className="text-[9px] font-semibold text-[var(--v-blue,#2563eb)]">
            Pulsa total o una tienda →
          </p>
        </div>
        {allStoresPulse && pulses.length > 1 ? (
          <button
            type="button"
            onClick={() => setSelectedKey(TOTAL_KEY)}
            title="Ver suma de todas las tiendas"
            className={`flex w-full min-h-11 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
              totalSelected
                ? 'border-[var(--v-blue,#2563eb)] bg-[rgba(37,99,235,0.08)] ring-1 ring-[rgba(37,99,235,0.25)] dark:border-blue-500 dark:bg-blue-950/40'
                : 'border-[rgba(37,99,235,0.25)] bg-[rgba(37,99,235,0.04)] hover:border-[rgba(37,99,235,0.45)] dark:border-blue-800 dark:bg-blue-950/20'
            }`}
          >
            <span className="min-w-0 flex items-center gap-1.5">
              <span className="w-4 shrink-0 text-[10px] font-black text-[var(--v-blue,#2563eb)]">Σ</span>
              <BarChart3 className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-bold text-gray-900 dark:text-gray-100">
                  Total · todas
                  {totalSelected ? (
                    <span className="ml-1 text-[9px] font-bold text-[var(--v-blue,#2563eb)]">
                      · detalle
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[9px] text-gray-400">
                  {pulses.length} tiendas ·{' '}
                  <MixLine
                    pizza={allStoresPulse.pizza}
                    burger={allStoresPulse.burger}
                    taco={allStoresPulse.taco}
                    kebab={allStoresPulse.kebab}
                  />
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="text-right">
                <span className="block text-[11px] font-black tabular-nums">
                  {fmtEuro(allStoresPulse.revenuePeriod)}
                </span>
                <DeltaBadge pct={allStoresPulse.revenueMomPct} />
              </span>
              <ChevronRight
                className={`h-4 w-4 ${totalSelected ? 'text-[var(--v-blue,#2563eb)]' : 'text-gray-300'}`}
              />
            </span>
          </button>
        ) : null}
        {pulses.map((p, idx) => {
          const key = `${p.businessId}:${p.storeId}`;
          const active = !totalSelected && selected && `${selected.businessId}:${selected.storeId}` === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedKey(key)}
              title="Ver detalle de esta tienda"
              className={`flex w-full min-h-11 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                active
                  ? 'border-[var(--v-blue,#2563eb)] bg-[rgba(37,99,235,0.08)] ring-1 ring-[rgba(37,99,235,0.25)] dark:border-blue-500 dark:bg-blue-950/40'
                  : 'border-gray-100 bg-gray-50/70 hover:border-[rgba(37,99,235,0.35)] dark:border-gray-800 dark:bg-gray-900/30'
              }`}
            >
              <span className="min-w-0 flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-[10px] font-black text-gray-400">{idx + 1}</span>
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold text-gray-900 dark:text-gray-100">
                    {p.storeName}
                    {active ? (
                      <span className="ml-1 text-[9px] font-bold text-[var(--v-blue,#2563eb)]">
                        · detalle
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[9px] text-gray-400">
                    <MixLine pizza={p.pizza} burger={p.burger} taco={p.taco} kebab={p.kebab} />
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-right">
                  <span className="block text-[11px] font-black tabular-nums">
                    {fmtEuro(p.revenuePeriod)}
                  </span>
                  <DeltaBadge pct={p.revenueMomPct} />
                </span>
                <ChevronRight
                  className={`h-4 w-4 ${active ? 'text-[var(--v-blue,#2563eb)]' : 'text-gray-300'}`}
                />
              </span>
            </button>
          );
        })}
      </div>
      ) : null}

      {!compact ? (
        <div className="rounded-xl border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-900/40">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Tiendas</p>
            <p className="text-[10px] font-semibold text-[var(--v-blue,#2563eb)]">
              Pulsa «Total» o una tienda para ver el detalle ↓
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:bg-gray-900/30">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Tienda</th>
                  {EXCEL_COLS.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-right">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">%</th>
                  <th className="px-2 py-2 text-right">Ped.</th>
                  <th className="px-2 py-2">Mix</th>
                  <th className="px-2 py-2 text-right">Hoy</th>
                  <th className="px-2 py-2 text-right">Δ</th>
                  <th className="w-8 px-2 py-2" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {allStoresPulse && pulses.length > 1 ? (
                  <tr
                    onClick={() => setSelectedKey(TOTAL_KEY)}
                    title="Ver suma de todas las tiendas"
                    className={`cursor-pointer border-t border-gray-100 transition-colors dark:border-gray-700/80 ${
                      totalSelected
                        ? 'border-l-4 border-l-[var(--v-blue,#2563eb)] bg-[rgba(37,99,235,0.08)] dark:bg-blue-950/40'
                        : 'border-l-4 border-l-transparent bg-[rgba(37,99,235,0.03)] hover:bg-[rgba(37,99,235,0.06)] dark:bg-blue-950/15 dark:hover:bg-blue-950/25'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-xs font-black text-[var(--v-blue,#2563eb)]">Σ</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
                        <div>
                          <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                            Total · todas las tiendas
                            {totalSelected ? (
                              <span className="ml-1.5 rounded bg-[rgba(37,99,235,0.12)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--v-blue,#2563eb)]">
                                Detalle
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            Suma de {pulses.length} PDVs
                          </p>
                        </div>
                      </div>
                    </td>
                    {EXCEL_COLS.map((c) => (
                      <td key={c.key} className="px-2 py-2.5 text-right text-xs">
                        <MoneyCell n={Number(allStoresPulse.channels[c.key]) || 0} />
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-right text-xs font-black tabular-nums">
                      {fmtEuro(allStoresPulse.revenuePeriod)}
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs tabular-nums text-gray-600">
                      100%
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs tabular-nums">
                      {formatNumberEs(allStoresPulse.ordersPeriod, { maxFraction: 0 })}
                    </td>
                    <td className="px-2 py-2.5">
                      <MixLine
                        pizza={allStoresPulse.pizza}
                        burger={allStoresPulse.burger}
                        taco={allStoresPulse.taco}
                        kebab={allStoresPulse.kebab}
                      />
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs font-semibold tabular-nums">
                      {fmtEuro(allStoresPulse.revenueToday)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <DeltaBadge pct={allStoresPulse.revenueMomPct} />
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <ChevronRight
                        className={`inline h-4 w-4 ${
                          totalSelected ? 'text-[var(--v-blue,#2563eb)]' : 'text-gray-300'
                        }`}
                      />
                    </td>
                  </tr>
                ) : null}
                {pulses.map((p, idx) => {
                  const key = `${p.businessId}:${p.storeId}`;
                  const active =
                    !totalSelected && selected && `${selected.businessId}:${selected.storeId}` === key;
                  const ch = p.channels || emptyOpsExcelChannels();
                  return (
                    <tr
                      key={key}
                      onClick={() => setSelectedKey(key)}
                      title="Ver detalle de esta tienda"
                      className={`cursor-pointer border-t border-gray-100 transition-colors dark:border-gray-700/80 ${
                        active
                          ? 'border-l-4 border-l-[var(--v-blue,#2563eb)] bg-[rgba(37,99,235,0.08)] dark:bg-blue-950/40'
                          : 'border-l-4 border-l-transparent hover:bg-[rgba(37,99,235,0.04)] dark:hover:bg-gray-900/40'
                      }`}
                    >
                      <td className="px-3 py-2.5 text-xs font-black text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
                          <div>
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                              {p.storeName}
                              {active ? (
                                <span className="ml-1.5 rounded bg-[rgba(37,99,235,0.12)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--v-blue,#2563eb)]">
                                  Detalle
                                </span>
                              ) : null}
                            </p>
                            {!singleBusiness && (
                              <p className="text-[10px] text-gray-400">{p.businessName}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      {EXCEL_COLS.map((c) => (
                        <td key={c.key} className="px-2 py-2.5 text-right text-xs">
                          <MoneyCell n={Number(ch[c.key]) || 0} />
                        </td>
                      ))}
                      <td className="px-2 py-2.5 text-right text-xs font-black tabular-nums">
                        {fmtEuro(p.revenuePeriod)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs tabular-nums text-gray-600">
                        {formatNumberEs(p.sharePercent, { maxFraction: 1 })}%
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs tabular-nums">
                        {formatNumberEs(p.ordersPeriod, { maxFraction: 0 })}
                      </td>
                      <td className="px-2 py-2.5">
                        <MixLine pizza={p.pizza} burger={p.burger} taco={p.taco} kebab={p.kebab} />
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs font-semibold tabular-nums">
                        {fmtEuro(p.revenueToday)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <DeltaBadge pct={p.revenueMomPct} />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <ChevronRight
                          className={`inline h-4 w-4 ${
                            active ? 'text-[var(--v-blue,#2563eb)]' : 'text-gray-300'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Detalle tienda */}
      {selected ? (
        compact ? (
          <DayGlanceList
            store={selected}
            bestDayKey={bestDayKey}
            worstDayKey={worstDayKey}
            compact
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="rounded-xl border border-gray-100 p-3 dark:border-gray-700 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-gray-900 dark:text-gray-100">
                    {selected.storeName}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {totalSelected
                      ? '€ / día · suma de todas las tiendas'
                      : '€ / día · tienda seleccionada'}
                  </p>
                </div>
                <TrendingUp className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9 }} width={40} />
                    <Tooltip
                      formatter={(value: number) => [fmtEuro(value), 'Ventas']}
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    />
                    <Bar dataKey="euros" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2">
                <ChannelMixStrip channels={selected.channels || emptyOpsExcelChannels()} />
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700 lg:col-span-3">
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Día a día · {selected.storeName}
                </p>
              </div>
              {/* Móvil: lista completa (sin acortar datos) */}
              <div className="divide-y divide-gray-100 dark:divide-gray-800 lg:hidden">
                {selected.days.map((d) => {
                  const isBest = d.dayKey === bestDayKey;
                  const isWorst = d.dayKey === worstDayKey;
                  const ch = d.channels || emptyOpsExcelChannels();
                  const channelBits = EXCEL_COLS
                    .map((c) => ({ label: c.label, n: Number(ch[c.key]) || 0 }))
                    .filter((c) => c.n > 0);
                  return (
                    <div
                      key={d.dayKey}
                      className={`px-2.5 py-2 ${
                        isBest
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                          : isWorst
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                            {d.weekdayLabel}{' '}
                            <span className="font-normal text-gray-400">{d.label}</span>
                          </p>
                          <MixLine pizza={d.pizza} burger={d.burger} taco={d.taco} kebab={d.kebab} />
                          <p className="mt-0.5 text-[9px] text-gray-400">
                            {formatNumberEs(d.orders, { maxFraction: 0 })} ped.
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] font-black tabular-nums">{fmtEuro(d.revenue)}</p>
                          <DeltaBadge pct={d.revenueDeltaPct} />
                        </div>
                      </div>
                      {channelBits.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {channelBits.map((c) => (
                            <span
                              key={c.label}
                              className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700"
                            >
                              {c.label}{' '}
                              <span className="font-black tabular-nums">{fmtEuro(c.n)}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {/* Escritorio: tabla completa como antes */}
              <div className="hidden max-h-80 overflow-auto lg:block">
                <table className="w-full min-w-[780px] text-[11px]">
                  <thead className="sticky top-0 z-20 bg-white dark:bg-gray-800">
                    <tr className="text-[9px] uppercase tracking-wide text-gray-400">
                      <th className="sticky left-0 z-30 bg-white px-2 py-1.5 text-left font-semibold dark:bg-gray-800">
                        Día
                      </th>
                      {EXCEL_COLS.map((c) => (
                        <th key={c.key} className="px-1.5 py-1.5 text-right font-semibold">
                          {c.label}
                        </th>
                      ))}
                      <th className="px-1.5 py-1.5 text-right font-semibold">Total</th>
                      <th className="px-1.5 py-1.5 text-right font-semibold">Ped.</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Mix</th>
                      <th className="px-2 py-1.5 pr-3 text-right font-semibold">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.days.map((d) => {
                      const isBest = d.dayKey === bestDayKey;
                      const isWorst = d.dayKey === worstDayKey;
                      const ch = d.channels || emptyOpsExcelChannels();
                      const stickyBg = dayRowStickyBg(isBest, isWorst);
                      return (
                        <tr
                          key={d.dayKey}
                          className={`border-t border-gray-100 dark:border-gray-700/80 ${
                            isBest
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                              : isWorst
                                ? 'bg-rose-50/50 dark:bg-rose-950/20'
                                : ''
                          }`}
                        >
                          <td className={`sticky left-0 z-10 px-2 py-1.5 ${stickyBg}`}>
                            <p className="font-bold text-gray-900 dark:text-gray-100">
                              {d.weekdayLabel}
                              <span className="ml-1 text-[10px] font-semibold text-gray-400">
                                {d.label}
                              </span>
                            </p>
                          </td>
                          {EXCEL_COLS.map((c) => (
                            <td key={c.key} className="px-1.5 py-1.5 text-right">
                              <MoneyCell n={Number(ch[c.key]) || 0} />
                            </td>
                          ))}
                          <td className="px-1.5 py-1.5 text-right font-black tabular-nums">
                            {fmtEuro(d.revenue)}
                          </td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums text-gray-500">
                            {formatNumberEs(d.orders, { maxFraction: 0 })}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5">
                            <MixLine
                              pizza={d.pizza}
                              burger={d.burger}
                              taco={d.taco}
                              kebab={d.kebab}
                            />
                          </td>
                          <td className="px-2 py-1.5 pr-3 text-right">
                            <DeltaBadge pct={d.revenueDeltaPct} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      ) : null}

      {pulses.length >= 2 ? (
        <PdvVersus a={pulses[0]} b={pulses[1]} brandCompare={brandCompare} compact={compact} />
      ) : null}
    </section>
  );
}

function HeaderStat({
  label,
  value,
  sub,
  dense,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  dense?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-100 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40 ${
        dense ? 'px-2 py-1.5' : 'px-2.5 py-2 sm:px-3'
      }`}
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p
        className={`font-black tabular-nums text-gray-900 dark:text-gray-100 ${
          dense ? 'text-xs' : 'mt-0.5 text-sm'
        }`}
      >
        {value}
      </p>
      {sub ? <div className="mt-0.5 text-[10px] text-gray-500">{sub}</div> : null}
    </div>
  );
}

function DayGlanceList({
  store,
  bestDayKey,
  worstDayKey,
  compact = false,
}: {
  store: StoreOpsPulse;
  bestDayKey: string | null;
  worstDayKey: string | null;
  compact?: boolean;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const days = compact ? store.days.slice(-7) : store.days;

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700">
      <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
          Día a día · {store.storeName}
          {compact ? ' · últimos 7' : ''}
        </p>
        <p className="mt-0.5 text-[9px] text-gray-400">
          Pulsa un día para ver canales
        </p>
      </div>
      <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
        {days.map((d) => {
          const isBest = d.dayKey === bestDayKey;
          const isWorst = d.dayKey === worstDayKey;
          const open = openDay === d.dayKey;
          const ch = d.channels || emptyOpsExcelChannels();
          const channelBits = EXCEL_COLS
            .map((c) => ({ label: c.label, n: Number(ch[c.key]) || 0 }))
            .filter((c) => c.n > 0);

          return (
            <div
              key={d.dayKey}
              className={
                isBest
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                  : isWorst
                    ? 'bg-rose-50/40 dark:bg-rose-950/20'
                    : ''
              }
            >
              <button
                type="button"
                onClick={() => setOpenDay(open ? null : d.dayKey)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left ${
                  compact ? 'min-h-11' : 'min-h-10'
                }`}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                      {d.label}
                    </span>
                    <span className="text-[9px] text-gray-400">{d.weekdayLabel}</span>
                    {isBest ? (
                      <span className="text-[9px] font-bold text-emerald-600">mejor</span>
                    ) : null}
                    {isWorst ? (
                      <span className="text-[9px] font-bold text-rose-600">flojo</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block">
                    <MixLine pizza={d.pizza} burger={d.burger} taco={d.taco} kebab={d.kebab} />
                    <span className="ml-1.5 text-[9px] text-gray-400">
                      · {formatNumberEs(d.orders, { maxFraction: 0 })} ped.
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-right">
                    <span className="block text-[11px] font-black tabular-nums text-gray-900 dark:text-gray-100">
                      {fmtEuro(d.revenue)}
                    </span>
                    <DeltaBadge pct={d.revenueDeltaPct} />
                  </span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-gray-300 transition-transform ${
                      open ? 'rotate-90 text-[var(--v-blue,#2563eb)]' : ''
                    }`}
                  />
                </span>
              </button>
              {open ? (
                <div className="border-t border-gray-100/80 px-2.5 pb-2 pt-1 dark:border-gray-800">
                  {channelBits.length === 0 ? (
                    <p className="text-[10px] text-gray-400">Sin desglose de canales</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {channelBits.map((c) => (
                        <span
                          key={c.label}
                          className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700"
                        >
                          {c.label}{' '}
                          <span className="tabular-nums font-black">{fmtEuro(c.n)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PdvVersus({
  a,
  b,
  brandCompare,
  compact = false,
}: {
  a: StoreOpsPulse;
  b: StoreOpsPulse;
  brandCompare?: PdvBrandSameDayCompare | null;
  compact?: boolean;
}) {
  const revDiff = Math.round((a.revenuePeriod - b.revenuePeriod) * 100) / 100;
  const pizzaDiff = a.pizza - b.pizza;
  const glovoDiff = Math.round(((a.channels?.glovo || 0) - (b.channels?.glovo || 0)) * 100) / 100;
  const revPct = monthOverMonthPct(a.revenuePeriod, b.revenuePeriod);
  const dayNum = brandCompare?.dayOfMonth
    ? String(brandCompare.dayOfMonth).padStart(2, '0')
    : null;

  const [focusDay, setFocusDay] = useState<string | null>(null);
  const dayKeys = brandCompare?.dayKeys || [];
  const activeDay = focusDay && dayKeys.includes(focusDay) ? focusDay : dayKeys[dayKeys.length - 1] || null;

  return (
    <div
      className={`rounded-xl border border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.04)] dark:border-blue-900/50 dark:bg-blue-950/20 ${
        compact ? 'px-2.5 py-2' : 'px-3 py-3'
      }`}
    >
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--v-blue,#2563eb)]">
        Comparativa · {a.storeName} vs {b.storeName}
      </p>

      <div className="grid grid-cols-3 gap-2 text-[11px] sm:max-w-none">
        <div className="rounded-lg bg-white/70 px-2 py-1.5 dark:bg-gray-900/40">
          <p className="text-[9px] text-gray-500">€</p>
          <p className="font-black tabular-nums text-gray-900 dark:text-gray-100">
            {revDiff >= 0 ? '+' : ''}
            {fmtEuro(revDiff)}
          </p>
          {revPct !== null ? (
            <p className="text-[9px] text-gray-400">
              {revPct > 0 ? '+' : ''}
              {revPct}%
            </p>
          ) : null}
        </div>
        <div className="rounded-lg bg-white/70 px-2 py-1.5 dark:bg-gray-900/40">
          <p className="text-[9px] text-gray-500">Pizzas</p>
          <p className="font-black tabular-nums text-gray-900 dark:text-gray-100">
            {pizzaDiff >= 0 ? '+' : ''}
            {formatNumberEs(pizzaDiff, { maxFraction: 0 })}
          </p>
        </div>
        <div className="rounded-lg bg-white/70 px-2 py-1.5 dark:bg-gray-900/40">
          <p className="text-[9px] text-gray-500">Glovo</p>
          <p className="font-black tabular-nums text-gray-900 dark:text-gray-100">
            {glovoDiff >= 0 ? '+' : ''}
            {fmtEuro(glovoDiff)}
          </p>
        </div>
      </div>

      {brandCompare && brandCompare.brands.length > 0 ? (
        <div className="mt-2.5 border-t border-[rgba(37,99,235,0.15)] pt-2 dark:border-blue-900/40">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--v-blue,#2563eb)]">
            Marcas · día {dayNum}
            <span className="ml-1 font-medium normal-case tracking-normal text-gray-500">
              · mismo día · meses atrás
            </span>
          </p>

          {/* Chips de fecha (móvil/tablet) */}
          <div className="mb-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
            {dayKeys.map((dk) => {
              const on = dk === activeDay;
              return (
                <button
                  key={dk}
                  type="button"
                  onClick={() => setFocusDay(dk)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    compact ? 'min-h-9' : ''
                  } ${
                    on
                      ? 'bg-[var(--v-blue,#2563eb)] text-white'
                      : 'bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300'
                  }`}
                >
                  {shortDayLabel(dk)}
                </button>
              );
            })}
          </div>

          {/* Vista móvil/tablet: foco en un día */}
          <div className="space-y-1.5 lg:hidden">
            <p className="text-[9px] text-gray-500">
              {activeDay ? formatDateEs(activeDay) : ''} ·{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">{a.storeName}</span>
              {' · '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">{b.storeName}</span>
            </p>
            {brandCompare.brands.map((brand) => {
              const point = brand.points.find((p) => p.dayKey === activeDay);
              if (!point) return null;
              const bothActive = point.aActive && point.bActive;
              const diff = bothActive
                ? Math.round((point.aUnits - point.bUnits) * 10) / 10
                : null;
              return (
                <div
                  key={brand.brandId}
                  className="rounded-lg border border-white/80 bg-white/80 px-2.5 py-1.5 dark:border-gray-700 dark:bg-gray-900/50"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: brand.color }}
                    />
                    <span className="truncate text-[11px] font-bold text-gray-900 dark:text-gray-100">
                      {brand.brandName}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                    <div>
                      <p className="truncate text-[9px] text-gray-400">{a.storeName}</p>
                      <p className="font-black tabular-nums">
                        {point.aActive
                          ? formatNumberEs(point.aUnits, { maxFraction: 1 })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="truncate text-[9px] text-gray-400">{b.storeName}</p>
                      <p className="font-black tabular-nums">
                        {point.bActive
                          ? formatNumberEs(point.bUnits, { maxFraction: 1 })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400">Δ</p>
                      <p
                        className={`font-black tabular-nums ${
                          diff == null || diff === 0
                            ? 'text-gray-400'
                            : diff > 0
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                        }`}
                      >
                        {diff == null
                          ? '—'
                          : `${diff > 0 ? '+' : ''}${formatNumberEs(diff, { maxFraction: 1 })}`}
                      </p>
                    </div>
                  </div>
                  {!bothActive ? (
                    <p className="mt-1 text-[9px] text-gray-400">Sin histórico (alta posterior)</p>
                  ) : null}
                </div>
              );
            })}

            {/* Historial compacto por marca (todos los meses) */}
            <details className="rounded-lg border border-dashed border-gray-200 bg-white/50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
              <summary className="cursor-pointer text-[10px] font-bold text-gray-600 dark:text-gray-300">
                Ver historial 3 meses
              </summary>
              <div className="mt-1.5 space-y-2">
                {brandCompare.brands.map((brand) => (
                  <div key={`hist-${brand.brandId}`}>
                    <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-gray-800 dark:text-gray-100">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: brand.color }}
                      />
                      {brand.brandName}
                    </p>
                    <div className="space-y-0.5">
                      {brand.points.map((p) => {
                        const both = p.aActive && p.bActive;
                        const diff = both
                          ? Math.round((p.aUnits - p.bUnits) * 10) / 10
                          : null;
                        return (
                          <div
                            key={p.dayKey}
                            className="flex items-center justify-between gap-2 text-[10px] tabular-nums"
                          >
                            <span className="text-gray-500">{shortDayLabel(p.dayKey)}</span>
                            <span className="font-semibold text-gray-800 dark:text-gray-100">
                              {p.aActive
                                ? formatNumberEs(p.aUnits, { maxFraction: 1 })
                                : '—'}
                              {' · '}
                              {p.bActive
                                ? formatNumberEs(p.bUnits, { maxFraction: 1 })
                                : '—'}
                              {diff != null ? (
                                <span
                                  className={`ml-1.5 ${
                                    diff === 0
                                      ? 'text-gray-400'
                                      : diff > 0
                                        ? 'text-emerald-600'
                                        : 'text-rose-600'
                                  }`}
                                >
                                  {diff > 0 ? '+' : ''}
                                  {formatNumberEs(diff, { maxFraction: 1 })}
                                </span>
                              ) : (
                                <span className="ml-1.5 text-gray-400">sin hist.</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* Vista desktop: tabla */}
          <div className="hidden overflow-x-auto overscroll-x-contain lg:block">
            <table className="min-w-full text-[10px]">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="sticky left-0 z-10 bg-[rgba(239,246,255,0.95)] py-1 pr-2 font-bold dark:bg-blue-950/95">
                    Marca
                  </th>
                  {brandCompare.dayKeys.map((dk) => (
                    <th key={dk} className="px-1.5 py-1 text-center font-bold whitespace-nowrap">
                      {formatDateEs(dk)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {brandCompare.brands.map((brand) => (
                  <tr
                    key={brand.brandId}
                    className="border-t border-[rgba(37,99,235,0.12)] dark:border-blue-900/30"
                  >
                    <td className="sticky left-0 z-10 bg-[rgba(239,246,255,0.95)] py-1.5 pr-2 dark:bg-blue-950/95">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800 dark:text-gray-100">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: brand.color }}
                        />
                        <span className="max-w-[7rem] truncate">{brand.brandName}</span>
                      </span>
                    </td>
                    {brand.points.map((p) => {
                      const both = p.aActive && p.bActive;
                      const diff = both
                        ? Math.round((p.aUnits - p.bUnits) * 10) / 10
                        : null;
                      return (
                        <td key={p.dayKey} className="px-1.5 py-1.5 text-center tabular-nums">
                          {!both && !p.aActive && !p.bActive ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <>
                              <span className="font-bold text-gray-900 dark:text-gray-100">
                                {p.aActive
                                  ? formatNumberEs(p.aUnits, { maxFraction: 1 })
                                  : '—'}
                              </span>
                              <span className="text-gray-400"> · </span>
                              <span className="font-bold text-gray-900 dark:text-gray-100">
                                {p.bActive
                                  ? formatNumberEs(p.bUnits, { maxFraction: 1 })
                                  : '—'}
                              </span>
                              {diff != null && (p.aUnits > 0 || p.bUnits > 0) ? (
                                <span
                                  className={`mt-0.5 block text-[9px] font-semibold ${
                                    diff === 0
                                      ? 'text-gray-400'
                                      : diff > 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {diff > 0 ? '+' : ''}
                                  {formatNumberEs(diff, { maxFraction: 1 })}
                                </span>
                              ) : (
                                <span className="mt-0.5 block text-[9px] text-gray-300">
                                  {both ? '—' : 'sin hist.'}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[9px] text-gray-500">
              Cada celda: uds {a.storeName} · {b.storeName} · abajo Δ
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
