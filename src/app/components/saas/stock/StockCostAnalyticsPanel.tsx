/**
 * KPIs de escandallo, merma y variación inventario.
 * Solo carga datos cuando el panel está visible (MobileLazySection + secuencia KPI).
 */
import { useEffect, useState } from 'react';
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MobileLazySection } from '../MobileLazySection';
import { useStockAnalyticsOverview } from '../../../hooks/useStockAnalyticsOverview';
import { useStockAnalyticsInsights } from '../../../hooks/useStockAnalyticsInsights';
import {
  defaultStockAnalyticsRange,
  type StockAnalyticsInsights,
  type StockAnalyticsInsightsKpi,
  type StockAnalyticsKpi,
  type StockAnalyticsKpiId,
  type StockAnalyticsTone,
} from '../../../lib/stockAnalyticsApi';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import { downloadXlsx } from '../../../verticals/delivery/informes/VertialInformeProgress';
import type { InformeChart } from '../../../verticals/delivery/informes/loaders/informeTypes';

type Props = {
  userId: string;
  businessId?: string;
  /** Si false, no hace fetch (panel colapsado). */
  active?: boolean;
};

const TONE_CLASS: Record<StockAnalyticsTone, string> = {
  ok: 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
  warn: 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
  bad: 'border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300',
  neutral: 'border-stone-200 bg-white text-stone-800 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-200',
};

function formatKpiValue(kpi: StockAnalyticsKpi | undefined, loading: boolean): string {
  if (loading && !kpi) return '…';
  if (!kpi || kpi.value == null) return '—';
  if (kpi.unit === 'pct') {
    return `${formatNumberEs(kpi.value, { maxFraction: 1 })} %`;
  }
  return `${formatMoneyEs(kpi.value)} €`;
}

function kpiSubline(kpi: StockAnalyticsKpi | undefined): string | null {
  if (!kpi) return null;
  if (kpi.unit === 'pct' && kpi.amount != null && kpi.amount > 0) {
    return `${formatMoneyEs(kpi.amount)} €`;
  }
  if (kpi.unit === 'eur' && kpi.pct != null) {
    return `${formatNumberEs(kpi.pct, { maxFraction: 1 })} % ventas`;
  }
  if (kpi.id === 'recipe_coverage' && kpi.count != null && kpi.total != null) {
    return `${kpi.count}/${kpi.total} productos`;
  }
  if (kpi.id === 'inventory_variance' && kpi.shrinkage != null) {
    return `Shrinkage ${formatMoneyEs(kpi.shrinkage)} €`;
  }
  return kpi.hint || null;
}

function KpiCard({
  kpi,
  loading,
}: {
  kpi?: StockAnalyticsKpi;
  loading: boolean;
}) {
  const tone = kpi?.tone || 'neutral';
  const delta = kpi?.vsPrevPeriod;
  return (
    <div
      className={`rounded-2xl border px-3 py-3 min-h-[88px] flex flex-col justify-between ${TONE_CLASS[tone]}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">
        {kpi?.label || 'Cargando…'}
      </p>
      <p className="text-xl font-black tabular-nums leading-tight mt-1">
        {formatKpiValue(kpi, loading)}
      </p>
      <div className="mt-1 flex items-center justify-between gap-1 min-h-[14px]">
        <p className="text-[10px] opacity-75 truncate">{kpiSubline(kpi) || kpi?.hint || ''}</p>
        {delta != null && delta !== 0 ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold shrink-0">
            {delta > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta > 0 ? '+' : ''}
            {formatNumberEs(delta, { maxFraction: 1 })} pp
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function StockCostAnalyticsPanel({ userId, businessId, active = true }: Props) {
  const [range] = useState(() => defaultStockAnalyticsRange(30));
  const [visible, setVisible] = useState(false);

  const enabled = active && visible && Boolean(userId);
  const { kpis, alerts, loading, error, reload, sequence } = useStockAnalyticsOverview(userId, {
    enabled,
    range: { ...range, businessId },
  });

  return (
    <MobileLazySection
      rootMargin="120px 0px"
      eagerFromMd={false}
      placeholder={
        <div className="flex min-h-[72px] items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-4 text-[11px] text-stone-400 dark:border-stone-800 dark:bg-stone-950/40">
          Desliza para cargar costes y mermas…
        </div>
      }
    >
      <StockCostAnalyticsInner
        userId={userId}
        businessId={businessId}
        range={range}
        onVisible={() => setVisible(true)}
        loading={loading}
        error={error}
        onReload={reload}
        sequence={sequence}
        kpis={kpis}
        alerts={alerts}
      />
    </MobileLazySection>
  );
}

function StockCostAnalyticsInner({
  userId,
  businessId,
  range,
  onVisible,
  loading,
  error,
  onReload,
  sequence,
  kpis,
  alerts,
}: {
  userId: string;
  businessId?: string;
  range: { dateFrom: string; dateTo: string };
  onVisible: () => void;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  sequence: StockAnalyticsKpiId[];
  kpis: Partial<Record<StockAnalyticsKpiId, StockAnalyticsKpi>>;
  alerts: Array<{ id: string; severity: string; message: string }>;
}) {
  const [gerencialOpen, setGerencialOpen] = useState(false);

  useEffect(() => {
    onVisible();
  }, [onVisible]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900/40">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-indigo-600" />
            Costes, escandallo y merma
          </p>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
            Últimos 30 días · una consulta al servidor
          </p>
        </div>
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-300"
          title="Recargar"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error ? (
        <p className="mb-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      {alerts.length > 0 ? (
        <div className="mb-3 space-y-1">
          {alerts.map((a) => (
            <p
              key={a.id}
              className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] ${
                a.severity === 'danger'
                  ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                  : a.severity === 'warning'
                    ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'bg-stone-50 text-stone-700 dark:bg-stone-900/60 dark:text-stone-300'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {a.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {sequence.map((id) => (
          <KpiCard
            key={id}
            kpi={kpis[id]}
            loading={loading && !kpis[id]}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
        <button
          type="button"
          onClick={() => setGerencialOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-800/60"
        >
          <span>Detalle gerencial (evolución, comparativa, tiendas)</span>
          {gerencialOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-stone-400" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
          )}
        </button>
        {gerencialOpen ? (
          <GerencialDetailSection
            userId={userId}
            businessId={businessId}
            range={range}
          />
        ) : null}
      </div>
    </div>
  );
}

const INSIGHT_TONE_CLASS: Record<string, string> = {
  positive: 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
  negative: 'border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300',
  neutral: 'border-stone-200 bg-white text-stone-800 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-200',
};

function WeeklyEvolutionChart({ chart }: { chart: InformeChart }) {
  if (!chart.points.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 px-3 py-8 text-center text-[11px] text-stone-400 dark:border-stone-700">
        Sin datos semanales en el periodo
      </div>
    );
  }
  const tooltipStyle = {
    contentStyle: { background: '#1f2937', border: 'none', borderRadius: 10, fontSize: 11, color: '#fff' },
    itemStyle: { color: '#fff' },
  };
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3 dark:border-stone-700 dark:bg-stone-950/30">
      <p className="mb-2 text-[11px] font-bold text-stone-800 dark:text-stone-100">{chart.title}</p>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.points}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={42} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {chart.series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color || '#2563eb'}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function InsightKpiCard({ kpi }: { kpi: StockAnalyticsInsightsKpi }) {
  const tone = kpi.tone === 'positive' || kpi.tone === 'negative' ? kpi.tone : 'neutral';
  return (
    <div className={`rounded-xl border px-2.5 py-2 ${INSIGHT_TONE_CLASS[tone]}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide opacity-80">{kpi.label}</p>
      <p className="text-sm font-black tabular-nums mt-0.5">{kpi.value}</p>
    </div>
  );
}

function GerencialDetailSection({
  userId,
  businessId,
  range,
}: {
  userId: string;
  businessId?: string;
  range: { dateFrom: string; dateTo: string };
}) {
  const { insights, loading, error, reload } = useStockAnalyticsInsights(userId, {
    enabled: true,
    range: { ...range, businessId },
  });

  const handleExport = () => {
    if (!insights?.exportRows?.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    void downloadXlsx(insights.exportRows, `vertial-gerencial-${stamp}`);
  };

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-stone-500 dark:text-stone-400">
          {insights?.prevRange
            ? `Comparativa vs ${insights.prevRange.from} → ${insights.prevRange.to}`
            : 'Comparativa vs periodo anterior'}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-300"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || !insights?.exportRows?.length}
            className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="h-3 w-3" />
            Excel
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      {loading && !insights ? (
        <div className="animate-pulse space-y-2" aria-busy="true" aria-label="Cargando detalle gerencial">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-stone-100 dark:bg-stone-800" />
            ))}
          </div>
          <div className="h-28 rounded-xl bg-stone-100 dark:bg-stone-800" />
          <div className="h-24 rounded-xl bg-stone-100 dark:bg-stone-800" />
        </div>
      ) : null}

      {insights ? <GerencialInsightsBody insights={insights} /> : null}
    </div>
  );
}

function GerencialInsightsBody({ insights }: { insights: StockAnalyticsInsights }) {
  const cmpRows = insights.periodComparison?.rows || [];
  const cmpKpis = insights.periodComparison?.kpis || [];
  const pdvRows = insights.pdvPnl || [];

  return (
    <>
      {cmpKpis.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {cmpKpis.map((k) => (
            <InsightKpiCard key={k.id} kpi={k} />
          ))}
        </div>
      ) : null}

      {insights.chart ? <WeeklyEvolutionChart chart={insights.chart} /> : null}

      {cmpRows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
          <table className="min-w-full text-[10px]">
            <thead className="bg-stone-50 text-stone-500 dark:bg-stone-900/60 dark:text-stone-400">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Métrica</th>
                <th className="px-2 py-1.5 text-right font-semibold">Actual</th>
                <th className="px-2 py-1.5 text-right font-semibold">Anterior</th>
                <th className="px-2 py-1.5 text-right font-semibold">Δ</th>
              </tr>
            </thead>
            <tbody>
              {cmpRows.map((r) => (
                <tr key={r.metric} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="px-2 py-1.5 text-stone-800 dark:text-stone-200">{r.metric}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.unit === 'pct'
                      ? (r.actual != null ? `${formatNumberEs(r.actual, { maxFraction: 1 })} %` : '—')
                      : `${formatMoneyEs(Number(r.actual || 0))} €`}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-stone-500">
                    {r.unit === 'pct'
                      ? (r.previous != null ? `${formatNumberEs(r.previous, { maxFraction: 1 })} %` : '—')
                      : `${formatMoneyEs(Number(r.previous || 0))} €`}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {r.deltaPp != null
                      ? `${r.deltaPp > 0 ? '+' : ''}${formatNumberEs(r.deltaPp, { maxFraction: 1 })} pp`
                      : `${r.deltaPct != null ? `${r.deltaPct > 0 ? '+' : ''}${formatNumberEs(r.deltaPct, { maxFraction: 1 })} %` : '—'}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {pdvRows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
          <p className="px-2 pt-2 text-[10px] font-bold text-stone-700 dark:text-stone-200">
            Margen operativo por tienda (estimado)
          </p>
          <table className="min-w-full text-[10px]">
            <thead className="bg-stone-50 text-stone-500 dark:bg-stone-900/60 dark:text-stone-400">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Tienda</th>
                <th className="px-2 py-1.5 text-right font-semibold">Ventas</th>
                <th className="px-2 py-1.5 text-right font-semibold">FC %</th>
                <th className="px-2 py-1.5 text-right font-semibold">Merma %</th>
                <th className="px-2 py-1.5 text-right font-semibold">Margen op.</th>
              </tr>
            </thead>
            <tbody>
              {pdvRows.slice(0, 8).map((p) => (
                <tr key={p.pdvId} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="px-2 py-1.5 text-stone-800 dark:text-stone-200">{p.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatMoneyEs(p.sales)} €</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.foodCostPct != null ? `${formatNumberEs(p.foodCostPct, { maxFraction: 1 })} %` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.wasteOnSalesPct != null ? `${formatNumberEs(p.wasteOnSalesPct, { maxFraction: 1 })} %` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {formatMoneyEs(p.operatingMargin)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
