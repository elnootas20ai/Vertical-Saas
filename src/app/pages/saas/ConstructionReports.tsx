import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Area, AreaChart,
} from 'recharts';
import {
  Download, TrendingUp, TrendingDown, Users, Calendar, Euro, Filter, RefreshCw,
  BarChart2, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight, Wallet,
  HardHat, Building2, Percent, Activity, FileSpreadsheet, ChevronDown, ChevronUp,
  MapPin, CheckCircle2, XCircle, Eye, Bell, ShieldAlert, Zap, FileText,
} from 'lucide-react';
import { format, subMonths, subDays, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getConstructionReports, listConstructionClients, listConstructionProjects, listConstructionWorkers,
} from '../../lib/constructionApi';
import type {
  ConstructionReportsData, ConstructionReportsFilters, ReportObraDetail,
  ReportClienteDetail, ReportMonthlyData, ReportTrabajador, ReportAlerta,
  ConstructionClient, ConstructionProject, ConstructionWorker,
} from '../../lib/constructionApi';

type ReportTab = 'resumen' | 'obras' | 'clientes' | 'evolucion' | 'equipo' | 'alertas';
type DatePreset = '7d' | '30d' | '90d' | '6m' | '1y' | 'custom';
type SortDir = 'asc' | 'desc';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const MONTH_LABELS: Record<string, string> = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };

function formatEur(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

function KPICard({ title, value, sub, icon, color, trend }: {
  title: string; value: string; sub: string; icon: React.ReactNode; color: string;
  trend?: { value: string; up: boolean };
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${color}`}>{icon}</div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-bold ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5">{title}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
      {children}
    </div>
  );
}

const tooltipStyle = { contentStyle: { background: '#1f2937', border: 'none', borderRadius: 8, color: '#f9fafb', fontSize: 12 } };

const SEVERITY_STYLES: Record<string, { border: string; bg: string; icon: typeof AlertTriangle }> = {
  critical: { border: 'border-l-red-500', bg: 'bg-red-50 dark:bg-red-900/10', icon: XCircle },
  warning: { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/10', icon: AlertTriangle },
};

const ALERT_TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  obra_poco_rentable: TrendingDown,
  exceso_horas: Clock,
  demasiadas_incidencias: ShieldAlert,
  cobro_retrasado: Wallet,
  pago_no_justificado: Euro,
  desviacion_temporal: Activity,
};

export function ConstructionReports() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.user_id || user?.id || '';
  const isWorker = (user as Record<string, unknown>)?.role === 'worker' || (user as Record<string, unknown>)?.rol === 'trabajador';

  const [tab, setTab] = useState<ReportTab>('resumen');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConstructionReportsData | null>(null);

  const [datePreset, setDatePreset] = useState<DatePreset>('6m');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterObra, setFilterObra] = useState('');
  const [filterTrabajador, setFilterTrabajador] = useState('');

  const [clients, setClients] = useState<ConstructionClient[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);

  const [obraSortKey, setObraSortKey] = useState<keyof ReportObraDetail>('presupuesto');
  const [obraSortDir, setObraSortDir] = useState<SortDir>('desc');
  const [expandedObra, setExpandedObra] = useState<string | null>(null);

  const [alertFilterType, setAlertFilterType] = useState('todos');
  const [alertFilterSeverity, setAlertFilterSeverity] = useState('todos');

  const dateRange = useMemo(() => {
    const today = new Date();
    let desde: Date;
    switch (datePreset) {
      case '7d': desde = subDays(today, 7); break;
      case '30d': desde = subDays(today, 30); break;
      case '90d': desde = subDays(today, 90); break;
      case '6m': desde = subMonths(today, 6); break;
      case '1y': desde = subMonths(today, 12); break;
      case 'custom': return { desde: customFrom, hasta: customTo };
      default: desde = subMonths(today, 6);
    }
    return { desde: format(desde, 'yyyy-MM-dd'), hasta: format(today, 'yyyy-MM-dd') };
  }, [datePreset, customFrom, customTo]);

  const loadCatalogs = useCallback(async () => {
    if (!userId) return;
    try {
      const [c, p, w] = await Promise.all([
        listConstructionClients(userId), listConstructionProjects(userId), listConstructionWorkers(userId),
      ]);
      setClients(c); setProjects(p); setWorkers(w);
    } catch { /* ignore */ }
  }, [userId]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const filters: ConstructionReportsFilters = { ...dateRange };
      if (filterCliente) filters.clienteId = filterCliente;
      if (filterObra) filters.obraId = filterObra;
      if (filterTrabajador) filters.trabajadorId = filterTrabajador;
      const result = await getConstructionReports(userId, filters);
      setData(result);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId, dateRange, filterCliente, filterObra, filterTrabajador]);

  useEffect(() => { loadCatalogs(); }, [loadCatalogs]);
  useEffect(() => { loadData(); }, [loadData]);

  const clearFilters = () => {
    setDatePreset('6m'); setCustomFrom(''); setCustomTo('');
    setFilterCliente(''); setFilterObra(''); setFilterTrabajador('');
  };

  const filteredProjects = useMemo(() => {
    if (!filterCliente) return projects;
    return projects.filter(p => p.clienteId === filterCliente);
  }, [projects, filterCliente]);

  const sortedObras = useMemo(() => {
    if (!data) return [];
    const list = [...data.obraDetails];
    list.sort((a, b) => {
      const va = a[obraSortKey] ?? 0;
      const vb = b[obraSortKey] ?? 0;
      if (typeof va === 'number' && typeof vb === 'number') return obraSortDir === 'asc' ? va - vb : vb - va;
      return obraSortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [data, obraSortKey, obraSortDir]);

  const toggleObraSort = (key: keyof ReportObraDetail) => {
    if (obraSortKey === key) setObraSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setObraSortKey(key); setObraSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: keyof ReportObraDetail }) => {
    if (obraSortKey !== col) return null;
    return obraSortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const filteredAlerts = useMemo(() => {
    if (!data) return [];
    return data.alertas.filter(a => {
      if (alertFilterType !== 'todos' && a.tipo !== alertFilterType) return false;
      if (alertFilterSeverity !== 'todos' && a.severidad !== alertFilterSeverity) return false;
      return true;
    });
  }, [data, alertFilterType, alertFilterSeverity]);

  const exportCsv = useCallback(() => {
    if (!data) return;
    let csv = '';
    if (tab === 'obras') {
      csv = 'Obra,Cliente,Estado,Progreso,Presupuesto,Cobrado,Pendiente,Margen %,Horas,Incidencias,Desviación\n';
      for (const o of data.obraDetails) {
        csv += `"${o.obraNombre}","${o.clienteNombre}","${o.estado}",${o.progreso},${o.presupuesto},${o.cobrado},${o.pendienteCobro},${o.margenPorcentaje},${o.horasImputadas},${o.incidencias},${o.desviacion}\n`;
      }
    } else if (tab === 'clientes') {
      csv = 'Cliente,Obras,Presupuestado,Cobrado,Pendiente,Margen medio\n';
      for (const c of data.clienteDetails) {
        csv += `"${c.clienteNombre}",${c.numObras},${c.totalPresupuestado},${c.totalCobrado},${c.pendienteCobro},${c.margenMedio}\n`;
      }
    } else if (tab === 'equipo') {
      csv = 'Trabajador,Gremio,Obra,Horas,Tareas completadas,Tareas pendientes,Incidencias\n';
      for (const t of data.trabajadores) {
        csv += `"${t.nombre}","${t.gremio}","${t.obraNombre}",${t.horasImputadas},${t.tareasCompletadas},${t.tareasPendientes},${t.incidencias}\n`;
      }
    } else {
      csv = 'Mes,Presupuestado,Cobrado,Horas,Incidencias\n';
      for (const m of data.seriesMensual) {
        csv += `${m.mes},${m.presupuestado},${m.cobrado},${m.horasImputadas},${m.incidencias}\n`;
      }
    }
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `informe-construccion-${tab}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [data, tab]);

  const r = data?.resumen;
  const selectClass = 'px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400';

  const tabs: { id: ReportTab; label: string; icon: typeof BarChart2; hidden?: boolean }[] = [
    { id: 'resumen', label: 'Resumen', icon: BarChart2 },
    { id: 'obras', label: 'Obras', icon: HardHat },
    { id: 'clientes', label: 'Clientes', icon: Building2, hidden: isWorker },
    { id: 'evolucion', label: 'Evolución', icon: TrendingUp },
    { id: 'equipo', label: 'Equipo', icon: Users },
    { id: 'alertas', label: 'Alertas', icon: Bell, hidden: isWorker },
  ];

  if (loading && !data) {
    return (
      <Layout title="Informes y Rentabilidad">
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando informes…
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Informes y Rentabilidad">
      <div className="space-y-6">
        {/* ─── Filtros ─────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <Filter className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
            </div>

            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-0.5">
              {(['7d', '30d', '90d', '6m', '1y'] as DatePreset[]).map(p => (
                <button key={p} onClick={() => setDatePreset(p)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${datePreset === p ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                  {p}
                </button>
              ))}
              <button onClick={() => setDatePreset('custom')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${datePreset === 'custom' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                <Calendar className="w-3.5 h-3.5" />
              </button>
            </div>

            {datePreset === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={selectClass} />
                <span className="text-xs text-gray-400">—</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={selectClass} />
              </>
            )}

            <select value={filterCliente} onChange={e => { setFilterCliente(e.target.value); setFilterObra(''); }} className={selectClass}>
              <option value="">Todos los clientes</option>
              {clients.map(c => <option key={c._id} value={c._id}>{c.nombre}</option>)}
            </select>

            <select value={filterObra} onChange={e => setFilterObra(e.target.value)} className={selectClass}>
              <option value="">Todas las obras</option>
              {filteredProjects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
            </select>

            {!isWorker && (
              <select value={filterTrabajador} onChange={e => setFilterTrabajador(e.target.value)} className={selectClass}>
                <option value="">Todos los trabajadores</option>
                {workers.filter(w => w.activo).map(w => <option key={w._id} value={w._id}>{w.nombre}</option>)}
              </select>
            )}

            <button onClick={clearFilters} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Limpiar filtros">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>

            <div className="ml-auto flex gap-2">
              <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>
        </div>

        {/* ─── Tabs ────────────────────────────────────────────────── */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {tabs.filter(t => !t.hidden).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
              {t.id === 'alertas' && data && data.alertas.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">{data.alertas.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB: RESUMEN                                               */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'resumen' && r && (
          <div className="space-y-6">
            <div className={`grid gap-4 ${isWorker ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'}`}>
              <KPICard title="Obras activas" value={String(r.obrasActivas)} sub="en curso actualmente"
                icon={<HardHat className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
              {!isWorker && (
                <KPICard title="Total presupuestado" value={formatEur(r.totalPresupuestado)} sub="presupuestos aceptados"
                  icon={<Euro className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
              )}
              {!isWorker && (
                <KPICard title="Cobros pendientes" value={formatEur(r.cobrosPendientes)} sub="por cobrar a clientes"
                  icon={<Wallet className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
              )}
              {!isWorker && (
                <KPICard title="Margen global" value={`${r.margenGlobal}%`} sub="margen medio ponderado"
                  icon={<Percent className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30"
                  trend={{ value: `${r.margenGlobal > 10 ? '+' : ''}${r.margenGlobal}%`, up: r.margenGlobal > 10 }} />
              )}
              <KPICard title="Horas imputadas" value={`${r.horasImputadas}h`} sub="en el periodo seleccionado"
                icon={<Clock className="w-4 h-4 text-slate-600" />} color="bg-slate-100 dark:bg-slate-800/80" />
              <KPICard title="Incidencias" value={String(r.incidenciasAbiertas)} sub="abiertas actualmente"
                icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
            </div>

            {!isWorker && data && data.seriesMensual.length > 0 && (
              <ChartCard title="Presupuestado vs Cobrado — Últimos meses">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.seriesMensual.map(m => ({ ...m, label: MONTH_LABELS[m.mes.slice(5)] || m.mes }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => formatEur(v)} tick={{ fontSize: 11 }} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                    <Legend />
                    <Bar dataKey="presupuestado" name="Presupuestado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cobrado" name="Cobrado" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="margen" name="Margen %" stroke="#f59e0b" strokeWidth={2} dot={false} yAxisId={0} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {!isWorker && data && data.alertas.length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Bell className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Alertas destacadas</h3>
                  <span className="ml-auto text-xs text-gray-400">{data.alertas.length} alertas</span>
                </div>
                <div className="space-y-2">
                  {data.alertas.slice(0, 5).map(a => {
                    const style = SEVERITY_STYLES[a.severidad] || SEVERITY_STYLES.warning;
                    const Icon = ALERT_TYPE_ICONS[a.tipo] || AlertTriangle;
                    return (
                      <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl border-l-4 ${style.border} ${style.bg}`}>
                        <Icon className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.titulo}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{a.detalle}</p>
                        </div>
                        {a.obraId && (
                          <button onClick={() => navigate(`/saas/construction-projects`)} className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
                            Ver obra
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {data.alertas.length > 5 && (
                  <button onClick={() => setTab('alertas')} className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700">
                    Ver todas las alertas ({data.alertas.length})
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB: OBRAS                                                 */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'obras' && data && (
          <div className="space-y-4">
            {data.obraDetails.length > 0 && !isWorker && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.obraDetails.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Total obras</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{formatEur(data.obraDetails.reduce((s, o) => s + o.cobrado, 0))}</p>
                  <p className="text-xs text-gray-500 mt-1">Total cobrado</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{formatEur(data.obraDetails.reduce((s, o) => s + o.pendienteCobro, 0))}</p>
                  <p className="text-xs text-gray-500 mt-1">Pendiente cobro</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{data.obraDetails.reduce((s, o) => s + o.horasImputadas, 0)}h</p>
                  <p className="text-xs text-gray-500 mt-1">Horas totales</p>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    {[
                      { key: 'obraNombre' as const, label: 'Obra' },
                      { key: 'clienteNombre' as const, label: 'Cliente' },
                      { key: 'estado' as const, label: 'Estado' },
                      { key: 'progreso' as const, label: 'Progreso' },
                      ...(!isWorker ? [
                        { key: 'presupuesto' as const, label: 'Presupuesto' },
                        { key: 'cobrado' as const, label: 'Cobrado' },
                        { key: 'pendienteCobro' as const, label: 'Pendiente' },
                        { key: 'margenPorcentaje' as const, label: 'Margen' },
                      ] : []),
                      { key: 'horasImputadas' as const, label: 'Horas' },
                      { key: 'incidencias' as const, label: 'Incid.' },
                      { key: 'desviacion' as const, label: 'Desv.' },
                    ].map(col => (
                      <th key={col.key} className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                        onClick={() => toggleObraSort(col.key)}>
                        <span className="flex items-center gap-1">{col.label} <SortIcon col={col.key} /></span>
                      </th>
                    ))}
                    <th className="px-3 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedObras.map(o => {
                    const estadoColors: Record<string, string> = {
                      'planificación': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      'en_obra': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                      'pausada': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                      'finalizada': 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                    };
                    const isNegativeMargin = o.margenPorcentaje < 0;
                    return (
                      <tr key={o.obraId} className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${isNegativeMargin && !isWorker ? 'bg-red-50/50 dark:bg-red-900/5' : ''}`}>
                        <td className="px-3 py-3">
                          <button onClick={() => navigate('/saas/construction-projects')} className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 text-left">
                            {o.obraNombre}
                          </button>
                          <p className="text-xs text-gray-400">{o.tipoObra} · {o.ubicacion}</p>
                        </td>
                        <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{o.clienteNombre}</td>
                        <td className="px-3 py-3"><span className={`px-2 py-1 rounded-lg text-xs font-semibold ${estadoColors[o.estado] || ''}`}>{o.estado}</span></td>
                        <td className="px-3 py-3 min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${o.progreso === 100 ? 'bg-green-500' : o.progreso > 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${o.progreso}%` }} />
                            </div>
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 w-8 text-right">{o.progreso}%</span>
                          </div>
                        </td>
                        {!isWorker && <td className="px-3 py-3 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatEur(o.presupuesto)}</td>}
                        {!isWorker && <td className="px-3 py-3 font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{formatEur(o.cobrado)}</td>}
                        {!isWorker && <td className="px-3 py-3 text-red-600 dark:text-red-400 whitespace-nowrap">{formatEur(o.pendienteCobro)}</td>}
                        {!isWorker && (
                          <td className="px-3 py-3">
                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${o.margenPorcentaje >= 10 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : o.margenPorcentaje >= 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                              {o.margenPorcentaje}%
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{o.horasImputadas}h</td>
                        <td className="px-3 py-3">
                          <span className={`${o.incidencias > 3 ? 'text-red-600 font-bold' : 'text-gray-600 dark:text-gray-300'}`}>{o.incidencias}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-bold ${o.desviacion < -15 ? 'text-red-600' : o.desviacion < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {o.desviacion > 0 ? '+' : ''}{o.desviacion}%
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => setExpandedObra(expandedObra === o.obraId ? null : o.obraId)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                            <Eye className="w-4 h-4 text-gray-400" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedObras.length === 0 && (
                    <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">No se encontraron obras</td></tr>
                  )}
                </tbody>
                {!isWorker && sortedObras.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 font-bold">
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-200">TOTAL</td>
                      <td colSpan={3}></td>
                      <td className="px-3 py-3 text-gray-900 dark:text-gray-100">{formatEur(sortedObras.reduce((s, o) => s + o.presupuesto, 0))}</td>
                      <td className="px-3 py-3 text-emerald-700 dark:text-emerald-400">{formatEur(sortedObras.reduce((s, o) => s + o.cobrado, 0))}</td>
                      <td className="px-3 py-3 text-red-600">{formatEur(sortedObras.reduce((s, o) => s + o.pendienteCobro, 0))}</td>
                      <td className="px-3 py-3">{r ? `${r.margenGlobal}%` : ''}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{sortedObras.reduce((s, o) => s + o.horasImputadas, 0)}h</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{sortedObras.reduce((s, o) => s + o.incidencias, 0)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {expandedObra && (() => {
              const obra = data.obraDetails.find(o => o.obraId === expandedObra);
              if (!obra) return null;
              return (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Detalle: {obra.obraNombre}</h3>
                    <button onClick={() => setExpandedObra(null)} className="text-xs text-gray-400 hover:text-gray-600">Cerrar</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-gray-500 text-xs">Materiales</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatEur(obra.costeMateriales)}</p></div>
                    <div><p className="text-gray-500 text-xs">Mano de obra</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatEur(obra.costeManoObra)}</p></div>
                    <div><p className="text-gray-500 text-xs">Estructural</p><p className="font-bold text-gray-900 dark:text-gray-100">{formatEur(obra.costeEstructural)}</p></div>
                    <div><p className="text-gray-500 text-xs">Margen absoluto</p><p className={`font-bold ${obra.margenAbsoluto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatEur(obra.margenAbsoluto)}</p></div>
                    <div><p className="text-gray-500 text-xs">Trabajadores</p><p className="font-bold text-gray-900 dark:text-gray-100">{obra.trabajadoresAsignados}</p></div>
                    <div><p className="text-gray-500 text-xs">Tareas completadas</p><p className="font-bold text-gray-900 dark:text-gray-100">{obra.tareasCompletadas} / {obra.tareasTotal}</p></div>
                    <div><p className="text-gray-500 text-xs">Inicio</p><p className="font-bold text-gray-900 dark:text-gray-100">{obra.fechaInicio || '—'}</p></div>
                    <div><p className="text-gray-500 text-xs">Fin prevista</p><p className="font-bold text-gray-900 dark:text-gray-100">{obra.fechaFinPrevista || '—'}</p></div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB: CLIENTES                                              */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'clientes' && data && !isWorker && (
          <div className="space-y-6">
            {data.clienteDetails.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Facturación por cliente">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={data.clienteDetails.filter(c => c.totalPresupuestado > 0)} dataKey="totalPresupuestado" nameKey="clienteNombre" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: { name: string; percent: number }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                        {data.clienteDetails.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Cobrado vs Pendiente por cliente">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.clienteDetails.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tickFormatter={(v: number) => formatEur(v)} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="clienteNombre" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Legend />
                      <Bar dataKey="totalCobrado" name="Cobrado" fill="#10b981" stackId="a" />
                      <Bar dataKey="pendienteCobro" name="Pendiente" fill="#ef4444" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    {['Cliente', 'Obras', 'Activas', 'Presupuestado', 'Cobrado', 'Pendiente', 'Margen medio', 'Más rentable', 'Menos rentable'].map(h => (
                      <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.clienteDetails.map(c => (
                    <tr key={c.clienteId} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => navigate('/saas/construction-clients')} className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600">
                          {c.clienteNombre}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.numObras}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.obrasActivas}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{formatEur(c.totalPresupuestado)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">{formatEur(c.totalCobrado)}</td>
                      <td className="px-4 py-3 text-red-600 dark:text-red-400">{formatEur(c.pendienteCobro)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${c.margenMedio >= 10 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : c.margenMedio >= 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {c.margenMedio}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-emerald-600 font-medium">{c.obraMasRentable || '—'}</td>
                      <td className="px-4 py-3 text-xs text-red-500 font-medium">{c.obraMenosRentable || '—'}</td>
                    </tr>
                  ))}
                  {data.clienteDetails.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No se encontraron datos de clientes</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB: EVOLUCIÓN                                             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'evolucion' && data && (
          <div className="space-y-6">
            {data.seriesMensual.length > 0 ? (
              <>
                {!isWorker && (
                  <ChartCard title="Presupuestado vs Cobrado vs Pagado — Evolución mensual">
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={data.seriesMensual.map(m => ({ ...m, label: MONTH_LABELS[m.mes.slice(5)] || m.mes }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(v: number) => formatEur(v)} tick={{ fontSize: 11 }} />
                        <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [formatEur(v as number), name]} />
                        <Legend />
                        <Bar dataKey="presupuestado" name="Presupuestado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="cobrado" name="Cobrado" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="margen" name="Margen %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Horas imputadas por mes">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={data.seriesMensual.map(m => ({ ...m, label: MONTH_LABELS[m.mes.slice(5)] || m.mes }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="horasImputadas" name="Horas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Incidencias por mes">
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={data.seriesMensual.map(m => ({ ...m, label: MONTH_LABELS[m.mes.slice(5)] || m.mes }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip {...tooltipStyle} />
                        <Area type="monotone" dataKey="incidencias" name="Incidencias" stroke="#ef4444" fill="#fecaca" fillOpacity={0.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {!isWorker && (
                  <ChartCard title="Evolución del margen (%)">
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={data.seriesMensual.map(m => ({ ...m, label: MONTH_LABELS[m.mes.slice(5)] || m.mes }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 'auto']} tick={{ fontSize: 11 }} />
                        <Tooltip {...tooltipStyle} formatter={(v: number) => `${v}%`} />
                        <Area type="monotone" dataKey="margen" name="Margen %" stroke="#10b981" fill="#d1fae5" fillOpacity={0.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </>
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                <BarChart2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Sin datos suficientes</p>
                <p className="text-sm text-gray-400 mt-1">Se necesitan datos de al menos un mes para mostrar evolución</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB: EQUIPO                                                */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'equipo' && data && (
          <div className="space-y-6">
            {(() => {
              const trabData = isWorker
                ? data.trabajadores.filter(t => t._id === userId || t.nombre.toLowerCase().includes((user?.fullName || '').toLowerCase()))
                : data.trabajadores;

              const totalHoras = trabData.reduce((s, t) => s + t.horasImputadas, 0);
              const totalCompletadas = trabData.reduce((s, t) => s + t.tareasCompletadas, 0);
              const totalPendientes = trabData.reduce((s, t) => s + t.tareasPendientes, 0);

              return (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KPICard title="Trabajadores activos" value={String(trabData.length)} sub="en el periodo"
                      icon={<Users className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
                    <KPICard title="Horas totales" value={`${totalHoras}h`} sub={trabData.length > 0 ? `${Math.round(totalHoras / trabData.length)}h/trabajador` : ''}
                      icon={<Clock className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
                    <KPICard title="Tareas completadas" value={String(totalCompletadas)} sub={`de ${totalCompletadas + totalPendientes} asignadas`}
                      icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                    <KPICard title="Tareas pendientes" value={String(totalPendientes)} sub="por completar"
                      icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
                  </div>

                  {!isWorker && trabData.length > 0 && (
                    <ChartCard title="Top trabajadores por horas imputadas">
                      <ResponsiveContainer width="100%" height={Math.max(200, trabData.length * 40)}>
                        <BarChart data={[...trabData].sort((a, b) => b.horasImputadas - a.horasImputadas).slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="nombre" type="category" width={140} tick={{ fontSize: 11 }} />
                          <Tooltip {...tooltipStyle} />
                          <Bar dataKey="horasImputadas" name="Horas" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <table className="w-full min-w-[800px] text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                          {['Trabajador', 'Gremio', 'Obra asignada', 'Horas', 'Completadas', 'Pendientes', 'Incidencias'].map(h => (
                            <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trabData.map(t => (
                          <tr key={t._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-4 py-3">
                              <button onClick={() => navigate('/saas/construction-workers')} className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600">
                                {t.nombre}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{t.gremio}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.obraNombre || '—'}</td>
                            <td className="px-4 py-3 font-semibold text-purple-700 dark:text-purple-400">{t.horasImputadas}h</td>
                            <td className="px-4 py-3 text-emerald-600 font-semibold">{t.tareasCompletadas}</td>
                            <td className="px-4 py-3 text-amber-600 font-semibold">{t.tareasPendientes}</td>
                            <td className="px-4 py-3">
                              <span className={`${t.incidencias > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>{t.incidencias}</span>
                            </td>
                          </tr>
                        ))}
                        {trabData.length === 0 && (
                          <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No se encontraron trabajadores</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB: ALERTAS                                               */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {tab === 'alertas' && data && !isWorker && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <select value={alertFilterType} onChange={e => setAlertFilterType(e.target.value)} className={selectClass}>
                <option value="todos">Todos los tipos</option>
                <option value="obra_poco_rentable">Obra poco rentable</option>
                <option value="exceso_horas">Exceso de horas</option>
                <option value="demasiadas_incidencias">Demasiadas incidencias</option>
                <option value="cobro_retrasado">Cobro retrasado</option>
                <option value="desviacion_temporal">Desviación temporal</option>
              </select>
              <select value={alertFilterSeverity} onChange={e => setAlertFilterSeverity(e.target.value)} className={selectClass}>
                <option value="todos">Todas las severidades</option>
                <option value="critical">Crítico</option>
                <option value="warning">Aviso</option>
              </select>
              <span className="text-sm text-gray-500 ml-auto">
                {filteredAlerts.length} alerta{filteredAlerts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {filteredAlerts.length > 0 ? (
              <div className="space-y-3">
                {filteredAlerts.map(a => {
                  const style = SEVERITY_STYLES[a.severidad] || SEVERITY_STYLES.warning;
                  const TypeIcon = ALERT_TYPE_ICONS[a.tipo] || AlertTriangle;
                  return (
                    <div key={a.id} className={`flex items-start gap-4 p-4 rounded-2xl border-l-4 ${style.border} ${style.bg} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700`}>
                      <div className={`p-2 rounded-xl ${a.severidad === 'critical' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                        <TypeIcon className={`w-5 h-5 ${a.severidad === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{a.titulo}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${a.severidad === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {a.severidad === 'critical' ? 'Crítico' : 'Aviso'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{a.detalle}</p>
                        {a.obraNombre && <p className="text-xs text-gray-400 mt-1">Obra: {a.obraNombre}</p>}
                      </div>
                      {a.obraId && (
                        <button onClick={() => navigate('/saas/construction-projects')}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors whitespace-nowrap">
                          <Eye className="w-3.5 h-3.5" /> Ver obra
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Sin alertas</p>
                <p className="text-sm text-gray-400 mt-1">No se han detectado problemas en el periodo seleccionado</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
