import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  fetchDeliveryReportKpis,
  fetchDeliveryEvolucion,
  fetchDeliveryCanales,
  fetchDeliveryRendimiento,
  fetchDeliveryIncidencias,
  fetchDeliveryTopProductos,
  fetchDeliveryTiendas,
  type DeliveryReportFilters,
} from '../../lib/deliveryReportsApi';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Download, TrendingUp, Calendar, Filter, RefreshCw, BarChart2,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Store, Clock, Truck,
  ChevronRight, Package, Euro,
} from 'lucide-react';
import {
  DELIVERY_INFORMES_CATEGORIES,
  getDeliveryInformeEntry,
  isLiveInformeId,
  type DeliveryInformeCategoryId,
  type DeliveryInformeEntry,
  type DeliveryInformeId,
  type DeliveryInformeLiveId,
} from '../../verticals/delivery/informes/deliveryInformesCatalog';
import { DeliveryInformesCatalogView } from '../../verticals/delivery/informes/DeliveryInformesCatalogView';
import { DeliveryInformeRunner } from '../../verticals/delivery/informes/DeliveryInformeRunner';
import { VertialInformeProgress, downloadInforme, type InformeExportFormat } from '../../verticals/delivery/informes/VertialInformeProgress';

type DatePreset = 'hoy' | '7d' | 'mes' | '30d' | '90d' | 'custom';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: 'mes', label: 'Este mes' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '90 días' },
];

function formatEur(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function applyPreset(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const ms = (d: number) => new Date(now.getTime() - d * 86400000).toISOString().slice(0, 10);
  switch (preset) {
    case 'hoy': return { from: today, to: today };
    case '7d': return { from: ms(7), to: today };
    case 'mes': return { from: `${today.slice(0, 7)}-01`, to: today };
    case '30d': return { from: ms(30), to: today };
    case '90d': return { from: ms(90), to: today };
    default: return { from: ms(30), to: today };
  }
}

const tooltipStyle = {
  contentStyle: { background: '#1f2937', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' },
  itemStyle: { color: '#fff' },
};

function KPICard({ title, value, sub, icon, color, trend }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; color: string;
  trend?: { value: string; up: boolean };
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div className={`p-2 rounded-xl ${color}`}>{icon}</div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-[11px] font-bold ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-xl font-black text-gray-900 dark:text-gray-100 leading-tight">{value}</p>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{title}</p>
      {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
      {children}
    </div>
  );
}

export function DeliveryReports() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(authUser, currentBusiness);

  const [category, setCategory] = useState<DeliveryInformeCategoryId>('facturacion');
  const [openEntry, setOpenEntry] = useState<DeliveryInformeEntry | null>(null);

  const [preset, setPreset] = useState<DatePreset>('mes');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterPdv, setFilterPdv] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [kpis, setKpis] = useState<any>(null);
  const [evolucion, setEvolucion] = useState<any[]>([]);
  const [canales, setCanales] = useState<any>(null);
  const [rendimiento, setRendimiento] = useState<any>(null);
  const [incidencias, setIncidencias] = useState<any>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [tiendas, setTiendas] = useState<any[]>([]);

  const liveId: DeliveryInformeLiveId | null =
    openEntry && isLiveInformeId(openEntry.id) ? openEntry.id : null;

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
    return applyPreset(preset);
  }, [preset, customFrom, customTo]);

  const filters: DeliveryReportFilters = useMemo(() => ({
    ...dateRange,
    salesPointId: filterPdv || undefined,
    granularity: 'day',
  }), [dateRange, filterPdv]);

  const loadLiveReport = useCallback(async (reportId: DeliveryInformeLiveId, signal?: AbortSignal) => {
    if (!dataUserId) return;
    try {
      setLoading(true);
      if (reportId === 'resumen') {
        const [kpiRes, evolRes] = await Promise.all([
          fetchDeliveryReportKpis(dataUserId, filters, signal),
          fetchDeliveryEvolucion(dataUserId, filters, signal),
        ]);
        if (signal?.aborted) return;
        setKpis(kpiRes.kpis || null);
        setEvolucion(evolRes.series || []);
      } else if (reportId === 'canales') {
        const canRes = await fetchDeliveryCanales(dataUserId, filters, signal);
        if (signal?.aborted) return;
        setCanales(canRes);
      } else if (reportId === 'rendimiento') {
        const rendRes = await fetchDeliveryRendimiento(dataUserId, filters, signal);
        if (signal?.aborted) return;
        setRendimiento(rendRes);
      } else if (reportId === 'incidencias') {
        const incRes = await fetchDeliveryIncidencias(dataUserId, filters, signal);
        if (signal?.aborted) return;
        setIncidencias(incRes);
      } else if (reportId === 'productos') {
        const prodRes = await fetchDeliveryTopProductos(dataUserId, { ...filters, limit: 15 }, signal);
        if (signal?.aborted) return;
        setProductos(prodRes.products || []);
      } else if (reportId === 'tiendas') {
        const tiendasRes = await fetchDeliveryTiendas(dataUserId, filters, signal);
        if (signal?.aborted) return;
        setTiendas(tiendasRes.tiendas || []);
      }
      if (!signal?.aborted) setLastUpdate(new Date());
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('Error loading delivery report:', e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dataUserId, filters]);

  /** Solo carga al abrir un informe live o al cambiar filtros/periodo de ese informe. */
  useEffect(() => {
    if (!liveId) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    loadLiveReport(liveId, ctrl.signal);
    return () => ctrl.abort();
  }, [liveId, loadLiveReport]);

  /** Tiendas para el selector de filtro: solo si el usuario abre filtros en un live. */
  useEffect(() => {
    if (!liveId || !showFilters || !dataUserId || tiendas.length > 0) return;
    let cancelled = false;
    fetchDeliveryTiendas(dataUserId, filters).then((res) => {
      if (!cancelled) setTiendas(res.tiendas || []);
    }).catch(() => null);
    return () => { cancelled = true; };
  }, [liveId, showFilters, dataUserId, filters, tiendas.length]);

  const handleOpen = (entry: DeliveryInformeEntry) => {
    setOpenEntry(entry);
    if (entry.category) setCategory(entry.category);
  };

  const handleBackToCatalog = () => {
    abortRef.current?.abort();
    setOpenEntry(null);
    setLoading(false);
  };

  const liveExportRows = (): { rows: Record<string, unknown>[]; filename: string; title: string } | null => {
    if (!liveId) return null;
    const suffix = `${dateRange.from}_${dateRange.to}`;
    if (liveId === 'canales' && canales?.canales) {
      return {
        title: 'Canales de venta',
        filename: `Canales_Delivery_${suffix}`,
        rows: canales.canales.map((c: any) => ({
          Canal: c.label, Pedidos: c.pedidos, Ingresos: c.ingresos, Comision: c.comision, Margen: c.margenNeto,
        })),
      };
    }
    if (liveId === 'incidencias' && incidencias?.lista) {
      return {
        title: 'Incidencias',
        filename: `Incidencias_Delivery_${suffix}`,
        rows: incidencias.lista.map((i: any) => ({
          Pedido: i.orderNumber, Fecha: i.fecha, Estado: i.estado, Canal: i.canal, Motivo: i.motivo,
        })),
      };
    }
    if (liveId === 'productos') {
      return {
        title: 'Productos top',
        filename: `Productos_Delivery_${suffix}`,
        rows: productos.map((p) => ({
          Producto: p.nombre, Unidades: p.unidades, Ingresos: p.ingresos,
        })),
      };
    }
    if (liveId === 'tiendas') {
      return {
        title: 'Rendimiento por tienda',
        filename: `Tiendas_Delivery_${suffix}`,
        rows: tiendas.map((t) => ({
          Tienda: t.nombre, Pedidos: t.pedidos, Entregados: t.entregados, Ingresos: t.ingresos, Ticket: t.ticketMedio,
        })),
      };
    }
    if (kpis) {
      return {
        title: 'Resumen delivery',
        filename: `Resumen_Delivery_${suffix}`,
        rows: [
          { Concepto: 'Ventas periodo', Valor: kpis.ventasPeriodo?.total },
          { Concepto: 'Pedidos entregados', Valor: kpis.ventasPeriodo?.pedidos },
          { Concepto: 'Ticket medio', Valor: kpis.ventasPeriodo?.ticketMedio },
          { Concepto: 'Incidencias', Valor: kpis.incidencias?.total },
        ],
      };
    }
    return null;
  };

  const handleExport = async (format: InformeExportFormat) => {
    const payload = liveExportRows();
    if (!payload?.rows.length) return;
    await downloadInforme(format, payload.title, payload.rows, payload.filename, {
      summary: `Periodo ${dateRange.from} → ${dateRange.to}`,
      businessName: currentBusiness?.name,
    });
  };

  const openTitle = openEntry?.title
    || (openEntry ? getDeliveryInformeEntry(openEntry.id as DeliveryInformeId)?.title : null);

  return (
    <Layout
      backTo="/saas/delivery-ops"
      title="Informes"
      subtitle="Análisis avanzados, KPIs y comparativas por categoría."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => navigate('/saas/delivery-ops')} className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              Centro operativo
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            {openEntry ? (
              <>
                <button type="button" onClick={handleBackToCatalog} className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                  Informes
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{openTitle}</h2>
              </>
            ) : (
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Informes</h2>
            )}
          </div>

          {liveId && (
            <div className="flex items-center gap-2 flex-wrap">
              {lastUpdate && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button type="button" onClick={() => liveId && loadLiveReport(liveId)} disabled={loading} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Actualizar">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={() => void handleExport('csv')} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button type="button" onClick={() => void handleExport('xlsx')} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                Excel
              </button>
              <button type="button" onClick={() => void handleExport('pdf')} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                PDF
              </button>
            </div>
          )}
        </div>

        {!openEntry && (
          <DeliveryInformesCatalogView
            category={category}
            onCategoryChange={setCategory}
            onOpen={handleOpen}
            dataUserId={dataUserId}
          />
        )}

        {openEntry && openEntry.kind === 'skeleton' && (
          <DeliveryInformeRunner entry={openEntry} onBack={handleBackToCatalog} />
        )}

        {liveId && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleBackToCatalog}
              className="text-sm font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
            >
              ← Volver al catálogo
            </button>

            <div className="flex flex-wrap gap-2 items-center">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${preset === p.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
                >
                  {p.label}
                </button>
              ))}
              <button type="button" onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                <Filter className="w-3.5 h-3.5" /> Filtros
              </button>
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Desde</label>
                  <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPreset('custom'); }} className="mt-1 px-2 py-1.5 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Hasta</label>
                  <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPreset('custom'); }} className="mt-1 px-2 py-1.5 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Tienda / PDV</label>
                  <select value={filterPdv} onChange={(e) => setFilterPdv(e.target.value)} className="mt-1 px-2 py-1.5 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 min-w-[160px]">
                    <option value="">Todas</option>
                    {tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
              </div>
            )}

            {loading && (
              <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
                <VertialInformeProgress
                  progress={kpis || canales || rendimiento || incidencias || productos.length || tiendas.length ? 70 : 35}
                  label={`Generando «${openTitle || 'informe'}»…`}
                />
              </div>
            )}

            {!loading && liveId === 'resumen' && kpis && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KPICard title="Ventas periodo" value={formatEur(kpis.ventasPeriodo?.total || 0)} sub={`${kpis.ventasPeriodo?.pedidos || 0} entregados`} icon={<TrendingUp className="w-4 h-4 text-white" />} color="bg-emerald-500" trend={kpis.ventasPeriodo?.vsPrevPeriod != null ? { value: `${kpis.ventasPeriodo.vsPrevPeriod}%`, up: kpis.ventasPeriodo.vsPrevPeriod >= 0 } : undefined} />
                  <KPICard title="Ticket medio" value={formatEur(kpis.ventasPeriodo?.ticketMedio || 0)} icon={<BarChart2 className="w-4 h-4 text-white" />} color="bg-indigo-500" />
                  <KPICard title="Tiempo total medio" value={`${kpis.tiemposMedios?.total || 0} min`} sub={`Cocina ${kpis.tiemposMedios?.cocina || 0} · Montaje ${kpis.tiemposMedios?.montaje || 0}`} icon={<Clock className="w-4 h-4 text-white" />} color="bg-amber-500" />
                  <KPICard title="Incidencias" value={String(kpis.incidencias?.total || 0)} sub={`${kpis.incidencias?.cancelados || 0} cancelados`} icon={<AlertTriangle className="w-4 h-4 text-white" />} color="bg-red-500" trend={kpis.incidencias?.vsPrevPeriod != null ? { value: `${kpis.incidencias.vsPrevPeriod}%`, up: kpis.incidencias.vsPrevPeriod <= 0 } : undefined} />
                </div>
                <ChartCard title="Evolución ingresos y pedidos">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={evolucion}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                      <Tooltip {...tooltipStyle} />
                      <Legend />
                      <Line yAxisId="l" type="monotone" dataKey="ingresos" name="Ingresos €" stroke="#6366f1" strokeWidth={2} dot={false} />
                      <Line yAxisId="r" type="monotone" dataKey="entregados" name="Entregados" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}

            {!loading && liveId === 'canales' && canales && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <KPICard title="Ingresos totales" value={formatEur(canales.resumen?.ingresosTotal || 0)} icon={<TrendingUp className="w-4 h-4 text-white" />} color="bg-emerald-500" />
                  <KPICard title="Comisiones agregadores" value={formatEur(canales.resumen?.comisionesTotal || 0)} icon={<Euro className="w-4 h-4 text-white" />} color="bg-amber-500" />
                  <KPICard title="Canal más rentable" value={canales.resumen?.canalMasRentable || '—'} icon={<BarChart2 className="w-4 h-4 text-white" />} color="bg-indigo-500" />
                </div>
                <div className="grid lg:grid-cols-2 gap-4">
                  <ChartCard title="Distribución por canal">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={canales.canales || []} dataKey="ingresos" nameKey="label" cx="50%" cy="50%" outerRadius={90} label={(e) => e.label}>
                          {(canales.canales || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Ingresos por canal">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={canales.canales || []} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                        <Bar dataKey="ingresos" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs text-gray-500">
                      <tr>
                        <th className="p-3">Canal</th><th className="p-3">Pedidos</th><th className="p-3">Ingresos</th><th className="p-3">%</th><th className="p-3">Comisión</th><th className="p-3">Margen neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(canales.canales || []).map((c: any) => (
                        <tr key={c.canal} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="p-3 font-medium">{c.label}</td>
                          <td className="p-3">{c.pedidos}</td>
                          <td className="p-3">{formatEur(c.ingresos)}</td>
                          <td className="p-3">{c.pctVentas}%</td>
                          <td className="p-3">{formatEur(c.comision)}</td>
                          <td className="p-3">{formatEur(c.margenNeto)} ({c.margenPct}%)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && liveId === 'rendimiento' && rendimiento && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KPICard title="Cocina" value={`${rendimiento.medias?.cocina || 0} min`} icon={<Clock className="w-4 h-4 text-white" />} color="bg-orange-500" />
                  <KPICard title="Montaje" value={`${rendimiento.medias?.montaje || 0} min`} icon={<Package className="w-4 h-4 text-white" />} color="bg-indigo-500" />
                  <KPICard title="Reparto" value={`${rendimiento.medias?.reparto || 0} min`} icon={<Truck className="w-4 h-4 text-white" />} color="bg-cyan-500" />
                  <KPICard title="Total pedido" value={`${rendimiento.medias?.total || 0} min`} icon={<Calendar className="w-4 h-4 text-white" />} color="bg-emerald-500" />
                </div>
                <ChartCard title="Tiempos medios por canal (min)">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={rendimiento.canales || []}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip {...tooltipStyle} />
                      <Legend />
                      <Bar dataKey="cocinaMin" name="Cocina" fill="#f97316" />
                      <Bar dataKey="montajeMin" name="Montaje" fill="#6366f1" />
                      <Bar dataKey="repartoMin" name="Reparto" fill="#06b6d4" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                {(rendimiento.repartidores || []).length > 0 && (
                  <ChartCard title="Repartidores más rápidos">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={rendimiento.repartidores.slice(0, 8)} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="nombre" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="tiempoMedio" name="Minutos" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </div>
            )}

            {!loading && liveId === 'incidencias' && incidencias && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KPICard title="Total incidencias" value={String(incidencias.resumen?.total || 0)} icon={<AlertTriangle className="w-4 h-4 text-white" />} color="bg-red-500" />
                  <KPICard title="Tasa incidencia" value={`${incidencias.resumen?.tasaIncidenciaPct || 0}%`} icon={<BarChart2 className="w-4 h-4 text-white" />} color="bg-amber-500" />
                  <KPICard title="Importe afectado" value={formatEur(incidencias.resumen?.importePerdido || 0)} icon={<TrendingUp className="w-4 h-4 text-white" />} color="bg-gray-500" />
                  <KPICard title="Entregados OK" value={String(incidencias.entregados || 0)} icon={<TrendingUp className="w-4 h-4 text-white" />} color="bg-emerald-500" />
                </div>
                <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs text-gray-500">
                      <tr><th className="p-3">Pedido</th><th className="p-3">Fecha</th><th className="p-3">Estado</th><th className="p-3">Canal</th><th className="p-3">Motivo</th><th className="p-3">Importe</th></tr>
                    </thead>
                    <tbody>
                      {(incidencias.lista || []).map((i: any) => (
                        <tr key={i.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="p-3 font-mono text-xs">#{i.orderNumber}</td>
                          <td className="p-3 text-xs">{i.fecha?.slice(0, 16).replace('T', ' ')}</td>
                          <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">{i.estado}</span></td>
                          <td className="p-3">{i.canal}</td>
                          <td className="p-3 max-w-xs truncate">{i.motivo || '—'}</td>
                          <td className="p-3">{formatEur(i.importe || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && liveId === 'productos' && (
              <ChartCard title="Top productos (ingresos)">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={productos} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                    <Bar dataKey="ingresos" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {!loading && liveId === 'tiendas' && (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs text-gray-500">
                    <tr><th className="p-3">Tienda</th><th className="p-3">Pedidos</th><th className="p-3">Entregados</th><th className="p-3">Ingresos</th><th className="p-3">Ticket</th><th className="p-3">Incidencias</th></tr>
                  </thead>
                  <tbody>
                    {tiendas.map((t) => (
                      <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="p-3 font-medium">{t.nombre}</td>
                        <td className="p-3">{t.pedidos}</td>
                        <td className="p-3">{t.entregados}</td>
                        <td className="p-3">{formatEur(t.ingresos)}</td>
                        <td className="p-3">{formatEur(t.ticketMedio)}</td>
                        <td className="p-3">{t.incidencias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!openEntry && (
          <p className="text-[11px] text-stone-400 dark:text-stone-500">
            {DELIVERY_INFORMES_CATEGORIES.length} categorías · sin carga de datos hasta abrir un informe.
          </p>
        )}
      </div>
    </Layout>
  );
}
