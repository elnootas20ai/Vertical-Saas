import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useCompraventaHub } from '../../hooks/useCompraventaHub';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import type {
  CompraventaFilters,
  VehiculoStock,
  ReservaActiva,
  VentaReciente,
  VehiculoPreparacion,
  EntregaPendiente,
  OportunidadCrm,
  CompraventaAlert,
  AccionPendiente,
} from '../../lib/compraventaApi';
import {
  Car, CalendarCheck, Wrench, TrendingUp, Euro, CreditCard,
  RefreshCw, ChevronRight, AlertTriangle, AlertCircle, Info,
  Clock, Truck, Users, FileText, Search, Filter, X,
  BarChart3, ArrowUpRight, ArrowDownRight, Minus, Eye,
  ShieldAlert, Package, Phone, MapPin, Tag,
} from 'lucide-react';
import {
  BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES')} €`;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  } catch { return iso; }
}

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)}min`;
  return `hace ${Math.floor(s / 3600)}h`;
}

function daysColor(days: number): string {
  if (days > 90) return 'text-red-600 dark:text-red-400';
  if (days > 60) return 'text-amber-600 dark:text-amber-400';
  if (days > 30) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

// ─── Widget config ──────────────────────────────────────────────────────────

type WidgetId = 'kpis' | 'tables' | 'entregas' | 'crm' | 'alertas' | 'acciones' | 'rendimiento';

interface WidgetConfig {
  id: WidgetId;
  label: string;
  visible: boolean;
  managerOnly?: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'kpis', label: 'KPIs principales', visible: true },
  { id: 'tables', label: 'Tablas operativas', visible: true },
  { id: 'entregas', label: 'Entregas pendientes', visible: true },
  { id: 'crm', label: 'Oportunidades CRM', visible: true },
  { id: 'alertas', label: 'Alertas operativas', visible: true },
  { id: 'acciones', label: 'Próximas acciones', visible: true },
  { id: 'rendimiento', label: 'Rendimiento (gerente)', visible: true, managerOnly: true },
];

const CONFIG_KEY = 'udar_compraventa_config_v1';

function loadConfig(scopeId?: string): WidgetConfig[] {
  try {
    const saved = localStorage.getItem(`${CONFIG_KEY}:${scopeId || 'global'}`);
    if (!saved) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(saved) as WidgetConfig[];
    const ids = parsed.map((w) => w.id);
    const merged = [...parsed];
    DEFAULT_WIDGETS.forEach((d) => { if (!ids.includes(d.id)) merged.push(d); });
    return merged;
  } catch { return DEFAULT_WIDGETS; }
}

function saveConfig(config: WidgetConfig[], scopeId?: string) {
  try { localStorage.setItem(`${CONFIG_KEY}:${scopeId || 'global'}`, JSON.stringify(config)); } catch { /* noop */ }
}

// ─── Skeletons ──────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
      <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="h-3 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, subtitle, color, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 text-left w-full transition-all hover:shadow-lg hover:border-${color}-300 dark:hover:border-${color}-700 hover:-translate-y-0.5`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-xl bg-${color}-50 dark:bg-${color}-900/30 text-${color}-600 dark:text-${color}-400`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {subtitle && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1 group-hover:text-gray-700 dark:group-hover:text-gray-300">
          {subtitle} <ChevronRight className="w-3 h-3" />
        </p>
      )}
    </button>
  );
}

// ─── Alert Badge ────────────────────────────────────────────────────────────

function AlertItem({ alert, onClick }: { alert: CompraventaAlert; onClick: () => void }) {
  const sev = alert.severity;
  const icon = sev === 'error' ? <AlertCircle className="w-4 h-4" /> : sev === 'warning' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />;
  const bg = sev === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : sev === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
  const textColor = sev === 'error' ? 'text-red-700 dark:text-red-300' : sev === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300';

  return (
    <button onClick={onClick} className={`flex items-start gap-3 w-full p-3 rounded-xl border ${bg} text-left transition-all hover:shadow-sm`}>
      <span className={`mt-0.5 shrink-0 ${textColor}`}>{icon}</span>
      <span className={`text-sm ${textColor} flex-1`}>{alert.message}</span>
      <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 ${textColor} opacity-50`} />
    </button>
  );
}

// ─── Delivery Badge ─────────────────────────────────────────────────────────

function DeliveryBadge({ badge }: { badge: string }) {
  if (badge === 'retrasada') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium">Retrasada</span>;
  if (badge === 'hoy') return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">Hoy</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">Próxima</span>;
}

// ─── Action type icon ───────────────────────────────────────────────────────

function ActionIcon({ tipo }: { tipo: string }) {
  if (tipo === 'entrega') return <Truck className="w-4 h-4 text-blue-500" />;
  if (tipo === 'seguimiento') return <Phone className="w-4 h-4 text-amber-500" />;
  return <Clock className="w-4 h-4 text-gray-500" />;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CompraventaHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();

  // Filters
  const [branchId, setBranchId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [vehicleStatus, setVehicleStatus] = useState('');
  const [salesChannel, setSalesChannel] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filters = useMemo<CompraventaFilters>(() => ({
    branchId: branchId || undefined,
    responsibleId: responsibleId || undefined,
    vehicleStatus: vehicleStatus || undefined,
    salesChannel: salesChannel || undefined,
  }), [branchId, responsibleId, vehicleStatus, salesChannel]);

  const { data, loading, error, lastUpdated, refresh, isManager } = useCompraventaHub(filters);

  // Tabs for tables
  const [activeTable, setActiveTable] = useState<'stock' | 'reservas' | 'preparacion' | 'ventas'>('stock');

  // Widget config
  const userId = user?.userId || user?._id || '';
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => loadConfig(userId));
  const [showWidgetConfig, setShowWidgetConfig] = useState(false);

  const toggleWidget = useCallback((id: WidgetId) => {
    setWidgets((prev) => {
      const next = prev.map((w) => w.id === id ? { ...w, visible: !w.visible } : w);
      saveConfig(next, userId);
      return next;
    });
  }, [userId]);

  const isVisible = useCallback((id: WidgetId) => {
    const w = widgets.find((w) => w.id === id);
    if (!w) return true;
    if (w.managerOnly && !isManager) return false;
    return w.visible;
  }, [widgets, isManager]);

  // Branch / member lists for filters
  const branches = useMemo(() => currentBusiness?.branches || [], [currentBusiness]);
  const members = useMemo(
    () => (currentBusiness?.members || []).filter((m: { role?: string }) => m.role === 'Comercial' || m.role === 'Gerente' || m.role === 'Admin'),
    [currentBusiness],
  );

  const hasActiveFilters = branchId || responsibleId || vehicleStatus || salesChannel;

  const clearFilters = () => {
    setBranchId('');
    setResponsibleId('');
    setVehicleStatus('');
    setSalesChannel('');
  };

  return (
    <Layout title="Centro Operativo" subtitle="Compraventa de vehículos">
      <div className="space-y-6 max-w-[1600px] mx-auto">

        {/* ─── Header bar ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {timeAgo(lastUpdated)}
              </span>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl border transition-all ${
                hasActiveFilters
                  ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> Filtros
              {hasActiveFilters && (
                <span className="w-5 h-5 flex items-center justify-center text-xs rounded-full bg-blue-600 text-white">
                  {[branchId, responsibleId, vehicleStatus, salesChannel].filter(Boolean).length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowWidgetConfig(!showWidgetConfig)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
            >
              <Eye className="w-3.5 h-3.5" /> Widgets
            </button>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* ─── Filters panel ───────────────────────────────────────────── */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-in slide-in-from-top-2 duration-200">
            {/* Sede */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sede</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Todas las sedes</option>
                {branches.map((b: { branch_id?: string; name?: string }) => (
                  <option key={b.branch_id} value={b.branch_id}>{b.name || b.branch_id}</option>
                ))}
              </select>
            </div>

            {/* Comercial (solo gerente) */}
            {isManager && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Comercial</label>
                <select
                  value={responsibleId}
                  onChange={(e) => setResponsibleId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Todos</option>
                  {members.map((m: { user_id: string; name?: string; fullName?: string }) => (
                    <option key={m.user_id} value={m.user_id}>{m.name || m.fullName || m.user_id}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Estado vehículo */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Estado vehículo</label>
              <select
                value={vehicleStatus}
                onChange={(e) => setVehicleStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Todos</option>
                <option value="listo">Listo para vender</option>
                <option value="reservado">Reservado</option>
                <option value="entrada">Entrada</option>
                <option value="preparacion">En preparación</option>
                <option value="vendido">Vendido</option>
              </select>
            </div>

            {/* Canal de venta */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Canal de venta</label>
              <select
                value={salesChannel}
                onChange={(e) => setSalesChannel(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Todos</option>
                <option value="web">Web</option>
                <option value="portal">Portal</option>
                <option value="walk_in">Presencial</option>
                <option value="referral">Referencia</option>
                <option value="phone">Teléfono</option>
              </select>
            </div>
          </div>
        )}

        {/* ─── Widget config panel ─────────────────────────────────────── */}
        {showWidgetConfig && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 animate-in slide-in-from-top-2 duration-200">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Secciones visibles</p>
            <div className="flex flex-wrap gap-2">
              {widgets
                .filter((w) => !w.managerOnly || isManager)
                .map((w) => (
                  <button
                    key={w.id}
                    onClick={() => toggleWidget(w.id)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                      w.visible
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 line-through'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* ─── Error state ─────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button onClick={refresh} className="ml-auto px-3 py-1 text-sm rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
              Reintentar
            </button>
          </div>
        )}

        {/* ─── KPI Cards ───────────────────────────────────────────────── */}
        {isVisible('kpis') && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {loading && !data ? (
              [...Array(6)].map((_, i) => <KpiSkeleton key={i} />)
            ) : data ? (
              <>
                <KpiCard
                  icon={<Car className="w-5 h-5" />}
                  label="En stock"
                  value={data.stock.total}
                  subtitle={`${data.stock.diasPromedioStock}d promedio`}
                  color="blue"
                  onClick={() => navigate('/saas/vehicles?status=listo')}
                />
                <KpiCard
                  icon={<CalendarCheck className="w-5 h-5" />}
                  label="Reservas"
                  value={data.stock.reservados}
                  subtitle={data.crm.reservasSinContrato > 0 ? `${data.crm.reservasSinContrato} sin contrato` : 'Todas con contrato'}
                  color="amber"
                  onClick={() => navigate('/saas/sales?stage=reserved')}
                />
                <KpiCard
                  icon={<Wrench className="w-5 h-5" />}
                  label="Preparación"
                  value={data.stock.enPreparacion}
                  subtitle="En taller"
                  color="purple"
                  onClick={() => navigate('/saas/vehicles?status=preparation')}
                />
                <KpiCard
                  icon={<TrendingUp className="w-5 h-5" />}
                  label="Ventas mes"
                  value={data.stock.vendidosMes}
                  subtitle={fmt(data.finanzas.ventasMes)}
                  color="green"
                  onClick={() => navigate('/saas/sales-metrics')}
                />
                <KpiCard
                  icon={<Euro className="w-5 h-5" />}
                  label="Margen mes"
                  value={fmt(data.finanzas.margenMes)}
                  subtitle={`${data.finanzas.margenPct}% margen`}
                  color={data.finanzas.margenPct >= 10 ? 'green' : 'red'}
                  onClick={() => navigate('/saas/ebitda')}
                />
                <KpiCard
                  icon={<CreditCard className="w-5 h-5" />}
                  label="Cobros pend."
                  value={data.finanzas.cobrosCount}
                  subtitle={fmt(data.finanzas.cobrosPendientes)}
                  color="red"
                  onClick={() => navigate('/saas/finance')}
                />
              </>
            ) : null}
          </div>
        )}

        {/* ─── Main content: 2-column grid ─────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ─── Left: Tables (2/3 width) ──────────────────────────────── */}
          {isVisible('tables') && (
            <div className="xl:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                {([
                  { id: 'stock' as const, label: 'Stock', count: data?.stock.total },
                  { id: 'reservas' as const, label: 'Reservas', count: data?.stock.reservados },
                  { id: 'preparacion' as const, label: 'Preparación', count: data?.stock.enPreparacion },
                  { id: 'ventas' as const, label: 'Ventas mes', count: data?.stock.vendidosMes },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTable(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTable === tab.id
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        activeTable === tab.id ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Table content */}
              <div className="p-4">
                {loading && !data ? <TableSkeleton /> : (
                  <>
                    {activeTable === 'stock' && <StockTable rows={data?.vehiculosStock || []} onRow={(id) => navigate(`/saas/vehicles/${id}`)} />}
                    {activeTable === 'reservas' && <ReservasTable rows={data?.reservasActivas || []} onRow={(id) => navigate(`/saas/sales/${id}`)} />}
                    {activeTable === 'preparacion' && <PreparacionTable rows={data?.vehiculosPreparacion || []} onRow={(id) => navigate(`/saas/vehicles/${id}`)} />}
                    {activeTable === 'ventas' && <VentasTable rows={data?.ventasRecientes || []} onRow={(id) => navigate(`/saas/sales/${id}`)} />}
                  </>
                )}
              </div>

              {/* Footer link */}
              <div className="px-4 pb-4">
                <button
                  onClick={() => {
                    if (activeTable === 'stock') navigate('/saas/vehicles?status=listo');
                    else if (activeTable === 'reservas') navigate('/saas/sales?stage=reserved');
                    else if (activeTable === 'preparacion') navigate('/saas/vehicles?status=preparacion');
                    else navigate('/saas/sales');
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Ver todos <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ─── Right: Side panels (1/3 width) ───────────────────────── */}
          <div className="space-y-6">

            {/* Entregas pendientes */}
            {isVisible('entregas') && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Truck className="w-4 h-4 text-blue-500" /> Entregas pendientes
                    {data && <span className="text-xs font-normal text-gray-400">({data.entregas.pendientes})</span>}
                  </h3>
                  {data && data.entregas.retrasadas > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                      {data.entregas.retrasadas} retrasadas
                    </span>
                  )}
                </div>
                {loading && !data ? <TableSkeleton /> : (
                  <div className="space-y-2">
                    {(data?.entregasPendientes || []).length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Sin entregas pendientes</p>
                    )}
                    {(data?.entregasPendientes || []).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => navigate(`/saas/sales/${e.id}`)}
                        className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{e.vehiculo}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{e.cliente} · {fmtDate(e.fechaPrevista)}</p>
                        </div>
                        <DeliveryBadge badge={e.badge} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Oportunidades CRM */}
            {isVisible('crm') && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-500" /> Oportunidades CRM
                    {data && <span className="text-xs font-normal text-gray-400">({data.crm.oportunidadesAbiertas})</span>}
                  </h3>
                  {data && data.crm.leadsSinContacto48h > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                      {data.crm.leadsSinContacto48h} sin contacto
                    </span>
                  )}
                </div>
                {loading && !data ? <TableSkeleton /> : (
                  <div className="space-y-2">
                    {(data?.oportunidades || []).length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Sin oportunidades abiertas</p>
                    )}
                    {(data?.oportunidades || []).map((o) => (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/saas/crm/clientes/${o.id}`)}
                        className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{o.nombre}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                            {o.fuente && <><Tag className="w-3 h-3" /> {o.fuente}</>}
                            {o.fuente && ' · '}
                            {o.diasSinContacto}d sin contacto
                          </p>
                        </div>
                        <span className={`text-xs font-medium ${o.diasSinContacto > 7 ? 'text-red-500' : o.diasSinContacto > 3 ? 'text-amber-500' : 'text-green-500'}`}>
                          {o.diasSinContacto}d
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => navigate('/saas/pipeline')}
                  className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Ver pipeline <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Próximas acciones */}
            {isVisible('acciones') && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-violet-500" /> Próximas acciones
                </h3>
                {loading && !data ? <TableSkeleton /> : (
                  <div className="space-y-2">
                    {(data?.proximasAcciones || []).length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Sin acciones pendientes</p>
                    )}
                    {(data?.proximasAcciones || []).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => navigate(a.route)}
                        className="flex items-start gap-3 w-full p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <ActionIcon tipo={a.tipo} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white">{a.descripcion}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {fmtDate(a.fecha)}{a.asignadoA ? ` · ${a.asignadoA}` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Alertas operativas ───────────────────────────────────────── */}
        {isVisible('alertas') && data && data.alertas.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-red-500" /> Alertas operativas
              <span className="text-xs font-normal text-gray-400">({data.alertas.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.alertas
                .sort((a, b) => {
                  const order = { error: 0, warning: 1, info: 2 };
                  return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
                })
                .map((alert) => (
                  <AlertItem key={alert.id} alert={alert} onClick={() => navigate(alert.route)} />
                ))}
            </div>
          </div>
        )}

        {/* ─── Rendimiento (solo gerente) ──────────────────────────────── */}
        {isVisible('rendimiento') && isManager && data?.rendimiento && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-emerald-500" /> Rendimiento del mes
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Chart */}
              <div className="md:col-span-2">
                {data.rendimiento.ventasPorDia.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.rendimiento.ventasPorDia}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(8)} stroke="currentColor" className="text-gray-400" />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} stroke="currentColor" className="text-gray-400" />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, fontSize: 12 }}
                        formatter={(value: number, name: string) => [fmt(value), name === 'ventas' ? 'Ventas' : 'Margen']}
                        labelFormatter={(l: string) => `Día ${l.slice(8)}`}
                      />
                      <Bar dataKey="ventas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="margen" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">Sin datos de ventas este mes</div>
                )}
              </div>
              {/* Summary */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Ventas cerradas</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{data.rendimiento.totalVentas}</p>
                </div>
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Margen acumulado</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{fmt(data.rendimiento.margenAcumulado)}</p>
                </div>
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">% Margen</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.finanzas.margenPct}%</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── Sub-tables ─────────────────────────────────────────────────────────────

function StockTable({ rows, onRow }: { rows: VehiculoStock[]; onRow: (id: string) => void }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 text-center py-6">Sin vehículos en stock</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="pb-2 pr-4">Matrícula</th>
            <th className="pb-2 pr-4">Vehículo</th>
            <th className="pb-2 pr-4 text-right">Precio</th>
            <th className="pb-2 pr-4 text-right">Días stock</th>
            <th className="pb-2">Ubicación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onRow(r.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <td className="py-2.5 pr-4 font-mono text-xs font-medium text-gray-900 dark:text-white">{r.matricula}</td>
              <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{r.marca} {r.modelo}</td>
              <td className="py-2.5 pr-4 text-right font-medium text-gray-900 dark:text-white">{fmt(r.precioVenta)}</td>
              <td className={`py-2.5 pr-4 text-right font-bold ${daysColor(r.diasStock)}`}>{r.diasStock}d</td>
              <td className="py-2.5 text-gray-500 dark:text-gray-400 text-xs">{r.ubicacion || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReservasTable({ rows, onRow }: { rows: ReservaActiva[]; onRow: (id: string) => void }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 text-center py-6">Sin reservas activas</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="pb-2 pr-4">Vehículo</th>
            <th className="pb-2 pr-4">Cliente</th>
            <th className="pb-2 pr-4">Fecha</th>
            <th className="pb-2 pr-4">Contrato</th>
            <th className="pb-2">Comercial</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onRow(r.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <td className="py-2.5 pr-4">
                <p className="font-medium text-gray-900 dark:text-white">{r.vehiculo}</p>
                <p className="text-xs text-gray-500 font-mono">{r.matricula}</p>
              </td>
              <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{r.cliente}</td>
              <td className="py-2.5 pr-4 text-gray-500 text-xs">{fmtDate(r.fechaReserva)}</td>
              <td className="py-2.5 pr-4">
                {r.tieneContrato
                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">Sí</span>
                  : <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">No</span>
                }
              </td>
              <td className="py-2.5 text-gray-500 dark:text-gray-400 text-xs">{r.comercial || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreparacionTable({ rows, onRow }: { rows: VehiculoPreparacion[]; onRow: (id: string) => void }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 text-center py-6">Sin vehículos en preparación</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="pb-2 pr-4">Matrícula</th>
            <th className="pb-2 pr-4">Vehículo</th>
            <th className="pb-2 pr-4 text-right">Gastos</th>
            <th className="pb-2 text-right">Nº gastos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onRow(r.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <td className="py-2.5 pr-4 font-mono text-xs font-medium text-gray-900 dark:text-white">{r.matricula}</td>
              <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{r.marca} {r.modelo}</td>
              <td className="py-2.5 pr-4 text-right font-medium text-gray-900 dark:text-white">{fmt(r.gastosRegistrados)}</td>
              <td className="py-2.5 text-right">
                {r.numGastos === 0
                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">Sin gastos</span>
                  : <span className="text-gray-600 dark:text-gray-400">{r.numGastos}</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VentasTable({ rows, onRow }: { rows: VentaReciente[]; onRow: (id: string) => void }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 text-center py-6">Sin ventas este mes</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="pb-2 pr-4">Vehículo</th>
            <th className="pb-2 pr-4">Cliente</th>
            <th className="pb-2 pr-4 text-right">Importe</th>
            <th className="pb-2 pr-4 text-right">Margen</th>
            <th className="pb-2 pr-4">Pago</th>
            <th className="pb-2">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onRow(r.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-white">{r.vehiculo}</td>
              <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{r.cliente}</td>
              <td className="py-2.5 pr-4 text-right font-medium text-gray-900 dark:text-white">{fmt(r.importe)}</td>
              <td className={`py-2.5 pr-4 text-right font-medium ${r.margen >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {fmt(r.margen)}
              </td>
              <td className="py-2.5 pr-4">
                {r.estadoPago === 'pagado'
                  ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">Pagado</span>
                  : <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">Pendiente</span>
                }
              </td>
              <td className="py-2.5 text-gray-500 text-xs">{fmtDate(r.fecha)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
