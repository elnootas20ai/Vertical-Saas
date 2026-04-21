import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalDashboardApi, type VerticalDashboardData } from '../../lib/verticalApiFactory';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, CartesianGrid, Legend,
} from 'recharts';
import {
  Car, Package, AlertTriangle, Wrench, Recycle,
  TrendingUp, TrendingDown, DollarSign, Wallet, UserCheck, Clock,
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus, Bell, CheckCircle,
  RefreshCw, Truck, ClipboardList, Receipt, Boxes,
  Users, FileText, BarChart3, Leaf, AlertCircle,
  ChevronDown, Shield, Euro, Cog, Loader2,
} from 'lucide-react';

type UserRole = 'gerente' | 'trabajador';
type AlertSeverity = 'error' | 'warning' | 'info';

interface ScrapyardAlert {
  id: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  route: string;
}

interface WorkerPerf {
  nombre: string;
  avatar: string;
  piezasHoy: number;
  ventasHoy: number;
  ingresosHoy: number;
  incidencias: number;
  horaEntrada: string;
}

interface HourlySale { hora: string; importe: number; tickets: number }
interface WeeklyEntry { dia: string; label: string; vehiculos: number; despieces: number }

interface StockParadoItem {
  referencia: string;
  pieza: string;
  diasParado: number;
  precio: number;
  vehiculoOrigen: string;
  zona: string;
}

interface RentabilidadVehiculo {
  matricula: string;
  marcaModelo: string;
  costeCompra: number;
  ingresoPiezas: number;
  margen: number;
  piezasVendidas: number;
  piezasStock: number;
}

function routeForScrapType(t: string): string {
  switch (t) {
    case 'sy_sale': return '/saas/scrapyard-sales';
    case 'sy_inventory': return '/saas/scrapyard-inventory';
    case 'sy_deregistration': return '/saas/scrapyard-deregistrations';
    case 'sy_expedition': return '/saas/scrapyard-expedition';
    case 'sy_waste': return '/saas/scrapyard-environment';
    case 'sy_worker': return '/saas/vertical/desguaces/trabajadores';
    default: return '/saas/dashboard';
  }
}

function severityForScrapType(t: string): AlertSeverity {
  if (t === 'sy_deregistration' || t === 'sy_sale') return 'warning';
  if (t === 'sy_waste' || t === 'sy_expedition') return 'info';
  return 'warning';
}

function initialsFromSummary(s: string): string {
  const w = s.trim().split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  if (w[0]?.length >= 2) return w[0].slice(0, 2).toUpperCase();
  return '??';
}

function buildHourlySalesFromActivity(activity: VerticalDashboardData['recentActivity']): HourlySale[] {
  const today = new Date().toISOString().slice(0, 10);
  const byHour: Record<number, { tickets: number }> = {};
  for (const a of activity) {
    if (a.type !== 'sy_sale') continue;
    const d = a.updatedAt || a.createdAt;
    if (!d || String(d).slice(0, 10) !== today) continue;
    const h = new Date(d).getHours();
    if (!byHour[h]) byHour[h] = { tickets: 0 };
    byHour[h].tickets += 1;
  }
  const hours = Object.keys(byHour).map(Number).sort((a, b) => a - b);
  if (!hours.length) return [];
  return hours.map((h) => {
    const t = byHour[h].tickets;
    return {
      hora: `${String(h).padStart(2, '0')}:00`,
      importe: t,
      tickets: t,
    };
  });
}

function buildWeeklyEntriesFromActivity(activity: VerticalDashboardData['recentActivity']): WeeklyEntry[] {
  const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const now = new Date();
  const out: WeeklyEntry[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    let vehiculos = 0;
    let despieces = 0;
    for (const a of activity) {
      const ad = a.updatedAt || a.createdAt;
      if (!ad || String(ad).slice(0, 10) !== ds) continue;
      if (a.type === 'sy_deregistration') vehiculos += 1;
      if (a.type === 'sy_inventory' || a.type === 'sy_sale') despieces += 1;
    }
    const label = dayLabels[dow];
    out.push({ dia: label, label, vehiculos, despieces });
  }
  return out;
}

function alertsFromActivity(activity: VerticalDashboardData['recentActivity']): ScrapyardAlert[] {
  return activity.slice(0, 12).map((a) => ({
    id: a.id,
    type: a.type,
    severity: severityForScrapType(a.type),
    message: `${a.type}: ${String(a.summary || a.id)}`,
    route: routeForScrapType(a.type),
  }));
}

function workersFromActivity(activity: VerticalDashboardData['recentActivity'], fallbackTotal: number): WorkerPerf[] {
  const rows = activity.filter(a => a.type === 'sy_worker');
  if (rows.length) {
    return rows.map((a) => ({
      nombre: String(a.summary || 'Trabajador'),
      avatar: initialsFromSummary(String(a.summary || 'T')),
      piezasHoy: 0,
      ventasHoy: 0,
      ingresosHoy: 0,
      incidencias: 0,
      horaEntrada: a.updatedAt ? new Date(a.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—',
    }));
  }
  if (fallbackTotal > 0) {
    return [{
      nombre: `Equipo Ops (${fallbackTotal})`,
      avatar: 'EQ',
      piezasHoy: 0,
      ventasHoy: 0,
      ingresosHoy: 0,
      incidencias: 0,
      horaEntrada: '—',
    }];
  }
  return [];
}

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

const ALERT_STYLES: Record<AlertSeverity, { border: string; bg: string; text: string; icon: string }> = {
  error:   { border: 'border-l-red-500',   bg: 'bg-red-50 dark:bg-red-950/30',    text: 'text-red-700 dark:text-red-400',   icon: 'text-red-500' },
  warning: { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-500' },
  info:    { border: 'border-l-blue-400',  bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-400',  icon: 'text-blue-400' },
};

const ORDER_STATUS_CFG = {
  pendiente:  { label: 'Pendiente',  dot: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300' },
  preparando: { label: 'Preparando', dot: 'bg-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300' },
  listo:      { label: 'Listo',      dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  enviado:    { label: 'Enviado',    dot: 'bg-gray-400',    bg: 'bg-gray-100 dark:bg-gray-700/30',      text: 'text-gray-600 dark:text-gray-400' },
} as const;

const ENTRY_STATUS_COLOR: Record<string, string> = {
  'Recibido': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'En despiece': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'Despiezado': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  'Compactado': 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400',
};

function KPICard({ title, value, sub, icon, iconBg, iconColor, trend, onClick }: {
  title: string; value: string; sub: string; icon: React.ReactNode;
  iconBg: string; iconColor: string; trend?: { value: string; up: boolean | null }; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
        <div className={`w-8 h-8 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 leading-none">{value}</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {trend && (
          <span className={`flex items-center gap-0.5 text-[11px] font-bold ${trend.up === true ? 'text-emerald-600' : trend.up === false ? 'text-red-500' : 'text-gray-400'}`}>
            {trend.up === true ? <ArrowUpRight className="w-3 h-3" /> : trend.up === false ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
        <span className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</span>
      </div>
    </button>
  );
}

function QuickAccessBtn({ label, icon, route, color, bg }: {
  label: string; icon: React.ReactNode; route: string; color: string; bg: string;
}) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(route)} className={`${bg} rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-all`}>
      <span className={color}>{icon}</span>
      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">{label}</span>
    </button>
  );
}

export function ScrapyardHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dashApi = useMemo(() => createVerticalDashboardApi('scrapyard-ops'), []);
  const userId = user?.user_id || user?.id || '';

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [role, setRole] = useState<UserRole>('gerente');
  const [filterSede, setFilterSede] = useState('todas');
  const [filterZona, setFilterZona] = useState('todas');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [filterTrabajador, setFilterTrabajador] = useState('todos');
  const [showAlertPanel, setShowAlertPanel] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) {
      setDashData(null);
      if (!opts?.silent) setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    try {
      const data = await dashApi.load(userId);
      setDashData(data);
      setLastUpdate(new Date());
    } catch {
      setDashData(null);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [dashApi, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const counts = dashData?.counts ?? {};
  const recent = dashData?.recentActivity ?? [];

  const data = useMemo(() => {
    const c = counts as Record<string, number>;
    const expeditions = c.expeditions ?? 0;
    const inventory = c.inventory ?? 0;
    const deregistrations = c.deregistrations ?? 0;
    const environment = c.environment ?? 0;
    const workersN = c.workers ?? 0;
    const sales = c.sales ?? 0;
    const total = dashData?.total ?? 0;

    const hourlySales = buildHourlySalesFromActivity(recent);
    const weeklyEntries = buildWeeklyEntriesFromActivity(recent);
    const alerts = alertsFromActivity(recent);
    const workers = workersFromActivity(recent, workersN);

    const stockParadoItems: StockParadoItem[] = recent
      .filter(a => a.type === 'sy_inventory')
      .slice(0, 8)
      .map((a) => ({
        referencia: String(a.id).slice(-10),
        pieza: String(a.summary || 'Pieza'),
        diasParado: 0,
        precio: 0,
        vehiculoOrigen: '—',
        zona: '—',
      }));

    const rentabilidadVehiculos: RentabilidadVehiculo[] = [];

    const ultimasVentas = recent
      .filter(a => a.type === 'sy_sale')
      .slice(0, 8)
      .map((a) => ({
        ticket: String(a.id).slice(-14),
        hora: a.updatedAt
          ? new Date(a.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
          : '—',
        total: 0,
        productos: String(a.summary || '—'),
      }));

    const ultimosPedidos = recent
      .filter(a => a.type === 'sy_expedition')
      .slice(0, 8)
      .map((a) => ({
        numero: String(a.id).slice(-8),
        cliente: String(a.summary || 'Cliente'),
        productos: '—',
        entrega: a.updatedAt ? new Date(a.updatedAt).toLocaleString('es-ES') : '—',
        estado: 'pendiente' as const,
      }));

    const ultimasEntradas = recent
      .filter(a => a.type === 'sy_deregistration')
      .slice(0, 8)
      .map((a) => ({
        matricula: String(a.summary || '—').slice(0, 12),
        marcaModelo: String(a.summary || '—'),
        fechaEntrada: a.updatedAt ? new Date(a.updatedAt).toLocaleString('es-ES') : '—',
        estado: 'Recibido',
        procedencia: 'Ops',
      }));

    const ventasDisplay = sales;
    const pedidosUrg = expeditions > 3;

    return {
      vehiculosHoy: deregistrations,
      vehiculosSemana: weeklyEntries.reduce((s, w) => s + w.vehiculos, 0),
      vehiculosDelta: 0,
      piezasStock: inventory,
      piezasReservadas: 0,
      piezasNuevasHoy: recent.filter(a => a.type === 'sy_inventory' && (a.updatedAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
      pedidosPendientes: expeditions,
      pedidosHoy: expeditions,
      ventasHoy: ventasDisplay,
      ventasAyer: 0,
      ventasDelta: 0,
      ticketsHoy: sales,
      retiradasHoy: environment,
      retiradasMes: environment,
      incidenciasAbiertas: Math.max(0, expeditions - sales),
      stockParado: Math.max(0, inventory - sales),
      rentabilidadMedia: total > 0 ? Math.min(100, Math.round((sales / total) * 100)) : 0,
      trabajadoresActivos: workersN,
      cajaActual: ventasDisplay,
      ingresosEfectivo: 0,
      ingresosTarjeta: 0,
      ingresosTransferencia: 0,
      hourlySales,
      weeklyEntries,
      workers,
      alerts,
      stockParadoItems,
      rentabilidadVehiculos,
      ultimasVentas,
      ultimosPedidos,
      ultimasEntradas,
      pedidosUrg,
    };
  }, [dashData, counts, recent]);

  const criticalAlerts = data.alerts.filter(a => a.severity === 'error').length;
  const warningAlerts = data.alerts.filter(a => a.severity === 'warning').length;

  const workerSelf = data.workers[0];

  const quickAccess = [
    { label: 'Dashboard', icon: <BarChart3 className="w-5 h-5" />, route: '/saas/dashboard', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Entrada vehículo', icon: <Truck className="w-5 h-5" />, route: '/saas/scrapyard-vehicles', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Despiece', icon: <Wrench className="w-5 h-5" />, route: '/saas/scrapyard-parts', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    { label: 'Stock piezas', icon: <Boxes className="w-5 h-5" />, route: '/saas/scrapyard-inventory', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Ventas', icon: <Receipt className="w-5 h-5" />, route: '/saas/scrapyard-sales', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Pedidos', icon: <ClipboardList className="w-5 h-5" />, route: '/saas/scrapyard-sales', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Retiradas', icon: <Recycle className="w-5 h-5" />, route: '/saas/scrapyard-deregistrations', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Medioambiente', icon: <Leaf className="w-5 h-5" />, route: '/saas/scrapyard-environment', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Trabajadores', icon: <Users className="w-5 h-5" />, route: '/saas/vertical/desguaces/trabajadores', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
    { label: 'Finanzas', icon: <Wallet className="w-5 h-5" />, route: '/saas/finance', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    { label: 'Documentación', icon: <FileText className="w-5 h-5" />, route: '/saas/documents', color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800' },
    { label: 'Fichajes', icon: <Clock className="w-5 h-5" />, route: '/saas/clockins', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
  ];

  const workerQuickAccess = [
    { label: 'Mi puesto', icon: <Recycle className="w-5 h-5" />, route: '/saas/worker/tpv', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Pedidos hoy', icon: <ClipboardList className="w-5 h-5" />, route: '/saas/scrapyard-sales', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Fichar', icon: <Clock className="w-5 h-5" />, route: '/saas/worker/clock', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Stock', icon: <Boxes className="w-5 h-5" />, route: '/saas/scrapyard-inventory', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  ];

  return (
    <Layout title="Centro Operativo" subtitle="Desguace — Operativa diaria">
      {loading ? (
        <div className="flex justify-center py-16" aria-busy="true" aria-label="Cargando">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 dark:text-emerald-400" />
        </div>
      ) : (
      <div className="flex flex-col gap-4">

        {/* ── Header: role toggle + filters + live status ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button onClick={() => setRole('gerente')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${role === 'gerente' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                <Shield className="w-3.5 h-3.5" /> Gerente
              </button>
              <button onClick={() => setRole('trabajador')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${role === 'trabajador' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                <UserCheck className="w-3.5 h-3.5" /> Trabajador
              </button>
            </div>
            {role === 'gerente' && (
              <div className="flex items-center gap-2 flex-wrap">
                <select value={filterSede} onChange={e => setFilterSede(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400">
                  <option value="todas">Todas las sedes</option>
                  <option value="central">Sede Central</option>
                  <option value="norte">Sede Norte</option>
                </select>
                <select value={filterZona} onChange={e => setFilterZona(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400">
                  <option value="todas">Todas las zonas</option>
                  <option value="A">Zona A</option><option value="B">Zona B</option>
                  <option value="C">Zona C</option><option value="D">Zona D</option>
                </select>
                <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400">
                  <option value="todos">Todos los estados</option>
                  <option value="recibido">Recibido</option><option value="despiece">En despiece</option>
                  <option value="despiezado">Despiezado</option><option value="compactado">Compactado</option>
                </select>
                <select value={filterTrabajador} onChange={e => setFilterTrabajador(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400">
                  <option value="todos">Todos los trabajadores</option>
                  {data.workers.map(w => <option key={w.nombre} value={w.nombre}>{w.nombre}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {refreshing ? (
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><RefreshCw className="w-3 h-3 animate-spin" /> Actualizando...</span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                En vivo · {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={handleRefresh} disabled={refreshing} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ═══ KPIs ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Vehículos hoy" value={String(data.vehiculosHoy)} sub={`${data.vehiculosSemana} esta semana (actividad)`} icon={<Truck className="w-4 h-4" />} iconBg="bg-emerald-100 dark:bg-emerald-900/40" iconColor="text-emerald-600" trend={{ value: 'Bajas / trámites Ops', up: null }} onClick={() => navigate('/saas/scrapyard-vehicles')} />
          <KPICard title="Piezas en stock" value={data.piezasStock.toLocaleString('es-ES')} sub={`${data.piezasReservadas} reservadas · ${data.piezasNuevasHoy} mov. hoy`} icon={<Package className="w-4 h-4" />} iconBg="bg-blue-100 dark:bg-blue-900/40" iconColor="text-blue-600" trend={{ value: 'Inventario Ops', up: null }} onClick={() => navigate('/saas/scrapyard-parts')} />
          <KPICard title="Ventas del día" value={String(data.ventasHoy)} sub={`${data.ticketsHoy} registros sy_sale`} icon={<DollarSign className="w-4 h-4" />} iconBg="bg-emerald-100 dark:bg-emerald-900/40" iconColor="text-emerald-600" trend={{ value: 'CouchDB Ops', up: null }} onClick={() => navigate('/saas/scrapyard-sales')} />
          <KPICard title="Pedidos pendientes" value={String(data.pedidosPendientes)} sub={`${data.pedidosHoy} expediciones`} icon={<ClipboardList className="w-4 h-4" />} iconBg="bg-violet-100 dark:bg-violet-900/40" iconColor="text-violet-600" trend={{ value: data.pedidosUrg ? 'Alto volumen' : 'En curso', up: !data.pedidosUrg }} onClick={() => navigate('/saas/scrapyard-sales')} />
          <KPICard title="Stock parado" value={String(data.stockParado)} sub="Aprox. (inventario − ventas)" icon={<AlertTriangle className="w-4 h-4" />} iconBg="bg-red-100 dark:bg-red-900/40" iconColor="text-red-600" trend={{ value: 'Revisar inventario', up: false }} onClick={() => navigate('/saas/scrapyard-inventory')} />
          <KPICard title="Retiradas hoy" value={String(data.retiradasHoy)} sub="Registros medioambiente (Ops)" icon={<Recycle className="w-4 h-4" />} iconBg="bg-orange-100 dark:bg-orange-900/40" iconColor="text-orange-600" trend={{ value: `${data.retiradasMes} en sistema`, up: null }} onClick={() => navigate('/saas/scrapyard-environment')} />
          <KPICard title="Incidencias" value={String(data.incidenciasAbiertas)} sub="Exped. vs ventas (aprox.)" icon={<AlertCircle className="w-4 h-4" />} iconBg="bg-red-100 dark:bg-red-900/40" iconColor="text-red-600" trend={{ value: `${criticalAlerts} críticas`, up: false }} />
          <KPICard title="Rentabilidad" value={`${data.rentabilidadMedia}%`} sub="Ventas / docs totales" icon={<TrendingUp className="w-4 h-4" />} iconBg="bg-cyan-100 dark:bg-cyan-900/40" iconColor="text-cyan-600" trend={{ value: `${dashData?.total ?? 0} docs`, up: null }} onClick={() => navigate('/saas/finance')} />
        </div>

        {/* ═══ ACCESOS RÁPIDOS ═══ */}
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
          {(role === 'gerente' ? quickAccess : workerQuickAccess).map(item => (
            <QuickAccessBtn key={item.label} {...item} />
          ))}
        </div>

        {/* ═══ ALERTAS ═══ */}
        {data.alerts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <button onClick={() => setShowAlertPanel(!showAlertPanel)} className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas Desguace</p>
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-full">{data.alerts.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">{criticalAlerts} críticas · {warningAlerts} avisos</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAlertPanel ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {showAlertPanel && (
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {data.alerts.map(alert => {
                  const s = ALERT_STYLES[alert.severity];
                  return (
                    <div key={alert.id} className={`flex items-center justify-between px-4 py-3 border-l-4 ${s.border} ${s.bg}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${s.icon}`} />
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{alert.message}</p>
                      </div>
                      <button onClick={() => navigate(alert.route)} className={`flex-shrink-0 flex items-center gap-1 ml-3 text-[11px] font-bold ${s.text} hover:underline`}>
                        Ver <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ GRÁFICAS (gerente) ═══ */}
        {role === 'gerente' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Ventas por hora (hoy)</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">{data.ticketsHoy} ventas Ops</span>
              </div>
              <div className="p-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.hourlySales} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="scrapSalesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as HourlySale;
                      return <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg"><span className="opacity-60 mr-1">{pt.hora}</span>{pt.importe} ops · {pt.tickets} tickets</div>;
                    }} />
                    <Area type="monotone" dataKey="importe" stroke="#2563eb" strokeWidth={2} fill="url(#scrapSalesGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Entradas y despieces (semana)</p>
                </div>
                <button onClick={() => navigate('/saas/scrapyard-vehicles')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Ver todo <ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
              <div className="p-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weeklyEntries} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as WeeklyEntry;
                      return <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg"><span className="opacity-60 mr-1">{pt.dia}</span>{pt.vehiculos} entradas · {pt.despieces} despieces</div>;
                    }} />
                    <Bar dataKey="vehiculos" name="Entradas" radius={[3, 3, 0, 0]} maxBarSize={20} fill="#2563eb" fillOpacity={0.8} />
                    <Bar dataKey="despieces" name="Despieces" radius={[3, 3, 0, 0]} maxBarSize={20} fill="#10b981" fillOpacity={0.8} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconSize={8} formatter={(val: string) => <span className="text-gray-500 text-[10px]">{val}</span>} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ═══ DESGLOSE CAJA + STOCK PARADO (gerente) ═══ */}
        {role === 'gerente' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2"><Euro className="w-4 h-4 text-gray-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Desglose de caja</p></div>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Efectivo</span></div>
                  <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">{formatEur(data.ingresosEfectivo)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Tarjeta</span></div>
                  <span className="text-sm font-black text-blue-700 dark:text-blue-400">{formatEur(data.ingresosTarjeta)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-violet-500" /><span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Transferencia</span></div>
                  <span className="text-sm font-black text-violet-700 dark:text-violet-400">{formatEur(data.ingresosTransferencia)}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Total caja</span>
                  <span className="text-lg font-black text-gray-900 dark:text-gray-100">{formatEur(data.cajaActual)}</span>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Stock parado</p>
                  <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-full">{data.stockParadoItems.length}</span>
                </div>
                <button onClick={() => navigate('/saas/scrapyard-inventory')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Ver inventario <ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {data.stockParadoItems.length === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-gray-400">Sin piezas recientes en inventario Ops</p>
                ) : data.stockParadoItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.diasParado > 60 ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{item.pieza}</p>
                        <p className="text-[10px] text-gray-400">{item.referencia} · {item.zona} · {item.vehiculoOrigen}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className={`text-sm font-black ${item.diasParado > 60 ? 'text-red-600' : 'text-amber-600'}`}>{item.diasParado}d</span>
                      <span className="text-[10px] text-gray-400">{formatEur(item.precio)}</span>
                      {item.diasParado > 60 && <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 text-[9px] font-bold rounded-full">URGENTE</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ ÚLTIMAS VENTAS + PEDIDOS + ENTRADAS ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2"><Receipt className="w-4 h-4 text-gray-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Últimas ventas</p></div>
              <button onClick={() => navigate('/saas/scrapyard-sales')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Ver todas <ArrowRight className="w-3.5 h-3.5" /></button>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.ultimasVentas.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-gray-400">Sin ventas recientes en Ops</p>
              ) : data.ultimasVentas.map((v, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="text-xs font-mono font-semibold text-gray-900 dark:text-gray-100">{v.ticket}</p><span className="text-[10px] text-gray-400">{v.hora}</span></div>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{v.productos}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 ml-3">{v.total > 0 ? formatEur(v.total) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-gray-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Pedidos del día</p></div>
              <button onClick={() => navigate('/saas/scrapyard-sales')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Ver todos <ArrowRight className="w-3.5 h-3.5" /></button>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.ultimosPedidos.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-gray-400">Sin expediciones recientes</p>
              ) : data.ultimosPedidos.map((p, i) => {
                const cfg = ORDER_STATUS_CFG[p.estado];
                return (
                  <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{p.cliente}</p><span className="text-[10px] font-mono text-gray-400">{p.numero}</span></div>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">{p.productos}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <span className="text-[10px] text-gray-400">{p.entrega}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-gray-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Entradas recientes</p></div>
              <button onClick={() => navigate('/saas/scrapyard-vehicles')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Ver vehículos <ArrowRight className="w-3.5 h-3.5" /></button>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.ultimasEntradas.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-gray-400">Sin bajas / trámites recientes</p>
              ) : data.ultimasEntradas.map((e, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{e.matricula}</p>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ENTRY_STATUS_COLOR[e.estado] || 'bg-gray-100 text-gray-600'}`}>{e.estado}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{e.marcaModelo}</p>
                  </div>
                  <div className="flex flex-col items-end ml-3 flex-shrink-0">
                    <span className="text-[10px] text-gray-400">{e.fechaEntrada}</span>
                    <span className="text-[10px] text-gray-400">{e.procedencia}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ RENTABILIDAD POR VEHÍCULO (gerente) ═══ */}
        {role === 'gerente' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Rentabilidad por vehículo</p>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded-full">Este mes</span>
              </div>
              <button onClick={() => navigate('/saas/finance')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Ver finanzas <ArrowRight className="w-3.5 h-3.5" /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase">Vehículo</th>
                    <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Coste</th>
                    <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Ingresos</th>
                    <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Margen</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Vendidas</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Stock</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {data.rentabilidadVehiculos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-xs text-gray-400">
                        Sin datos de rentabilidad por vehículo en el dashboard Ops (solo recuentos globales).
                      </td>
                    </tr>
                  ) : data.rentabilidadVehiculos.map(rv => {
                    const est = rv.margen > 20 ? 'rentable' : rv.margen > 0 ? 'proceso' : rv.ingresoPiezas === 0 ? 'nuevo' : 'perdidas';
                    return (
                      <tr key={rv.matricula} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center"><Car className="w-4 h-4 text-white" /></div>
                            <div><span className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{rv.matricula}</span><p className="text-[10px] text-gray-400">{rv.marcaModelo}</p></div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(rv.costeCompra)}</td>
                        <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(rv.ingresoPiezas)}</td>
                        <td className="px-3 py-3 text-right"><span className={`text-xs font-black ${rv.margen > 50 ? 'text-emerald-600' : rv.margen > 20 ? 'text-blue-600' : rv.margen > 0 ? 'text-amber-600' : rv.margen < 0 ? 'text-red-600' : 'text-gray-400'}`}>{rv.margen > 0 ? '+' : ''}{rv.margen}%</span></td>
                        <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{rv.piezasVendidas}</td>
                        <td className="px-3 py-3 text-center text-xs text-gray-600">{rv.piezasStock}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${est === 'rentable' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700' : est === 'proceso' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700' : est === 'nuevo' ? 'bg-gray-100 dark:bg-gray-700 text-gray-600' : 'bg-red-100 dark:bg-red-900/40 text-red-700'}`}>
                            {est === 'rentable' && <><TrendingUp className="w-3 h-3" /> Rentable</>}
                            {est === 'proceso' && <><Cog className="w-3 h-3" /> En proceso</>}
                            {est === 'nuevo' && <><Clock className="w-3 h-3" /> Nuevo</>}
                            {est === 'perdidas' && <><TrendingDown className="w-3 h-3" /> Pérdidas</>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ RENDIMIENTO TRABAJADORES (gerente) ═══ */}
        {role === 'gerente' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Rendimiento por trabajador</p>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 rounded-full">Hoy</span>
              </div>
              <button onClick={() => navigate('/saas/vertical/desguaces/trabajadores')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Ver equipo <ArrowRight className="w-3.5 h-3.5" /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase">Trabajador</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Entrada</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Piezas</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Ventas</th>
                    <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Ingresos</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 uppercase">Incidencias</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase">Rendimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {data.workers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-xs text-gray-400">
                        Sin trabajadores sy_worker en actividad reciente.
                      </td>
                    </tr>
                  ) : data.workers.map(w => {
                    const rend = w.ingresosHoy > 400 ? 'alto' : w.ingresosHoy > 200 ? 'medio' : 'bajo';
                    return (
                      <tr key={w.nombre} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">{w.avatar}</div><span className="font-semibold text-gray-900 dark:text-gray-100">{w.nombre}</span></div></td>
                        <td className="px-3 py-3 text-center text-xs text-gray-600">{w.horaEntrada}</td>
                        <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{w.piezasHoy}</td>
                        <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{w.ventasHoy}</td>
                        <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(w.ingresosHoy)}</td>
                        <td className="px-3 py-3 text-center"><span className={`text-xs font-bold ${w.incidencias > 0 ? 'text-red-600' : 'text-gray-400'}`}>{w.incidencias}</span></td>
                        <td className="px-5 py-3 text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${rend === 'alto' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700' : rend === 'medio' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700' : 'bg-red-100 dark:bg-red-900/40 text-red-700'}`}>
                            {rend === 'alto' ? <TrendingUp className="w-3 h-3" /> : rend === 'medio' ? <Minus className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {rend.charAt(0).toUpperCase() + rend.slice(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ VISTA TRABAJADOR ═══ */}
        {role === 'trabajador' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Tu jornada de hoy</p></div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-blue-700 dark:text-blue-400">{workerSelf?.piezasHoy ?? 0}</p>
                  <p className="text-[10px] font-semibold text-blue-600 uppercase">Piezas</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{workerSelf?.ventasHoy ?? 0}</p>
                  <p className="text-[10px] font-semibold text-emerald-600 uppercase">Ventas</p>
                </div>
                <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-violet-700 dark:text-violet-400">{formatEur(workerSelf?.ingresosHoy ?? 0)}</p>
                  <p className="text-[10px] font-semibold text-violet-600 uppercase">Ingresos</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center border border-gray-200 dark:border-gray-700">
                  <p className="text-xl font-black text-gray-700 dark:text-gray-300">{workerSelf?.horaEntrada ?? '—'}</p>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">Entrada</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase">Pedidos para preparar</p>
                {data.ultimosPedidos.filter(p => p.estado === 'pendiente' || p.estado === 'preparando').map((p, i) => {
                  const cfg = ORDER_STATUS_CFG[p.estado];
                  return (
                    <div key={i} className="flex items-center justify-between p-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{p.cliente} — {p.numero}</p>
                        <p className="text-[10px] text-gray-500 truncate">{p.productos}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                        <span className="text-[10px] text-gray-400">{p.entrega}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(workerSelf?.incidencias ?? 0) > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase">Mis incidencias</p>
                  <div className="p-3 border-2 border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 rounded-xl">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-xs font-medium text-red-800 dark:text-red-300">Tienes {workerSelf?.incidencias} incidencia{(workerSelf?.incidencias ?? 0) > 1 ? 's' : ''} pendiente{(workerSelf?.incidencias ?? 0) > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      )}
    </Layout>
  );
}
