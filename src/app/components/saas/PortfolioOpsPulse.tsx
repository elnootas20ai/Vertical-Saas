import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
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
import type { PortfolioBusiness } from '../../hooks/usePortfolioOverview';
import {
  aggregateStoreOpsPulses,
  fmtEuro,
  monthOverMonthPct,
  rankStoreOpsPulses,
  type StoreOpsPulse,
} from '../../lib/portfolioMetrics';

type RangeMode = '7d' | 'month';

type Props = {
  rows: PortfolioBusiness[];
  refreshButton: ReactNode;
};

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
    <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
      {pizza}🍕 · {burger}🍔 · {taco}🌮
      {kebab > 0 ? ` · ${kebab}🥙` : ''}
    </span>
  );
}

export function PortfolioOpsPulse({ rows, refreshButton }: Props) {
  const [range, setRange] = useState<RangeMode>('7d');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const pulses = useMemo(() => {
    const list: StoreOpsPulse[] = [];
    for (const row of rows) {
      for (const store of row.stores) {
        if (!store.hasPdv || !store.pdvId) continue;
        list.push(range === '7d' ? store.ops7d : store.opsMonth);
      }
    }
    return rankStoreOpsPulses(list);
  }, [rows, range]);

  const totals = useMemo(() => aggregateStoreOpsPulses(pulses), [pulses]);

  const selected = useMemo(() => {
    if (pulses.length === 0) return null;
    const key = selectedKey || `${pulses[0].businessId}:${pulses[0].storeId}`;
    return pulses.find((p) => `${p.businessId}:${p.storeId}` === key) || pulses[0];
  }, [pulses, selectedKey]);

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

  const rangeLabel = range === '7d' ? 'últimos 7 días' : 'mes en curso';

  if (pulses.length === 0) {
    return (
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-500" />
            Resumen operativo
          </h3>
          {refreshButton}
        </div>
        <p className="text-sm text-gray-500">
          No hay tiendas con PDV en la selección. Cuando haya ventas por tienda, aquí verás €, comida y comparación entre PDVs.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-500" />
            Resumen operativo
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Por tienda · {rangeLabel} · datos reales de pedidos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-0.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50">
            <button
              type="button"
              onClick={() => setRange('7d')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${
                range === '7d'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              7 días
            </button>
            <button
              type="button"
              onClick={() => setRange('month')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${
                range === 'month'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Mes
            </button>
          </div>
          {refreshButton}
        </div>
      </div>

      {/* Cabecera grupo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <HeaderStat
          label="Ventas periodo"
          value={fmtEuro(totals.revenuePeriod)}
          sub={<DeltaBadge pct={totals.revenueMomPct} />}
        />
        <HeaderStat
          label="Hoy"
          value={fmtEuro(totals.revenueToday)}
          sub="Todas las tiendas"
        />
        <HeaderStat
          label="Pedidos"
          value={String(totals.ordersPeriod)}
          sub={`Ticket med. ${fmtEuro(totals.avgTicket)}`}
        />
        <HeaderStat
          label="Pizzas"
          value={String(totals.pizza)}
          sub="Periodo"
        />
        <HeaderStat
          label="Burgers"
          value={String(totals.burger)}
          sub="Periodo"
        />
        <HeaderStat
          label="Tacos"
          value={String(totals.taco)}
          sub={totals.kebab > 0 ? `Kebab ${totals.kebab}` : 'Periodo'}
        />
      </div>

      {/* Ranking PDVs */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50 dark:bg-gray-900/40">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Tienda</th>
              <th className="px-3 py-2 text-right">€ periodo</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-right">Ped.</th>
              <th className="px-3 py-2 text-right">Ticket</th>
              <th className="px-3 py-2">Mix</th>
              <th className="px-3 py-2 text-right">Hoy</th>
              <th className="px-3 py-2 text-right">Δ periodo</th>
            </tr>
          </thead>
          <tbody>
            {pulses.map((p, idx) => {
              const key = `${p.businessId}:${p.storeId}`;
              const active = selected && `${selected.businessId}:${selected.storeId}` === key;
              return (
                <tr
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`cursor-pointer border-t border-gray-100 dark:border-gray-700/80 transition-colors ${
                    active
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-900/30'
                  }`}
                >
                  <td className="px-3 py-2.5 text-xs font-black text-gray-400">{idx + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <div>
                        <p className="font-bold text-gray-900 dark:text-gray-100 text-xs">{p.storeName}</p>
                        <p className="text-[10px] text-gray-400">{p.businessName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-black tabular-nums text-xs">
                    {fmtEuro(p.revenuePeriod)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-600">
                    {p.sharePercent}%
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">{p.ordersPeriod}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">{fmtEuro(p.avgTicket)}</td>
                  <td className="px-3 py-2.5">
                    <MixLine pizza={p.pizza} burger={p.burger} taco={p.taco} kebab={p.kebab} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">
                    {fmtEuro(p.revenueToday)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeltaBadge pct={p.revenueMomPct} />
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/50 font-bold">
              <td className="px-3 py-2.5 text-[10px] uppercase text-gray-500" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums">{fmtEuro(totals.revenuePeriod)}</td>
              <td className="px-3 py-2.5 text-right text-xs">100%</td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums">{totals.ordersPeriod}</td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums">{fmtEuro(totals.avgTicket)}</td>
              <td className="px-3 py-2.5">
                <MixLine
                  pizza={totals.pizza}
                  burger={totals.burger}
                  taco={totals.taco}
                  kebab={totals.kebab}
                />
              </td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums">{fmtEuro(totals.revenueToday)}</td>
              <td className="px-3 py-2.5 text-right">
                <DeltaBadge pct={totals.revenueMomPct} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detalle tienda seleccionada */}
      {selected && (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-black text-gray-900 dark:text-gray-100">{selected.storeName}</p>
                <p className="text-[10px] text-gray-400">{selected.businessName} · € / día</p>
              </div>
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} />
                  <YAxis tick={{ fontSize: 9 }} width={40} />
                  <Tooltip
                    formatter={(value: number) => [fmtEuro(value), 'Ventas']}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <Bar dataKey="euros" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-3 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Día a día · {selected.storeName}
              </p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
              {selected.days.map((d) => {
                const isBest = d.dayKey === bestDayKey;
                const isWorst = d.dayKey === worstDayKey;
                return (
                  <div
                    key={d.dayKey}
                    className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${
                      isBest
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                        : isWorst
                          ? 'bg-rose-50/50 dark:bg-rose-950/20'
                          : ''
                    }`}
                  >
                    <div className="min-w-[100px]">
                      <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                        {d.weekdayLabel}
                        <span className="ml-1 text-[10px] font-semibold text-gray-400">{d.label}</span>
                      </p>
                      {(isBest || isWorst) && (
                        <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
                          {isBest ? 'Mejor día' : 'Día más flojo'}
                        </p>
                      )}
                    </div>
                    <MixLine pizza={d.pizza} burger={d.burger} taco={d.taco} kebab={d.kebab} />
                    <div className="text-right">
                      <p className="text-xs font-black tabular-nums">{fmtEuro(d.revenue)}</p>
                      <p className="text-[10px] text-gray-400">
                        {d.orders} ped. · <DeltaBadge pct={d.revenueDeltaPct} />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Comparativa rápida top 2 */}
      {pulses.length >= 2 && (
        <PdvVersus a={pulses[0]} b={pulses[1]} />
      )}
    </section>
  );
}

function HeaderStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-black tabular-nums text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
      <div className="mt-0.5 text-[10px] text-gray-500">{sub}</div>
    </div>
  );
}

function PdvVersus({ a, b }: { a: StoreOpsPulse; b: StoreOpsPulse }) {
  const revDiff = Math.round((a.revenuePeriod - b.revenuePeriod) * 100) / 100;
  const pizzaDiff = a.pizza - b.pizza;
  const ticketDiff = Math.round((a.avgTicket - b.avgTicket) * 100) / 100;
  const revPct = monthOverMonthPct(a.revenuePeriod, b.revenuePeriod);

  return (
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300 mb-2">
        Comparativa · {a.storeName} vs {b.storeName}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-gray-500 text-[10px]">Diferencia €</p>
          <p className="font-black tabular-nums">
            {revDiff >= 0 ? '+' : ''}
            {fmtEuro(revDiff)}
            {revPct !== null ? (
              <span className="ml-1 font-semibold text-gray-500">({revPct > 0 ? '+' : ''}{revPct}%)</span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-[10px]">Diferencia pizzas</p>
          <p className="font-black tabular-nums">
            {pizzaDiff >= 0 ? '+' : ''}
            {pizzaDiff}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-[10px]">Ticket medio</p>
          <p className="font-black tabular-nums">
            {ticketDiff >= 0 ? '+' : ''}
            {fmtEuro(ticketDiff)}
          </p>
        </div>
      </div>
    </div>
  );
}
