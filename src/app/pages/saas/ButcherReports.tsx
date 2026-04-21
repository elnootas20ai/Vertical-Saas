import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Area,
  AreaChart, ReferenceLine,
} from 'recharts';
import {
  Download, TrendingUp, TrendingDown, Users, Calendar, Euro, Filter,
  RefreshCw, BarChart2, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Wallet, Package, Layers, ChevronRight, ChevronDown, Percent, Beef,
  ShoppingCart, Trash2, Store, Shield, Activity, X, FileSpreadsheet,
  FileText, BarChart3,
} from 'lucide-react';
import {
  fetchButcherKpis, fetchButcherVentasTrabajador, fetchButcherTopProductos,
  fetchButcherEvolucion, fetchButcherCategorias, fetchButcherTiendas,
  type ButcherFilters,
} from '../../lib/butcherReportsApi';

// ─── Types ──────────────────────────────────────────────────────────────────

type ReportTab = 'resumen' | 'ventas' | 'trabajadores' | 'categorias' | 'tiendas' | 'merma' | 'compras' | 'margenes';
type DatePreset = 'hoy' | 'ayer' | '7d' | 'mes' | 'mesAnt' | '30d' | '90d' | 'anio' | 'custom';
type UserRole = 'gerente' | 'trabajador';

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = ['#dc2626', '#f59e0b', '#eab308', '#84cc16', '#8b5cf6', '#6b7280', '#3b82f6', '#10b981'];
const CAT_COLORS: Record<string, string> = { vacuno: '#dc2626', cerdo: '#f59e0b', pollo: '#eab308', cordero: '#84cc16', elaborados: '#8b5cf6', otros: '#6b7280' };
const CAT_LABELS: Record<string, string> = { vacuno: 'Vacuno', cerdo: 'Cerdo', pollo: 'Pollo', cordero: 'Cordero', elaborados: 'Elaborados', otros: 'Otros' };

const TABS_GERENTE: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
  { id: 'resumen', label: 'Resumen', icon: <Layers className="w-4 h-4" /> },
  { id: 'ventas', label: 'Ventas', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'trabajadores', label: 'Trabajadores', icon: <Users className="w-4 h-4" /> },
  { id: 'categorias', label: 'Categorías', icon: <Beef className="w-4 h-4" /> },
  { id: 'tiendas', label: 'Tiendas', icon: <Store className="w-4 h-4" /> },
  { id: 'merma', label: 'Merma', icon: <Trash2 className="w-4 h-4" /> },
  { id: 'compras', label: 'Compras', icon: <ShoppingCart className="w-4 h-4" /> },
  { id: 'margenes', label: 'Márgenes', icon: <BarChart2 className="w-4 h-4" /> },
];

const TABS_WORKER: ReportTab[] = ['resumen', 'ventas', 'categorias'];

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'hoy', label: 'Hoy' }, { id: 'ayer', label: 'Ayer' }, { id: '7d', label: '7 días' },
  { id: 'mes', label: 'Este mes' }, { id: 'mesAnt', label: 'Mes ant.' }, { id: '30d', label: '30 días' },
  { id: '90d', label: '90 días' }, { id: 'anio', label: 'Este año' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatEur(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function applyPreset(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const ms = (d: number) => new Date(now.getTime() - d * 86400000).toISOString().slice(0, 10);
  switch (preset) {
    case 'hoy': return { from: today, to: today };
    case 'ayer': { const y = ms(1); return { from: y, to: y }; }
    case '7d': return { from: ms(7), to: today };
    case 'mes': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'mesAnt': { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { from: d.toISOString().slice(0, 10), to: e.toISOString().slice(0, 10) }; }
    case '30d': return { from: ms(30), to: today };
    case '90d': return { from: ms(90), to: today };
    case 'anio': return { from: `${now.getFullYear()}-01-01`, to: today };
    default: return { from: ms(30), to: today };
  }
}

const tooltipStyle = { contentStyle: { background: '#1f2937', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' }, itemStyle: { color: '#fff' } };

// ─── Sub-components ─────────────────────────────────────────────────────────

function KPICard({ title, value, sub, icon, color, trend, onClick }: {
  title: string; value: string; sub: string; icon: React.ReactNode; color: string;
  trend?: { value: string; up: boolean }; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className={`w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
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
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
    </button>
  );
}

function ChartCard({ title, children, period }: { title: string; children: React.ReactNode; period?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        {period && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-[10px] font-semibold text-gray-500 dark:text-gray-400">{period}</span>}
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{children}</h3>;
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-2xl" />)}
      </div>
      <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-60 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        <div className="h-60 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
    </div>
  );
}

// ─── Export Helpers ──────────────────────────────────────────────────────────

async function exportToCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const bom = '\uFEFF';
  const csv = bom + [keys.join(';'), ...rows.map(r => keys.map(k => String(r[k] ?? '')).join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  try {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Informe');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } catch { exportToCsv(rows, filename); }
}

async function exportToPdf(title: string, rows: string[][], headers: string[]) {
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(title, 14, 20);
    doc.setFontSize(8); doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, 14, 28);
    let y = 36;
    doc.setFontSize(7);
    const colW = (doc.internal.pageSize.getWidth() - 28) / headers.length;
    headers.forEach((h, i) => doc.text(h, 14 + i * colW, y));
    y += 6;
    for (const row of rows) {
      if (y > 280) { doc.addPage(); y = 20; }
      row.forEach((c, i) => doc.text(String(c), 14 + i * colW, y));
      y += 5;
    }
    doc.save(`${title.replace(/\s/g, '_')}.pdf`);
  } catch { /* PDF export unavailable */ }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export function ButcherReports() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const userId = authUser?.user_id || '';

  // Role detection — default gerente; in real production, derive from team member role
  const [role] = useState<UserRole>('gerente');
  const isGerente = role === 'gerente';

  const [tab, setTab] = useState<ReportTab>('resumen');
  const [preset, setPreset] = useState<DatePreset>('mes');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const [kpis, setKpis] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [evolucion, setEvolucion] = useState<any>(null);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [tiendas, setTiendas] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
    return applyPreset(preset);
  }, [preset, customFrom, customTo]);

  const filters: ButcherFilters = useMemo(() => ({
    ...dateRange,
    storeId: filterStore || undefined,
    workerId: (!isGerente ? userId : filterWorker) || undefined,
    category: filterCategory || undefined,
  }), [dateRange, filterStore, filterWorker, filterCategory, isGerente, userId]);

  const visibleTabs = useMemo(() =>
    isGerente ? TABS_GERENTE : TABS_GERENTE.filter(t => TABS_WORKER.includes(t.id)),
  [isGerente]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return;
    try {
      setLoading(true);
      const [kpiRes, workersRes, prodsRes, evolRes, catRes, tiendasRes] = await Promise.all([
        fetchButcherKpis(userId, filters, signal),
        isGerente ? fetchButcherVentasTrabajador(userId, filters, signal) : Promise.resolve({ workers: [] }),
        fetchButcherTopProductos(userId, { ...filters, limit: 10 }, signal),
        fetchButcherEvolucion(userId, { ...filters, granularity: preset === 'hoy' || preset === 'ayer' || preset === '7d' ? 'day' : 'month' }, signal),
        fetchButcherCategorias(userId, filters, signal),
        isGerente ? fetchButcherTiendas(userId, filters, signal) : Promise.resolve({ tiendas: [] }),
      ]);

      if (!signal?.aborted) {
        setKpis(kpiRes.kpis || null);
        setWorkers(workersRes.workers || []);
        setTopProducts(prodsRes.products || []);
        setEvolucion(evolRes.series || null);
        setCategorias(catRes.categorias || []);
        setTiendas(tiendasRes.tiendas || []);
        setLastUpdate(new Date());
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('Error loading report data:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, filters, isGerente, preset]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    loadData(ctrl.signal);
    return () => ctrl.abort();
  }, [loadData]);

  // IC-10: Real-time polling
  useEffect(() => {
    const interval = document.hidden ? 300000 : 30000;
    pollRef.current = setInterval(() => {
      if (!document.hidden) loadData();
    }, interval);

    const onVisChange = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => { if (!document.hidden) loadData(); }, document.hidden ? 300000 : 30000);
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [loadData]);

  // ── Active filters count ──────────────────────────────────────────────────
  const activeFilters = [filterStore, filterWorker, filterCategory].filter(Boolean).length;

  // ── Export handler ────────────────────────────────────────────────────────
  const handleExport = useCallback(async (format: 'excel' | 'pdf' | 'csv') => {
    setShowExport(false);
    const suffix = `${dateRange.from}_${dateRange.to}`;

    if (tab === 'resumen' && kpis) {
      const rows = [{ Concepto: 'Ventas', Importe: kpis.ventasPeriodo?.total }, { Concepto: 'Coste ventas', Importe: -(kpis.ventasPeriodo?.total - kpis.margenEstimado?.total) }, { Concepto: 'Margen bruto', Importe: kpis.margenEstimado?.total }, { Concepto: 'Merma', Importe: -kpis.mermaTotal?.coste }, { Concepto: 'Beneficio estimado', Importe: kpis.beneficioEstimado?.total }];
      if (format === 'csv') await exportToCsv(rows, `Resumen_Carniceria_${suffix}`);
      else if (format === 'excel') await exportToExcel(rows, `Resumen_Carniceria_${suffix}`);
      else await exportToPdf('Resumen Carnicería', rows.map(r => [r.Concepto, formatEur(r.Importe as number)]), ['Concepto', 'Importe']);
    } else if (tab === 'trabajadores') {
      const rows = workers.map(w => ({ Trabajador: w.nombre, Ventas: w.ventas, Tickets: w.tickets, 'Ticket Medio': w.ticketMedio, 'Merma (kg)': w.mermaKg, Horas: w.horas, 'Ventas/Hora': w.ventasPorHora }));
      if (format === 'csv') await exportToCsv(rows, `Trabajadores_${suffix}`);
      else if (format === 'excel') await exportToExcel(rows, `Trabajadores_${suffix}`);
      else await exportToPdf('Rendimiento por Trabajador', rows.map(r => [r.Trabajador, formatEur(r.Ventas), String(r.Tickets), formatEur(r['Ticket Medio'])]), ['Trabajador', 'Ventas', 'Tickets', 'Ticket Medio']);
    } else if (tab === 'categorias') {
      const rows = categorias.map(c => ({ Categoría: CAT_LABELS[c.categoria] || c.categoria, 'Ventas (€)': c.ventas, '% Total': c.pctDelTotal, 'Margen (€)': c.margen, '% Margen': c.margenPct, 'Merma (kg)': c.mermaKg }));
      if (format === 'csv') await exportToCsv(rows, `Categorias_${suffix}`);
      else if (format === 'excel') await exportToExcel(rows, `Categorias_${suffix}`);
      else await exportToPdf('Evolución por Categoría', rows.map(r => [r.Categoría, formatEur(r['Ventas (€)']), `${r['% Total']}%`, formatEur(r['Margen (€)'])]), ['Categoría', 'Ventas', '% Total', 'Margen']);
    } else if (tab === 'tiendas') {
      const rows = tiendas.map(t => ({ Tienda: t.nombre, Ventas: t.ventas, Tickets: t.tickets, Margen: t.margen, '% Margen': t.margenPct, 'Merma (kg)': t.mermaKg, Beneficio: t.beneficio, Empleados: t.empleados }));
      if (format === 'csv') await exportToCsv(rows, `Tiendas_${suffix}`);
      else if (format === 'excel') await exportToExcel(rows, `Tiendas_${suffix}`);
      else await exportToPdf('Comparativa por Tienda', rows.map(r => [r.Tienda, formatEur(r.Ventas), String(r.Tickets), formatEur(r.Beneficio)]), ['Tienda', 'Ventas', 'Tickets', 'Beneficio']);
    } else if (tab === 'margenes') {
      const rows = topProducts.map(p => ({ Producto: p.nombre, Ventas: p.ingresos, Coste: p.coste, 'Margen (€)': p.margen, '% Margen': p.margenPct }));
      if (format === 'csv') await exportToCsv(rows, `Margenes_${suffix}`);
      else if (format === 'excel') await exportToExcel(rows, `Margenes_${suffix}`);
      else await exportToPdf('Márgenes por Producto', rows.map(r => [r.Producto, formatEur(r.Ventas), formatEur(r['Margen (€)']), `${r['% Margen']}%`]), ['Producto', 'Ventas', 'Margen', '%']);
    } else if (tab === 'ventas' && evolucion) {
      const rows = (evolucion.ventas || []).map((v: any) => ({ Periodo: v.periodo, Ventas: v.total, Tickets: v.tickets, Margen: v.margen }));
      if (format === 'csv') await exportToCsv(rows, `Ventas_${suffix}`);
      else if (format === 'excel') await exportToExcel(rows, `Ventas_${suffix}`);
      else await exportToPdf('Evolución de Ventas', rows.map((r: any) => [r.Periodo, formatEur(r.Ventas), String(r.Tickets)]), ['Periodo', 'Ventas', 'Tickets']);
    } else if (tab === 'merma' && evolucion) {
      const rows = (evolucion.merma || []).map((m: any) => ({ Periodo: m.periodo, 'Merma (kg)': m.kg, 'Coste (€)': m.coste }));
      if (format === 'csv') await exportToCsv(rows, `Merma_${suffix}`);
      else if (format === 'excel') await exportToExcel(rows, `Merma_${suffix}`);
      else await exportToPdf('Evolución de Merma', rows.map((r: any) => [r.Periodo, String(r['Merma (kg)']), formatEur(r['Coste (€)'])]), ['Periodo', 'Merma (kg)', 'Coste']);
    } else if (tab === 'compras' && evolucion) {
      const rows = (evolucion.compras || []).map((c: any) => ({ Periodo: c.periodo, Total: c.total }));
      if (format === 'csv') await exportToCsv(rows, `Compras_${suffix}`);
      else if (format === 'excel') await exportToExcel(rows, `Compras_${suffix}`);
      else await exportToPdf('Evolución de Compras', rows.map((r: any) => [r.Periodo, formatEur(r.Total)]), ['Periodo', 'Total']);
    }
  }, [tab, kpis, workers, categorias, tiendas, topProducts, evolucion, dateRange]);

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <Layout title="Informes y Rentabilidad" subtitle="Carnicería — Resultado real del negocio">
      <div className="flex flex-col gap-4">

        {/* IC-09: Worker restriction banner */}
        {!isGerente && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl">
            <Shield className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Vista trabajador</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Mostrando solo tus datos personales. Solicita acceso al gerente para ver datos globales.</p>
            </div>
          </div>
        )}

        {/* ── Header bar ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/saas/butcher-hub')} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              Centro Operativo
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Informes y Rentabilidad</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Real-time indicator */}
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              En vivo · {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button onClick={() => loadData()} disabled={loading} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {/* Export dropdown */}
            <div className="relative">
              <button onClick={() => setShowExport(!showExport)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity">
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 py-1 min-w-[160px]">
                  <button onClick={() => handleExport('excel')} className="w-full px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
                  </button>
                  <button onClick={() => handleExport('pdf')} className="w-full px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button onClick={() => handleExport('csv')} className="w-full px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Filters bar ── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${preset === p.id ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setPreset('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${preset === 'custom' ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              <Calendar className="w-3.5 h-3.5" />
            </button>

            <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

            <button onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeFilters > 0 ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              <Filter className="w-3.5 h-3.5" />
              Filtros{activeFilters > 0 && <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center">{activeFilters}</span>}
            </button>

            {activeFilters > 0 && (
              <button onClick={() => { setFilterStore(''); setFilterWorker(''); setFilterCategory(''); }}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none" />
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none" />
            </div>
          )}

          {showFilters && (
            <div className="flex items-center gap-3 flex-wrap p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <select value={filterStore} onChange={e => setFilterStore(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none">
                <option value="">Todas las tiendas</option>
                <option value="central">Tienda Central</option>
                <option value="norte">Tienda Norte</option>
              </select>
              {isGerente && (
                <select value={filterWorker} onChange={e => setFilterWorker(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none">
                  <option value="">Todos los trabajadores</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
                </select>
              )}
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none">
                <option value="">Todas las categorías</option>
                {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ── KPIs row ── */}
        {!loading && kpis && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPICard title="Ventas del día" value={formatEur(kpis.ventasHoy?.total || 0)} sub={`${kpis.ventasHoy?.tickets || 0} tickets`}
              icon={<Euro className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30"
              trend={kpis.ventasHoy?.vsPrevDay !== 0 ? { value: `${kpis.ventasHoy?.vsPrevDay > 0 ? '+' : ''}${kpis.ventasHoy?.vsPrevDay}% vs ayer`, up: kpis.ventasHoy?.vsPrevDay >= 0 } : undefined}
              onClick={() => setTab('ventas')} />
            {isGerente && (
              <KPICard title="Margen estimado" value={`${kpis.margenEstimado?.pct || 0}%`} sub={formatEur(kpis.margenEstimado?.total || 0)}
                icon={<TrendingUp className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30"
                trend={kpis.margenEstimado?.vsPrevPeriod !== 0 ? { value: `${kpis.margenEstimado?.vsPrevPeriod > 0 ? '+' : ''}${kpis.margenEstimado?.vsPrevPeriod}pp`, up: kpis.margenEstimado?.vsPrevPeriod >= 0 } : undefined}
                onClick={() => setTab('margenes')} />
            )}
            <KPICard title="Merma total" value={`${kpis.mermaTotal?.kg || 0} kg`} sub={formatEur(kpis.mermaTotal?.coste || 0)}
              icon={<Trash2 className="w-4 h-4 text-amber-600" />} color={kpis.mermaTotal?.pctSobreVentas > 3 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-amber-50 dark:bg-amber-900/30'}
              trend={kpis.mermaTotal?.vsPrevPeriod !== 0 ? { value: `${kpis.mermaTotal?.vsPrevPeriod > 0 ? '+' : ''}${kpis.mermaTotal?.vsPrevPeriod}%`, up: kpis.mermaTotal?.vsPrevPeriod <= 0 } : undefined}
              onClick={() => setTab('merma')} />
            {isGerente && (
              <KPICard title="Compras del mes" value={formatEur(kpis.comprasMes?.total || 0)} sub={`${kpis.comprasMes?.facturas || 0} pedidos`}
                icon={<ShoppingCart className="w-4 h-4 text-violet-600" />} color="bg-violet-50 dark:bg-violet-900/30"
                onClick={() => setTab('compras')} />
            )}
            {isGerente && (
              <KPICard title="Beneficio estimado" value={formatEur(kpis.beneficioEstimado?.total || 0)} sub={`${kpis.beneficioEstimado?.pct || 0}% sobre ventas`}
                icon={<Wallet className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30"
                trend={kpis.beneficioEstimado?.total !== 0 ? { value: kpis.beneficioEstimado?.pct >= 10 ? 'Saludable' : kpis.beneficioEstimado?.pct >= 0 ? 'Ajustado' : 'Negativo', up: kpis.beneficioEstimado?.pct >= 10 } : undefined} />
            )}
            <KPICard title="Stock crítico" value={String(kpis.stockCritico?.count || 0)} sub={kpis.stockCritico?.count > 0 ? 'Productos bajo mínimo' : 'Todo en orden'}
              icon={<Package className="w-4 h-4 text-red-600" />} color={kpis.stockCritico?.count > 0 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-700'}
              trend={kpis.stockCritico?.count > 0 ? { value: `${kpis.stockCritico.count} alertas`, up: false } : undefined}
              onClick={() => navigate('/saas/butcher-inventory')} />
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {visibleTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${tab === t.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {loading ? <Skeleton /> : (
          <div className="space-y-5">

            {/* ══ TAB RESUMEN ══ */}
            {tab === 'resumen' && kpis && (
              <>
                <div className="grid md:grid-cols-2 gap-5">
                  <ChartCard title="Evolución ventas vs margen" period={dateRange.from + ' → ' + dateRange.to}>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={evolucion?.ventas || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [formatEur(v), name]} />
                        <Legend />
                        <Bar dataKey="total" name="Ventas" fill="#dc2626" radius={[4, 4, 0, 0]} opacity={0.85} />
                        <Line type="monotone" dataKey="margen" name="Margen" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Distribución por categoría">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={categorias.filter(c => c.ventas > 0)} dataKey="ventas" nameKey="categoria" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2}
                          label={({ categoria, pctDelTotal }) => `${CAT_LABELS[categoria] || categoria} ${pctDelTotal}%`} labelLine={false}>
                          {categorias.map((c, i) => <Cell key={c.categoria} fill={CAT_COLORS[c.categoria] || COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {/* Top 5 products */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-gray-500" />
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Top 5 productos</h3>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {topProducts.slice(0, 5).map((p, i) => (
                        <button key={p.id} onClick={() => navigate('/saas/butcher-products')} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-gray-300'}`}>{i + 1}</span>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{p.nombre}</p>
                            <p className="text-[10px] text-gray-400">{CAT_LABELS[p.categoria] || p.categoria} · {p.unidades} {p.unidades === 1 ? 'ud' : 'uds'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{formatEur(p.ingresos)}</p>
                            {isGerente && <p className={`text-[10px] font-semibold ${p.margenPct >= 15 ? 'text-emerald-600' : p.margenPct >= 5 ? 'text-amber-600' : 'text-red-600'}`}>{p.margenPct}% margen</p>}
                          </div>
                          {p.alertaStock && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                        </button>
                      ))}
                      {topProducts.length === 0 && <p className="px-5 py-8 text-sm text-gray-400 text-center">Sin datos de ventas en este periodo</p>}
                    </div>
                  </div>

                  {/* P&L */}
                  {isGerente && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-gray-500" />
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Cuenta de resultados</h3>
                      </div>
                      <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {[
                          { label: '(+) Ventas del periodo', value: kpis.ventasPeriodo?.total || 0, color: 'text-emerald-600' },
                          { label: '(-) Coste de ventas', value: -(kpis.ventasPeriodo?.total - kpis.margenEstimado?.total) || 0, color: 'text-red-500' },
                          { label: '(=) Margen bruto', value: kpis.margenEstimado?.total || 0, color: 'text-emerald-700 font-bold', pct: kpis.margenEstimado?.pct, bold: true },
                          { label: '(-) Merma (coste estimado)', value: -(kpis.mermaTotal?.coste || 0), color: 'text-red-500' },
                          { label: '(=) Beneficio estimado', value: kpis.beneficioEstimado?.total || 0, color: kpis.beneficioEstimado?.total >= 0 ? 'text-emerald-700' : 'text-red-600', pct: kpis.beneficioEstimado?.pct, bold: true },
                        ].map((row, i) => (
                          <div key={i} className={`flex items-center justify-between px-5 py-3 ${row.bold ? 'bg-gray-50/50 dark:bg-gray-700/20' : ''}`}>
                            <span className={`text-xs ${row.bold ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>{row.label}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${row.color}`}>{formatEur(row.value)}</span>
                              {row.pct !== undefined && <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-bold text-gray-600 dark:text-gray-300">{row.pct}%</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Alertas stock crítico */}
                {kpis.stockCritico?.items?.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <h3 className="text-sm font-bold text-red-800 dark:text-red-300">Stock crítico — Productos bajo mínimo</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {kpis.stockCritico.items.map((item: any, i: number) => (
                        <button key={i} onClick={() => navigate('/saas/butcher-inventory')}
                          className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 hover:shadow-sm transition-all">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">{item.nombre}</p>
                            <p className="text-[10px] text-red-600">{item.stock} / {item.minimo} {item.unidad}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ══ TAB VENTAS ══ */}
            {tab === 'ventas' && (
              <>
                {kpis && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPICard title="Ventas periodo" value={formatEur(kpis.ventasPeriodo?.total || 0)} sub={`${kpis.ventasPeriodo?.tickets || 0} tickets`}
                      icon={<Euro className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30"
                      trend={kpis.ventasPeriodo?.vsPrevPeriod !== 0 ? { value: `${kpis.ventasPeriodo?.vsPrevPeriod > 0 ? '+' : ''}${kpis.ventasPeriodo?.vsPrevPeriod}%`, up: kpis.ventasPeriodo?.vsPrevPeriod >= 0 } : undefined} />
                    <KPICard title="Ticket medio" value={formatEur(kpis.ventasPeriodo?.ticketMedio || 0)} sub="Por operación"
                      icon={<Activity className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
                    <KPICard title="Ventas hoy" value={formatEur(kpis.ventasHoy?.total || 0)} sub={`${kpis.ventasHoy?.tickets || 0} tickets`}
                      icon={<TrendingUp className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
                    <KPICard title="Ticket medio hoy" value={formatEur(kpis.ventasHoy?.ticketMedio || 0)} sub="Media del día"
                      icon={<Percent className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
                  </div>
                )}
                <ChartCard title="Evolución de ventas" period={dateRange.from + ' → ' + dateRange.to}>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={evolucion?.ventas || []}>
                      <defs>
                        <linearGradient id="ventasGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#dc2626" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [formatEur(v), name]} />
                      <Area type="monotone" dataKey="total" name="Ventas" stroke="#dc2626" strokeWidth={2.5} fill="url(#ventasGrad)" dot={{ r: 3, fill: '#dc2626' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
                {/* Link to sales detail */}
                <button onClick={() => navigate('/saas/butcher-sales')} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                  Ver detalle de ventas <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {/* ══ TAB TRABAJADORES ══ */}
            {tab === 'trabajadores' && isGerente && (
              <>
                <ChartCard title="Ventas por trabajador">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={workers.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                      <YAxis dataKey="nombre" type="category" width={110} tick={{ fontSize: 10 }} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Bar dataKey="ventas" name="Ventas" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Trabajador</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Ventas</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Tickets</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Ticket medio</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Merma (kg)</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Horas</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">€/hora</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {workers.map((w) => (
                          <tr key={w.id} className="hover:bg-gray-50/30 dark:hover:bg-gray-700/20 transition-colors">
                            <td className="px-5 py-3">
                              <button onClick={() => navigate('/saas/butcher-workers')} className="text-xs font-semibold text-gray-800 dark:text-gray-200 hover:text-blue-600 transition-colors">{w.nombre}</button>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-gray-900 dark:text-gray-100">{formatEur(w.ventas)}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{w.tickets}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(w.ticketMedio)}</td>
                            <td className="px-4 py-3 text-right text-xs text-amber-600">{w.mermaKg}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{w.horas}h</td>
                            <td className="px-5 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(w.ventasPorHora)}</td>
                          </tr>
                        ))}
                        {workers.length === 0 && (
                          <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">Sin datos de trabajadores</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ══ TAB CATEGORÍAS ══ */}
            {tab === 'categorias' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {categorias.map(c => (
                    <div key={c.categoria} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4" style={{ borderLeftColor: CAT_COLORS[c.categoria] || '#6b7280', borderLeftWidth: 3 }}>
                      <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{CAT_LABELS[c.categoria] || c.categoria}</p>
                      <p className="text-lg font-black text-gray-900 dark:text-gray-100 mt-1">{formatEur(c.ventas)}</p>
                      <p className="text-[10px] text-gray-400">{c.pctDelTotal}% del total</p>
                    </div>
                  ))}
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                  <ChartCard title="Distribución de ventas">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={categorias.filter(c => c.ventas > 0)} dataKey="ventas" nameKey="categoria" cx="50%" cy="50%" outerRadius={100} innerRadius={45} paddingAngle={2}>
                          {categorias.map(c => <Cell key={c.categoria} fill={CAT_COLORS[c.categoria] || '#6b7280'} />)}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                        <Legend formatter={(v: string) => CAT_LABELS[v] || v} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Evolución mensual por categoría">
                    <ResponsiveContainer width="100%" height={260}>
                      {(() => {
                        const months = [...new Set(categorias.flatMap(c => c.evolucion?.map((e: any) => e.mes) || []))].sort();
                        const data = months.map(m => {
                          const point: any = { mes: m };
                          categorias.forEach(c => {
                            const e = c.evolucion?.find((ev: any) => ev.mes === m);
                            point[c.categoria] = e?.ventas || 0;
                          });
                          return point;
                        });
                        return (
                          <AreaChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                            <Legend formatter={(v: string) => CAT_LABELS[v] || v} />
                            {categorias.filter(c => c.ventas > 0).map(c => (
                              <Area key={c.categoria} type="monotone" dataKey={c.categoria} stackId="1" stroke={CAT_COLORS[c.categoria] || '#6b7280'} fill={CAT_COLORS[c.categoria] || '#6b7280'} fillOpacity={0.4} />
                            ))}
                          </AreaChart>
                        );
                      })()}
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Categoría</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Ventas</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">% Total</th>
                          {isGerente && <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Margen</th>}
                          {isGerente && <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">% Margen</th>}
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Merma (kg)</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Merma (€)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {categorias.map(c => (
                          <tr key={c.categoria} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT_COLORS[c.categoria] }} />
                              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{CAT_LABELS[c.categoria] || c.categoria}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-gray-900 dark:text-gray-100">{formatEur(c.ventas)}</td>
                            <td className="px-4 py-3 text-right"><span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-[10px] font-bold text-gray-600 dark:text-gray-300">{c.pctDelTotal}%</span></td>
                            {isGerente && <td className="px-4 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(c.margen)}</td>}
                            {isGerente && <td className="px-4 py-3 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.margenPct >= 15 ? 'bg-emerald-100 text-emerald-700' : c.margenPct >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{c.margenPct}%</span></td>}
                            <td className="px-4 py-3 text-right text-xs text-amber-600">{c.mermaKg}</td>
                            <td className="px-5 py-3 text-right text-xs text-red-500">{formatEur(c.mermaCoste)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ══ TAB TIENDAS ══ */}
            {tab === 'tiendas' && isGerente && (
              <>
                {tiendas.length > 1 ? (
                  <>
                    <ChartCard title="Comparativa por tienda">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={tiendas}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="nombre" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                          <Legend />
                          <Bar dataKey="ventas" name="Ventas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="margen" name="Margen" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="beneficio" name="Beneficio" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[1000px]">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50">
                              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Tienda</th>
                              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Ventas</th>
                              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Tickets</th>
                              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Ticket medio</th>
                              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Margen %</th>
                              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Merma (kg)</th>
                              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Compras</th>
                              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Beneficio</th>
                              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Empleados</th>
                              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">€/Empleado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {tiendas.map(t => (
                              <tr key={t.id} className="hover:bg-gray-50/30 transition-colors">
                                <td className="px-5 py-3 text-xs font-semibold text-gray-800 dark:text-gray-200">{t.nombre}</td>
                                <td className="px-3 py-3 text-right text-xs font-bold text-gray-900 dark:text-gray-100">{formatEur(t.ventas)}</td>
                                <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{t.tickets}</td>
                                <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(t.ticketMedio)}</td>
                                <td className="px-3 py-3 text-right"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.margenPct >= 15 ? 'bg-emerald-100 text-emerald-700' : t.margenPct >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{t.margenPct}%</span></td>
                                <td className="px-3 py-3 text-right text-xs text-amber-600">{t.mermaKg}</td>
                                <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(t.compras)}</td>
                                <td className="px-3 py-3 text-right text-xs font-bold"><span className={t.beneficio >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatEur(t.beneficio)}</span></td>
                                <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{t.empleados}</td>
                                <td className="px-5 py-3 text-right text-xs font-bold text-blue-600">{formatEur(t.ventaPorEmpleado)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800/50 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
                    <Store className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Añade más puntos de venta para comparar</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Cuando tengas más de una tienda, aquí verás la comparativa entre ellas</p>
                  </div>
                )}
              </>
            )}

            {/* ══ TAB MERMA ══ */}
            {tab === 'merma' && (
              <>
                {kpis && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPICard title="Merma total" value={`${kpis.mermaTotal?.kg || 0} kg`} sub="Periodo seleccionado"
                      icon={<Trash2 className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
                    <KPICard title="Coste merma" value={formatEur(kpis.mermaTotal?.coste || 0)} sub="Coste estimado"
                      icon={<Euro className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
                    <KPICard title="% sobre ventas" value={`${kpis.mermaTotal?.pctSobreVentas || 0}%`} sub={kpis.mermaTotal?.pctSobreVentas > 3 ? 'Por encima del objetivo' : 'Dentro del objetivo'}
                      icon={<Percent className="w-4 h-4 text-violet-600" />} color="bg-violet-50 dark:bg-violet-900/30"
                      trend={{ value: kpis.mermaTotal?.pctSobreVentas > 3 ? 'Alto' : 'OK', up: kpis.mermaTotal?.pctSobreVentas <= 3 }} />
                    <KPICard title="vs Periodo anterior" value={`${kpis.mermaTotal?.vsPrevPeriod > 0 ? '+' : ''}${kpis.mermaTotal?.vsPrevPeriod || 0}%`} sub="Comparativa"
                      icon={<Activity className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30"
                      trend={kpis.mermaTotal?.vsPrevPeriod !== 0 ? { value: kpis.mermaTotal?.vsPrevPeriod > 0 ? 'Subiendo' : 'Bajando', up: kpis.mermaTotal?.vsPrevPeriod <= 0 } : undefined} />
                  </div>
                )}
                <ChartCard title="Evolución de merma" period={dateRange.from + ' → ' + dateRange.to}>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={evolucion?.merma || []}>
                      <defs>
                        <linearGradient id="mermaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [name === 'kg' ? `${v} kg` : formatEur(v), name === 'kg' ? 'Merma (kg)' : 'Coste']} />
                      <Area type="monotone" dataKey="kg" name="kg" stroke="#f59e0b" strokeWidth={2.5} fill="url(#mermaGrad)" dot={{ r: 3, fill: '#f59e0b' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
                <button onClick={() => navigate('/saas/butcher-waste')} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                  Ver detalle de merma <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {/* ══ TAB COMPRAS ══ */}
            {tab === 'compras' && isGerente && (
              <>
                <ChartCard title="Evolución de compras" period={dateRange.from + ' → ' + dateRange.to}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={evolucion?.compras || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Bar dataKey="total" name="Compras" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <button onClick={() => navigate('/saas/butcher-suppliers')} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                  Ver proveedores y compras <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {/* ══ TAB MÁRGENES ══ */}
            {tab === 'margenes' && isGerente && (
              <>
                {kpis && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPICard title="Margen bruto total" value={formatEur(kpis.margenEstimado?.total || 0)} sub={`${kpis.margenEstimado?.pct || 0}% sobre ventas`}
                      icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                    <KPICard title="Mejor producto" value={topProducts[0]?.nombre || '—'} sub={topProducts[0] ? `${topProducts[0].margenPct}% margen` : ''}
                      icon={<ArrowUpRight className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
                    <KPICard title="Peor margen" value={topProducts[topProducts.length - 1]?.nombre || '—'} sub={topProducts.length > 0 ? `${topProducts[topProducts.length - 1].margenPct}% margen` : ''}
                      icon={<ArrowDownRight className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
                    <KPICard title="Ventas totales" value={formatEur(kpis.ventasPeriodo?.total || 0)} sub={`${kpis.ventasPeriodo?.tickets || 0} tickets`}
                      icon={<Euro className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
                  </div>
                )}
                <ChartCard title="Margen por producto (Top 10)">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={topProducts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                      <YAxis dataKey="nombre" type="category" width={130} tick={{ fontSize: 10 }} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => `${v}%`} />
                      <ReferenceLine x={15} stroke="#10b981" strokeDasharray="5 5" label={{ value: 'Obj. 15%', position: 'top', fontSize: 9, fill: '#10b981' }} />
                      <Bar dataKey="margenPct" name="% Margen" radius={[0, 4, 4, 0]}>
                        {topProducts.map((p, i) => <Cell key={i} fill={p.margenPct >= 15 ? '#10b981' : p.margenPct >= 5 ? '#f59e0b' : '#ef4444'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Producto</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Ventas</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Coste</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Margen</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">% Margen</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Merma</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {topProducts.map(p => (
                          <tr key={p.id} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3">
                              <button onClick={() => navigate('/saas/butcher-products')} className="text-xs font-semibold text-gray-800 dark:text-gray-200 hover:text-blue-600 transition-colors">{p.nombre}</button>
                              <p className="text-[10px] text-gray-400">{CAT_LABELS[p.categoria] || p.categoria}</p>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-gray-900 dark:text-gray-100">{formatEur(p.ingresos)}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-500">{formatEur(p.coste)}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(p.margen)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.margenPct >= 15 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : p.margenPct >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {p.margenPct}%
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-amber-600">{p.mermaKg > 0 ? `${p.mermaKg} kg` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
