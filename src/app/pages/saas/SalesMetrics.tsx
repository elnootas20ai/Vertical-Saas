import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  fetchSalesMetrics,
  type SalesMetricsData,
  type TimePoint,
} from '../../lib/salesMetricsApi';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Euro, ShoppingCart, Target, Activity,
  Calendar, RefreshCw, BarChart2, ArrowUpRight, ArrowDownRight,
  Package, Filter,
} from 'lucide-react';
import { format, subDays, subMonths, startOfMonth, startOfYear } from 'date-fns';
import { es } from 'date-fns/locale';

// ── Paleta ──

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

const STAGE_COLORS: Record<string, string> = {
  interested: '#3b82f6',
  reserved: '#f59e0b',
  documentation: '#8b5cf6',
  sold: '#10b981',
  delivered: '#06b6d4',
};

const STAGE_LABELS: Record<string, string> = {
  interested: 'Interesado',
  reserved: 'Reservado',
  documentation: 'Documentación',
  sold: 'Vendido',
  delivered: 'Entregado',
};

// ── Helpers ──

type DatePreset = '7d' | '30d' | 'month' | '90d' | '6m' | '1y' | 'ytd' | 'custom';
type ViewGranularity = 'day' | 'week' | 'month';

function formatEur(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES')} €`;
}

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const toStr = format(now, 'yyyy-MM-dd');

  switch (preset) {
    case '7d': return { from: format(subDays(now, 7), 'yyyy-MM-dd'), to: toStr };
    case '30d': return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to: toStr };
    case 'month': return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: toStr };
    case '90d': return { from: format(subDays(now, 90), 'yyyy-MM-dd'), to: toStr };
    case '6m': return { from: format(subMonths(now, 6), 'yyyy-MM-dd'), to: toStr };
    case '1y': return { from: format(subMonths(now, 12), 'yyyy-MM-dd'), to: toStr };
    case 'ytd': return { from: format(startOfYear(now), 'yyyy-MM-dd'), to: toStr };
    default: return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: toStr };
  }
}

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-400">0%</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {up ? '+' : ''}{value}%
    </span>
  );
}

function KPICard({
  title, value, sub, icon, color, trend,
}: {
  title: string; value: string; sub?: string;
  icon: React.ReactNode; color: string;
  trend?: number;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</span>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{value}</span>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
      {sub && <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span>}
    </div>
  );
}

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'month', label: 'Este mes' },
  { id: '90d', label: '90 días' },
  { id: '6m', label: '6 meses' },
  { id: '1y', label: '1 año' },
  { id: 'ytd', label: 'Año en curso' },
  { id: 'custom', label: 'Personalizado' },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: {formatEur(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Main Component ──

export function SalesMetrics() {
  const { t } = useTranslation();
  const { user: authUser } = useAuth();
  const userId = authUser?.user_id || '';

  const [metrics, setMetrics] = useState<SalesMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [granularity, setGranularity] = useState<ViewGranularity>('day');

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchSalesMetrics(userId, dateRange.from, dateRange.to);
      setMetrics(res.metrics);
    } catch (e: any) {
      setError(e.message || 'Error cargando métricas');
    } finally {
      setLoading(false);
    }
  }, [userId, dateRange]);

  useEffect(() => { load(); }, [load]);

  const timeSeriesData = useMemo(() => {
    if (!metrics) return [];
    switch (granularity) {
      case 'week': return metrics.weekly;
      case 'month': return metrics.monthly;
      default: return metrics.daily;
    }
  }, [metrics, granularity]);

  const timeSeriesLabel = useMemo(() => {
    switch (granularity) {
      case 'week': return 'week';
      case 'month': return 'month';
      default: return 'date';
    }
  }, [granularity]);

  const stageData = useMemo(() => {
    if (!metrics?.stageDistribution) return [];
    return Object.entries(metrics.stageDistribution).map(([stage, count]) => ({
      name: STAGE_LABELS[stage] || stage,
      value: count,
      fill: STAGE_COLORS[stage] || '#94a3b8',
    }));
  }, [metrics]);

  if (!userId) {
    return (
      <Layout title="Métricas de Ventas">
        <div className="flex items-center justify-center h-64 text-gray-500">Inicia sesión para ver las métricas</div>
      </Layout>
    );
  }

  return (
    <Layout title="Métricas de Ventas" subtitle="Panel de control de rendimiento comercial">
      <div className="flex flex-col gap-5">

        {/* ── Filtros ── */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              <Filter className="w-4 h-4" />
              Periodo
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    preset === p.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {preset === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <span className="text-xs text-gray-400">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                {(['day', 'week', 'month'] as ViewGranularity[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      granularity === g
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {{ day: 'Día', week: 'Semana', month: 'Mes' }[g]}
                  </button>
                ))}
              </div>

              <button
                onClick={load}
                disabled={loading}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && !metrics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 animate-pulse">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-3" />
                <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-28" />
              </div>
            ))}
          </div>
        )}

        {metrics && (
          <>
            {/* ── KPIs ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KPICard
                title="Ingresos"
                value={formatEur(metrics.summary.totalRevenue)}
                icon={<Euro className="w-4 h-4 text-emerald-600" />}
                color="bg-emerald-100 dark:bg-emerald-900/40"
                trend={metrics.comparison.change.revenue}
                sub={`vs periodo anterior: ${formatEur(metrics.comparison.previous.revenue)}`}
              />
              <KPICard
                title="Ventas"
                value={String(metrics.summary.totalSales)}
                icon={<ShoppingCart className="w-4 h-4 text-blue-600" />}
                color="bg-blue-100 dark:bg-blue-900/40"
                trend={metrics.comparison.change.count}
                sub={`vs anterior: ${metrics.comparison.previous.count}`}
              />
              <KPICard
                title="Margen"
                value={formatEur(metrics.summary.totalMargin)}
                icon={<TrendingUp className="w-4 h-4 text-violet-600" />}
                color="bg-violet-100 dark:bg-violet-900/40"
                trend={metrics.comparison.change.margin}
              />
              <KPICard
                title="Ticket medio"
                value={formatEur(metrics.summary.avgTicket)}
                icon={<Target className="w-4 h-4 text-amber-600" />}
                color="bg-amber-100 dark:bg-amber-900/40"
              />
              <KPICard
                title="Coste"
                value={formatEur(metrics.summary.totalCost)}
                icon={<Activity className="w-4 h-4 text-red-500" />}
                color="bg-red-100 dark:bg-red-900/40"
                trend={metrics.comparison.change.cost}
              />
            </div>

            {/* ── Gráfico de tendencia principal ── */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Evolución de ventas</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ingresos, coste y margen por {
                    { day: 'día', week: 'semana', month: 'mes' }[granularity]
                  }</p>
                </div>
                <BarChart2 className="w-5 h-5 text-gray-400" />
              </div>

              {timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey={timeSeriesLabel}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={(v: string) => {
                        if (granularity === 'month') {
                          const [y, m] = v.split('-');
                          const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                          return `${months[Number(m) - 1]} ${y.slice(2)}`;
                        }
                        if (v.length === 10) {
                          const parts = v.split('-');
                          return `${parts[2]}/${parts[1]}`;
                        }
                        return v;
                      }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => formatEur(v)} width={70} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={granularity === 'day' ? 16 : 32} />
                    <Bar dataKey="cost" name="Coste" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={granularity === 'day' ? 16 : 32} opacity={0.6} />
                    <Line dataKey="margin" name="Margen" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                  Sin datos para el periodo seleccionado
                </div>
              )}
            </div>

            {/* ── Tendencia 12 meses + Distribución por etapa ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Tendencia 12 meses */}
              <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tendencia últimos 12 meses</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Ingresos mensuales históricos</p>
                  </div>
                  <Calendar className="w-5 h-5 text-gray-400" />
                </div>

                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={metrics.trend}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={(v: string) => {
                        const [, m] = v.split('-');
                        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                        return months[Number(m) - 1] || v;
                      }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => formatEur(v)} width={70} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area dataKey="revenue" name="Ingresos" stroke="#3b82f6" fill="url(#revenueGrad)" strokeWidth={2} />
                    <Area dataKey="margin" name="Margen" stroke="#10b981" fill="url(#marginGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Pipeline / Etapas */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Pipeline de ventas</h3>

                {stageData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={stageData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {stageData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number, name: string) => [`${value} ventas`, name]} />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="flex flex-col gap-1.5 mt-3">
                      {stageData.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.fill }} />
                            <span className="text-gray-600 dark:text-gray-300">{s.name}</span>
                          </div>
                          <span className="font-semibold text-gray-900 dark:text-white">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Sin datos</div>
                )}
              </div>
            </div>

            {/* ── Top productos + Comparativa ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Top productos */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Productos más vendidos</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Top 10 por ingresos en el periodo</p>
                  </div>
                  <Package className="w-5 h-5 text-gray-400" />
                </div>

                {metrics.topProducts.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    {metrics.topProducts.map((p, i) => {
                      const maxRev = metrics.topProducts[0]?.revenue || 1;
                      const pct = Math.round((p.revenue / maxRev) * 100);
                      return (
                        <div key={i} className="group">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[60%]">
                              <span className="text-gray-400 mr-1.5">#{i + 1}</span>
                              {p.name}
                            </span>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-gray-500 dark:text-gray-400">{p.count} ud.</span>
                              <span className="font-semibold text-gray-900 dark:text-white">{formatEur(p.revenue)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Sin ventas en el periodo</div>
                )}
              </div>

              {/* Comparativa de periodos */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Comparativa de periodos</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Periodo actual vs anterior</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Ingresos', key: 'revenue' as const, color: '#3b82f6' },
                    { label: 'Coste', key: 'cost' as const, color: '#ef4444' },
                    { label: 'Margen', key: 'margin' as const, color: '#10b981' },
                    { label: 'Cantidad', key: 'count' as const, color: '#8b5cf6' },
                  ].map((item) => {
                    const cur = metrics.comparison.current[item.key];
                    const prev = metrics.comparison.previous[item.key];
                    const change = metrics.comparison.change[item.key];
                    const maxVal = Math.max(cur, prev, 1);

                    return (
                      <div key={item.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{item.label}</span>
                          <TrendBadge value={change} />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 w-12 shrink-0">Actual</span>
                            <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${(cur / maxVal) * 100}%`, background: item.color }}
                              />
                            </div>
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-20 text-right">
                              {item.key === 'count' ? cur : formatEur(cur)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 w-12 shrink-0">Anterior</span>
                            <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700 opacity-50"
                                style={{ width: `${(prev / maxVal) * 100}%`, background: item.color }}
                              />
                            </div>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-20 text-right">
                              {item.key === 'count' ? prev : formatEur(prev)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Gráfico de unidades vendidas ── */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Unidades vendidas</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Número de ventas cerradas por {
                    { day: 'día', week: 'semana', month: 'mes' }[granularity]
                  }</p>
                </div>
                <ShoppingCart className="w-5 h-5 text-gray-400" />
              </div>

              {timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey={timeSeriesLabel}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={(v: string) => {
                        if (v.length === 10) {
                          const parts = v.split('-');
                          return `${parts[2]}/${parts[1]}`;
                        }
                        return v;
                      }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} width={40} />
                    <Tooltip formatter={(value: number) => [`${value} ventas`, 'Cantidad']} />
                    <Bar dataKey="count" name="Ventas" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={granularity === 'day' ? 20 : 40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Sin datos</div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
