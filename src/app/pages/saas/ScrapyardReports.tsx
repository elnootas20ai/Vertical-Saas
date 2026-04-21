import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  Car, Package, TrendingUp, TrendingDown, DollarSign,
  Users, AlertTriangle, Wrench, Clock, ArrowRight,
  ArrowUpRight, ArrowDownRight, Minus, RefreshCw,
  Filter, Calendar, Download, FileSpreadsheet,
  BarChart3, Boxes, Receipt, Wallet, Shield, UserCheck,
  Euro, Percent, RotateCcw, AlertCircle, Bell,
  ChevronDown, Truck, CircleDollarSign, Search,
  Activity, Layers, Target, Zap,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole = 'gerente' | 'trabajador';
type DatePreset = 'hoy' | '7d' | '30d' | '90d' | '6m' | '1y' | 'custom';
type ReportTab = 'resumen' | 'vehiculos' | 'piezas' | 'trabajadores' | 'costes' | 'alertas';
type AlertSeverity = 'critical' | 'warning' | 'info';

interface VehicleProfitability {
  matricula: string;
  marcaModelo: string;
  fechaEntrada: string;
  costeCompra: number;
  costesAdicionales: number;
  ingresoPiezas: number;
  piezasTotales: number;
  piezasVendidas: number;
  piezasStock: number;
  margenEur: number;
  margenPct: number;
  diasEnCampa: number;
  roi: number;
}

interface PartRotation {
  categoria: string;
  stock: number;
  vendidas30d: number;
  rotacion: number;
  diasMedioVenta: number;
  valorStock: number;
  ingresos30d: number;
}

interface WorkerProductivity {
  nombre: string;
  avatar: string;
  horasTrabajadas: number;
  piezasExtraidas: number;
  piezasVendidas: number;
  ventasEur: number;
  incidencias: number;
  productividadPorHora: number;
  costeHora: number;
  margenGenerado: number;
}

interface MonthlyData {
  mes: string;
  label: string;
  vehiculosEntrados: number;
  piezasVendidas: number;
  ingresos: number;
  costes: number;
  margen: number;
  margenPct: number;
}

interface CostBreakdown {
  concepto: string;
  importe: number;
  porcentaje: number;
  color: string;
}

interface BusinessAlert {
  id: string;
  tipo: 'margen_bajo' | 'stock_parado' | 'baja_rotacion' | 'coste_alto' | 'vehiculo_perdidas';
  severity: AlertSeverity;
  titulo: string;
  mensaje: string;
  valor: string;
  umbral: string;
  ruta: string;
  entidad?: string;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

function generateReportData() {
  const vehiculos: VehicleProfitability[] = [
    { matricula: '4521 BCD', marcaModelo: 'Seat León 2015', fechaEntrada: '2026-01-15', costeCompra: 800, costesAdicionales: 120, ingresoPiezas: 1840, piezasTotales: 24, piezasVendidas: 18, piezasStock: 6, margenEur: 920, margenPct: 100, diasEnCampa: 89, roi: 100 },
    { matricula: '7832 FGH', marcaModelo: 'Renault Mégane 2012', fechaEntrada: '2026-02-03', costeCompra: 400, costesAdicionales: 85, ingresoPiezas: 750, piezasTotales: 15, piezasVendidas: 12, piezasStock: 3, margenEur: 265, margenPct: 54.6, diasEnCampa: 70, roi: 54.6 },
    { matricula: '1190 KLM', marcaModelo: 'Peugeot 308 2018', fechaEntrada: '2026-03-10', costeCompra: 1200, costesAdicionales: 180, ingresoPiezas: 980, piezasTotales: 30, piezasVendidas: 8, piezasStock: 22, margenEur: -400, margenPct: -29, diasEnCampa: 35, roi: -29 },
    { matricula: '6654 NPQ', marcaModelo: 'Ford Focus 2014', fechaEntrada: '2026-01-28', costeCompra: 350, costesAdicionales: 65, ingresoPiezas: 620, piezasTotales: 15, piezasVendidas: 14, piezasStock: 1, margenEur: 205, margenPct: 49.4, diasEnCampa: 76, roi: 49.4 },
    { matricula: '3301 RST', marcaModelo: 'Opel Astra 2016', fechaEntrada: '2026-04-02', costeCompra: 600, costesAdicionales: 90, ingresoPiezas: 0, piezasTotales: 28, piezasVendidas: 0, piezasStock: 28, margenEur: -690, margenPct: -100, diasEnCampa: 12, roi: -100 },
    { matricula: '8823 VWX', marcaModelo: 'VW Golf VII 2017', fechaEntrada: '2026-04-09', costeCompra: 950, costesAdicionales: 140, ingresoPiezas: 320, piezasTotales: 32, piezasVendidas: 4, piezasStock: 28, margenEur: -770, margenPct: -70.6, diasEnCampa: 5, roi: -70.6 },
    { matricula: '5541 YZA', marcaModelo: 'Citroën C4 2015', fechaEntrada: '2026-03-22', costeCompra: 500, costesAdicionales: 75, ingresoPiezas: 890, piezasTotales: 20, piezasVendidas: 15, piezasStock: 5, margenEur: 315, margenPct: 54.8, diasEnCampa: 23, roi: 54.8 },
    { matricula: '2209 BCD', marcaModelo: 'Toyota Auris 2013', fechaEntrada: '2026-02-18', costeCompra: 300, costesAdicionales: 50, ingresoPiezas: 540, piezasTotales: 12, piezasVendidas: 10, piezasStock: 2, margenEur: 190, margenPct: 54.3, diasEnCampa: 55, roi: 54.3 },
  ];

  const rotacionPiezas: PartRotation[] = [
    { categoria: 'Motor', stock: 45, vendidas30d: 12, rotacion: 26.7, diasMedioVenta: 18, valorStock: 8500, ingresos30d: 3200 },
    { categoria: 'Carrocería', stock: 120, vendidas30d: 28, rotacion: 23.3, diasMedioVenta: 22, valorStock: 14400, ingresos30d: 4100 },
    { categoria: 'Electricidad', stock: 85, vendidas30d: 22, rotacion: 25.9, diasMedioVenta: 15, valorStock: 5100, ingresos30d: 2640 },
    { categoria: 'Suspensión', stock: 60, vendidas30d: 8, rotacion: 13.3, diasMedioVenta: 35, valorStock: 3600, ingresos30d: 960 },
    { categoria: 'Interior', stock: 95, vendidas30d: 15, rotacion: 15.8, diasMedioVenta: 28, valorStock: 4750, ingresos30d: 1500 },
    { categoria: 'Transmisión', stock: 30, vendidas30d: 5, rotacion: 16.7, diasMedioVenta: 30, valorStock: 4500, ingresos30d: 1250 },
    { categoria: 'Frenos', stock: 70, vendidas30d: 18, rotacion: 25.7, diasMedioVenta: 14, valorStock: 3500, ingresos30d: 1620 },
  ];

  const trabajadores: WorkerProductivity[] = [
    { nombre: 'Juan Martínez', avatar: 'JM', horasTrabajadas: 168, piezasExtraidas: 480, piezasVendidas: 120, ventasEur: 9740, incidencias: 2, productividadPorHora: 2.86, costeHora: 14.50, margenGenerado: 4870, },
    { nombre: 'Ana Pérez', avatar: 'AP', horasTrabajadas: 160, piezasExtraidas: 360, piezasVendidas: 85, ventasEur: 6800, incidencias: 1, productividadPorHora: 2.25, costeHora: 13.00, margenGenerado: 3400, },
    { nombre: 'Carlos Ruiz', avatar: 'CR', horasTrabajadas: 172, piezasExtraidas: 240, piezasVendidas: 160, ventasEur: 12480, incidencias: 0, productividadPorHora: 1.40, costeHora: 15.00, margenGenerado: 6240, },
    { nombre: 'María García', avatar: 'MG', horasTrabajadas: 152, piezasExtraidas: 120, piezasVendidas: 45, ventasEur: 3250, incidencias: 4, productividadPorHora: 0.79, costeHora: 12.00, margenGenerado: 1625, },
  ];

  const evolucionMensual: MonthlyData[] = [
    { mes: '2025-11', label: 'Nov', vehiculosEntrados: 8, piezasVendidas: 95, ingresos: 12400, costes: 7200, margen: 5200, margenPct: 41.9 },
    { mes: '2025-12', label: 'Dic', vehiculosEntrados: 6, piezasVendidas: 78, ingresos: 9800, costes: 5800, margen: 4000, margenPct: 40.8 },
    { mes: '2026-01', label: 'Ene', vehiculosEntrados: 10, piezasVendidas: 110, ingresos: 14200, costes: 8400, margen: 5800, margenPct: 40.8 },
    { mes: '2026-02', label: 'Feb', vehiculosEntrados: 9, piezasVendidas: 102, ingresos: 13100, costes: 7900, margen: 5200, margenPct: 39.7 },
    { mes: '2026-03', label: 'Mar', vehiculosEntrados: 12, piezasVendidas: 128, ingresos: 16800, costes: 9600, margen: 7200, margenPct: 42.9 },
    { mes: '2026-04', label: 'Abr', vehiculosEntrados: 5, piezasVendidas: 48, ingresos: 6240, costes: 3800, margen: 2440, margenPct: 39.1 },
  ];

  const desgloseCostes: CostBreakdown[] = [
    { concepto: 'Compra de vehículos', importe: 28600, porcentaje: 54.2, color: '#3b82f6' },
    { concepto: 'Personal (nóminas)', importe: 12480, porcentaje: 23.7, color: '#8b5cf6' },
    { concepto: 'Transporte / grúa', importe: 3200, porcentaje: 6.1, color: '#f59e0b' },
    { concepto: 'Tasas y documentación', importe: 2100, porcentaje: 4.0, color: '#ef4444' },
    { concepto: 'Almacén y logística', importe: 2800, porcentaje: 5.3, color: '#10b981' },
    { concepto: 'Residuos y medio ambiente', importe: 1600, porcentaje: 3.0, color: '#06b6d4' },
    { concepto: 'Otros gastos operativos', importe: 1940, porcentaje: 3.7, color: '#ec4899' },
  ];

  const totalIngresos = evolucionMensual.reduce((s, m) => s + m.ingresos, 0);
  const totalCostes = evolucionMensual.reduce((s, m) => s + m.costes, 0);
  const totalMargen = totalIngresos - totalCostes;
  const margenGlobalPct = totalIngresos > 0 ? ((totalMargen / totalIngresos) * 100) : 0;
  const totalVehiculos = evolucionMensual.reduce((s, m) => s + m.vehiculosEntrados, 0);
  const totalPiezasVendidas = evolucionMensual.reduce((s, m) => s + m.piezasVendidas, 0);
  const totalPiezasStock = rotacionPiezas.reduce((s, r) => s + r.stock, 0);
  const stockParado = 42;
  const valorStockParado = 6240;
  const rotacionMedia = rotacionPiezas.reduce((s, r) => s + r.rotacion, 0) / rotacionPiezas.length;
  const totalCosteAcumulado = desgloseCostes.reduce((s, c) => s + c.importe, 0);

  const ventasMes = evolucionMensual[evolucionMensual.length - 1];
  const ventasMesAnterior = evolucionMensual[evolucionMensual.length - 2];
  const deltaVentas = ventasMesAnterior.ingresos > 0
    ? ((ventasMes.ingresos - ventasMesAnterior.ingresos) / ventasMesAnterior.ingresos * 100)
    : 0;
  const deltaMargen = ventasMesAnterior.margenPct > 0
    ? (ventasMes.margenPct - ventasMesAnterior.margenPct)
    : 0;

  const alertas: BusinessAlert[] = [];

  vehiculos.filter(v => v.margenPct < 0 && v.piezasVendidas > 0).forEach(v => {
    alertas.push({
      id: `margin-${v.matricula}`,
      tipo: 'vehiculo_perdidas',
      severity: 'critical',
      titulo: 'Vehículo en pérdidas',
      mensaje: `${v.marcaModelo} (${v.matricula}) acumula ${formatEur(Math.abs(v.margenEur))} en pérdidas`,
      valor: `${v.margenPct.toFixed(1)}%`,
      umbral: '0%',
      ruta: '/saas/scrapyard-vehicles',
      entidad: v.matricula,
    });
  });

  if (stockParado > 30) {
    alertas.push({
      id: 'stock-excess',
      tipo: 'stock_parado',
      severity: 'critical',
      titulo: 'Exceso de stock parado',
      mensaje: `${stockParado} piezas sin movimiento >30 días. Valor inmovilizado: ${formatEur(valorStockParado)}`,
      valor: `${stockParado} piezas`,
      umbral: '30 piezas',
      ruta: '/saas/scrapyard-inventory',
    });
  }

  rotacionPiezas.filter(r => r.rotacion < 15).forEach(r => {
    alertas.push({
      id: `rot-${r.categoria}`,
      tipo: 'baja_rotacion',
      severity: 'warning',
      titulo: `Baja rotación: ${r.categoria}`,
      mensaje: `La categoría ${r.categoria} tiene una rotación del ${r.rotacion.toFixed(1)}% (media venta: ${r.diasMedioVenta} días)`,
      valor: `${r.rotacion.toFixed(1)}%`,
      umbral: '15%',
      ruta: '/saas/scrapyard-inventory',
      entidad: r.categoria,
    });
  });

  vehiculos.filter(v => v.costeCompra > 1000).forEach(v => {
    alertas.push({
      id: `cost-${v.matricula}`,
      tipo: 'coste_alto',
      severity: 'warning',
      titulo: 'Coste de entrada alto',
      mensaje: `${v.marcaModelo} (${v.matricula}): coste total ${formatEur(v.costeCompra + v.costesAdicionales)}`,
      valor: formatEur(v.costeCompra + v.costesAdicionales),
      umbral: '1.000 €',
      ruta: '/saas/scrapyard-vehicles',
      entidad: v.matricula,
    });
  });

  if (margenGlobalPct < 35) {
    alertas.push({
      id: 'margin-global',
      tipo: 'margen_bajo',
      severity: 'warning',
      titulo: 'Margen global por debajo del objetivo',
      mensaje: `El margen global actual es ${margenGlobalPct.toFixed(1)}%, por debajo del objetivo del 35%`,
      valor: `${margenGlobalPct.toFixed(1)}%`,
      umbral: '35%',
      ruta: '/saas/finance',
    });
  }

  return {
    vehiculos,
    rotacionPiezas,
    trabajadores,
    evolucionMensual,
    desgloseCostes,
    totalIngresos,
    totalCostes,
    totalMargen,
    margenGlobalPct,
    totalVehiculos,
    totalPiezasVendidas,
    totalPiezasStock,
    stockParado,
    valorStockParado,
    rotacionMedia,
    totalCosteAcumulado,
    ventasMes,
    deltaVentas,
    deltaMargen,
    alertas,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES')} €`;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const ALERT_SEVERITY_STYLES: Record<AlertSeverity, { border: string; bg: string; text: string; icon: string; badge: string }> = {
  critical: { border: 'border-l-red-500', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400', icon: 'text-red-500', badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  warning:  { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-500', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  info:     { border: 'border-l-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
};

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
  { value: '6m', label: '6 meses' },
  { value: '1y', label: '1 año' },
];

const REPORT_TABS: { value: ReportTab; label: string; icon: React.ReactNode; gerenteOnly?: boolean }[] = [
  { value: 'resumen', label: 'Resumen', icon: <BarChart3 className="w-4 h-4" /> },
  { value: 'vehiculos', label: 'Vehículos', icon: <Car className="w-4 h-4" />, gerenteOnly: true },
  { value: 'piezas', label: 'Piezas', icon: <Package className="w-4 h-4" /> },
  { value: 'trabajadores', label: 'Trabajadores', icon: <Users className="w-4 h-4" />, gerenteOnly: true },
  { value: 'costes', label: 'Costes', icon: <Wallet className="w-4 h-4" />, gerenteOnly: true },
  { value: 'alertas', label: 'Alertas', icon: <Bell className="w-4 h-4" /> },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function KPICard({ title, value, sub, icon, iconBg, iconColor, trend, onClick }: {
  title: string; value: string; sub: string; icon: React.ReactNode;
  iconBg: string; iconColor: string;
  trend?: { value: string; up: boolean | null };
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all group">
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
            <div className={`w-8 h-8 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <span className={iconColor}>{icon}</span>
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 leading-none">{value}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {trend && (
              <span className={`flex items-center gap-0.5 text-[11px] font-bold ${
                trend.up === true ? 'text-emerald-600' : trend.up === false ? 'text-red-500' : 'text-gray-400'
              }`}>
                {trend.up === true ? <ArrowUpRight className="w-3 h-3" /> : trend.up === false ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {trend.value}
              </span>
            )}
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function SectionCard({ title, icon, badge, action, children }: {
  title: string; icon: React.ReactNode; badge?: React.ReactNode;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">{icon}</span>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</p>
          {badge}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function NavLink({ label, route }: { label: string; route: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(route)}
      className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
    >
      {label} <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}

function MarginBadge({ value }: { value: number }) {
  const color = value > 50 ? 'text-emerald-600' : value > 20 ? 'text-blue-600' : value > 0 ? 'text-amber-600' : 'text-red-600';
  return (
    <span className={`text-xs font-black ${color}`}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>
      {label}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export function ScrapyardReports() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [role, setRole] = useState<UserRole>('gerente');
  const [activeTab, setActiveTab] = useState<ReportTab>('resumen');
  const [datePreset, setDatePreset] = useState<DatePreset>('6m');
  const [filterSede, setFilterSede] = useState('todas');
  const [filterVehiculo, setFilterVehiculo] = useState('');
  const [filterPieza, setFilterPieza] = useState('');
  const [filterTrabajador, setFilterTrabajador] = useState('todos');
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate] = useState(new Date());
  const [showAlerts, setShowAlerts] = useState(true);
  const [vehicleSort, setVehicleSort] = useState<'margen' | 'ingresos' | 'roi'>('margen');
  const [vehicleSortDir, setVehicleSortDir] = useState<'asc' | 'desc'>('desc');

  const data = useMemo(() => generateReportData(), []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const visibleTabs = role === 'gerente'
    ? REPORT_TABS
    : REPORT_TABS.filter(t => !t.gerenteOnly);

  const sortedVehicles = useMemo(() => {
    const sorted = [...data.vehiculos];
    sorted.sort((a, b) => {
      const key = vehicleSort === 'margen' ? 'margenPct' : vehicleSort === 'ingresos' ? 'ingresoPiezas' : 'roi';
      return vehicleSortDir === 'desc' ? b[key] - a[key] : a[key] - b[key];
    });
    if (filterVehiculo) {
      const q = filterVehiculo.toLowerCase();
      return sorted.filter(v => v.matricula.toLowerCase().includes(q) || v.marcaModelo.toLowerCase().includes(q));
    }
    return sorted;
  }, [data.vehiculos, vehicleSort, vehicleSortDir, filterVehiculo]);

  const filteredWorkers = useMemo(() => {
    if (filterTrabajador === 'todos') return data.trabajadores;
    return data.trabajadores.filter(w => w.nombre === filterTrabajador);
  }, [data.trabajadores, filterTrabajador]);

  const criticalAlerts = data.alertas.filter(a => a.severity === 'critical').length;
  const warningAlerts = data.alertas.filter(a => a.severity === 'warning').length;

  // ─── Quick navigation links ───────────────────────────────────────
  const connections = [
    { label: 'Dashboard', route: '/saas/dashboard', icon: <BarChart3 className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Vehículos', route: '/saas/scrapyard-vehicles', icon: <Truck className="w-4 h-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Piezas', route: '/saas/scrapyard-parts', icon: <Wrench className="w-4 h-4" />, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    { label: 'Stock', route: '/saas/scrapyard-inventory', icon: <Boxes className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Ventas', route: '/saas/scrapyard-sales', icon: <Receipt className="w-4 h-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Trabajadores', route: '/saas/vertical/desguaces/trabajadores', icon: <Users className="w-4 h-4" />, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
    { label: 'Finanzas', route: '/saas/finance', icon: <Wallet className="w-4 h-4" />, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
  ];

  return (
    <Layout title="Informes y Rentabilidad" subtitle="Desguace — Analítica de negocio">
      <div className="flex flex-col gap-4">

        {/* ── Header: role toggle + date + filters + status ── */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Role toggle */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                <button
                  onClick={() => { setRole('gerente'); setActiveTab('resumen'); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    role === 'gerente'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" /> Gerente
                </button>
                <button
                  onClick={() => { setRole('trabajador'); setActiveTab('resumen'); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    role === 'trabajador'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" /> Trabajador
                </button>
              </div>

              {/* Date preset */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setDatePreset(p.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      datePreset === p.value
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                  showFilters
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                <Filter className="w-3.5 h-3.5" /> Filtros
                <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Status + actions */}
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 transition-all">
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>
              {refreshing ? (
                <span className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Actualizando...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  En vivo · {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="flex items-center gap-2 flex-wrap p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <select value={filterSede} onChange={e => setFilterSede(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400">
                <option value="todas">Todas las sedes</option>
                <option value="central">Sede Central</option>
                <option value="norte">Sede Norte</option>
              </select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input
                  value={filterVehiculo}
                  onChange={e => setFilterVehiculo(e.target.value)}
                  placeholder="Filtrar vehículo..."
                  className="pl-7 pr-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 w-40"
                />
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input
                  value={filterPieza}
                  onChange={e => setFilterPieza(e.target.value)}
                  placeholder="Filtrar pieza..."
                  className="pl-7 pr-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 w-40"
                />
              </div>
              <select value={filterTrabajador} onChange={e => setFilterTrabajador(e.target.value)} className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400">
                <option value="todos">Todos los trabajadores</option>
                {data.trabajadores.map(w => (
                  <option key={w.nombre} value={w.nombre}>{w.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Tab navigation ── */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon} {tab.label}
              {tab.value === 'alertas' && data.alertas.length > 0 && (
                <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[9px] font-bold rounded-full">
                  {data.alertas.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ TAB: RESUMEN ═══ */}
        {activeTab === 'resumen' && (
          <>
            {/* KPIs principales */}
            <div className={`grid gap-3 ${role === 'gerente' ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-3'}`}>
              <KPICard
                title="Vehículos entrados"
                value={String(data.totalVehiculos)}
                sub="Periodo seleccionado"
                icon={<Truck className="w-4 h-4" />}
                iconBg="bg-blue-100 dark:bg-blue-900/40"
                iconColor="text-blue-600"
                trend={{ value: `${data.ventasMes.vehiculosEntrados} este mes`, up: true }}
                onClick={() => navigate('/saas/scrapyard-vehicles')}
              />
              <KPICard
                title="Piezas vendidas"
                value={data.totalPiezasVendidas.toLocaleString('es-ES')}
                sub={`${data.ventasMes.piezasVendidas} este mes`}
                icon={<Receipt className="w-4 h-4" />}
                iconBg="bg-emerald-100 dark:bg-emerald-900/40"
                iconColor="text-emerald-600"
                trend={{ value: `${data.deltaVentas > 0 ? '+' : ''}${data.deltaVentas.toFixed(1)}% vs mes ant.`, up: data.deltaVentas > 0 }}
                onClick={() => navigate('/saas/scrapyard-sales')}
              />
              <KPICard
                title="Piezas en stock"
                value={data.totalPiezasStock.toLocaleString('es-ES')}
                sub={`${data.stockParado} paradas (>30d)`}
                icon={<Package className="w-4 h-4" />}
                iconBg="bg-blue-100 dark:bg-blue-900/40"
                iconColor="text-blue-600"
                trend={data.stockParado > 30 ? { value: 'Stock parado alto', up: false } : undefined}
                onClick={() => navigate('/saas/scrapyard-inventory')}
              />
              {role === 'gerente' && (
                <>
                  <KPICard
                    title="Ventas del mes"
                    value={formatCompact(data.ventasMes.ingresos)}
                    sub={`Margen: ${data.ventasMes.margenPct.toFixed(1)}%`}
                    icon={<Euro className="w-4 h-4" />}
                    iconBg="bg-emerald-100 dark:bg-emerald-900/40"
                    iconColor="text-emerald-600"
                    trend={{ value: `${data.deltaVentas > 0 ? '+' : ''}${data.deltaVentas.toFixed(1)}%`, up: data.deltaVentas > 0 }}
                    onClick={() => navigate('/saas/scrapyard-sales')}
                  />
                  <KPICard
                    title="Margen global"
                    value={`${data.margenGlobalPct.toFixed(1)}%`}
                    sub={formatCompact(data.totalMargen)}
                    icon={<TrendingUp className="w-4 h-4" />}
                    iconBg={data.margenGlobalPct > 35 ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}
                    iconColor={data.margenGlobalPct > 35 ? 'text-emerald-600' : 'text-amber-600'}
                    trend={{ value: `${data.deltaMargen > 0 ? '+' : ''}${data.deltaMargen.toFixed(1)}pp`, up: data.deltaMargen > 0 }}
                    onClick={() => navigate('/saas/finance')}
                  />
                </>
              )}
            </div>

            {/* Second row KPIs (gerente only) */}
            {role === 'gerente' && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <KPICard
                  title="Stock parado"
                  value={String(data.stockParado)}
                  sub={`Valor: ${formatCompact(data.valorStockParado)}`}
                  icon={<AlertTriangle className="w-4 h-4" />}
                  iconBg={data.stockParado > 30 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}
                  iconColor={data.stockParado > 30 ? 'text-red-600' : 'text-amber-600'}
                  trend={data.stockParado > 30 ? { value: 'Requiere atención', up: false } : undefined}
                  onClick={() => navigate('/saas/scrapyard-inventory')}
                />
                <KPICard
                  title="Rotación media"
                  value={`${data.rotacionMedia.toFixed(1)}%`}
                  sub="Piezas vendidas / stock"
                  icon={<RotateCcw className="w-4 h-4" />}
                  iconBg="bg-cyan-100 dark:bg-cyan-900/40"
                  iconColor="text-cyan-600"
                  trend={{ value: data.rotacionMedia > 20 ? 'Saludable' : 'Baja rotación', up: data.rotacionMedia > 20 }}
                />
                <KPICard
                  title="Costes acumulados"
                  value={formatCompact(data.totalCosteAcumulado)}
                  sub="Total periodo"
                  icon={<Wallet className="w-4 h-4" />}
                  iconBg="bg-violet-100 dark:bg-violet-900/40"
                  iconColor="text-violet-600"
                  onClick={() => setActiveTab('costes')}
                />
                <KPICard
                  title="Beneficio neto"
                  value={formatCompact(data.totalMargen)}
                  sub={`Ingresos: ${formatCompact(data.totalIngresos)}`}
                  icon={<DollarSign className="w-4 h-4" />}
                  iconBg="bg-emerald-100 dark:bg-emerald-900/40"
                  iconColor="text-emerald-600"
                  trend={{ value: `ROI: ${((data.totalMargen / data.totalCostes) * 100).toFixed(0)}%`, up: data.totalMargen > 0 }}
                />
                <KPICard
                  title="Alertas activas"
                  value={String(data.alertas.length)}
                  sub={`${criticalAlerts} críticas · ${warningAlerts} avisos`}
                  icon={<Bell className="w-4 h-4" />}
                  iconBg={criticalAlerts > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-700'}
                  iconColor={criticalAlerts > 0 ? 'text-red-600' : 'text-gray-400'}
                  onClick={() => setActiveTab('alertas')}
                />
              </div>
            )}

            {/* Charts row (gerente) */}
            {role === 'gerente' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Evolución ingresos vs costes */}
                <SectionCard
                  title="Evolución: Ingresos vs Costes"
                  icon={<BarChart3 className="w-4 h-4" />}
                  badge={<span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">6 meses</span>}
                >
                  <div className="p-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.evolucionMensual} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as MonthlyData;
                            return (
                              <div className="bg-gray-900 text-white text-[10px] font-semibold px-3 py-2 rounded-lg shadow-lg space-y-1">
                                <div className="opacity-60">{d.label} 2026</div>
                                <div>Ingresos: {formatEur(d.ingresos)}</div>
                                <div>Costes: {formatEur(d.costes)}</div>
                                <div>Margen: {formatEur(d.margen)} ({d.margenPct.toFixed(1)}%)</div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="ingresos" name="Ingresos" radius={[3, 3, 0, 0]} maxBarSize={24} fill="#10b981" fillOpacity={0.8} />
                        <Bar dataKey="costes" name="Costes" radius={[3, 3, 0, 0]} maxBarSize={24} fill="#ef4444" fillOpacity={0.5} />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconSize={8} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>

                {/* Evolución margen */}
                <SectionCard
                  title="Evolución del margen (%)"
                  icon={<TrendingUp className="w-4 h-4" />}
                  badge={<span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full">Tendencia</span>}
                >
                  <div className="p-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.evolucionMensual} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <defs>
                          <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[30, 50]} tickFormatter={v => `${v}%`} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as MonthlyData;
                            return (
                              <div className="bg-gray-900 text-white text-[10px] font-semibold px-3 py-2 rounded-lg shadow-lg">
                                {d.label}: <span className="text-emerald-300">{d.margenPct.toFixed(1)}%</span> ({formatEur(d.margen)})
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="margenPct" stroke="#10b981" strokeWidth={2.5} fill="url(#marginGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>
              </div>
            )}

            {/* Quick links */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {connections.map(c => (
                <button
                  key={c.label}
                  onClick={() => navigate(c.route)}
                  className={`${c.bg} rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-all`}
                >
                  <span className={c.color}>{c.icon}</span>
                  <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">{c.label}</span>
                </button>
              ))}
            </div>

            {/* Top 5 vehicles profitability preview (gerente) */}
            {role === 'gerente' && (
              <SectionCard
                title="Top rentabilidad por vehículo"
                icon={<Car className="w-4 h-4" />}
                badge={<span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded-full">Periodo</span>}
                action={<button onClick={() => setActiveTab('vehiculos')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Ver todos <ArrowRight className="w-3.5 h-3.5" /></button>}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Vehículo</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Coste total</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ingresos</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Beneficio</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Margen</th>
                        <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Vendidas/Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {sortedVehicles.slice(0, 5).map(v => (
                        <tr key={v.matricula} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                                <Car className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <span className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{v.matricula}</span>
                                <p className="text-[10px] text-gray-400">{v.marcaModelo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(v.costeCompra + v.costesAdicionales)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(v.ingresoPiezas)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold">
                            <span className={v.margenEur >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatEur(v.margenEur)}</span>
                          </td>
                          <td className="px-3 py-3 text-right"><MarginBadge value={v.margenPct} /></td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{v.piezasVendidas}</span>
                              <span className="text-[10px] text-gray-400">/ {v.piezasTotales}</span>
                              <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-blue-500"
                                  style={{ width: `${(v.piezasVendidas / v.piezasTotales) * 100}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* Worker summary (role: trabajador) */}
            {role === 'trabajador' && (
              <SectionCard
                title="Tu rendimiento este mes"
                icon={<Activity className="w-4 h-4" />}
                badge={<span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full">Abril</span>}
              >
                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 text-center">
                      <p className="text-2xl font-black text-blue-700 dark:text-blue-400">{data.trabajadores[0].piezasExtraidas}</p>
                      <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-500 uppercase mt-1">Piezas extraídas</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 text-center">
                      <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{data.trabajadores[0].piezasVendidas}</p>
                      <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 uppercase mt-1">Ventas realizadas</p>
                    </div>
                    <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-4 text-center">
                      <p className="text-2xl font-black text-violet-700 dark:text-violet-400">{formatCompact(data.trabajadores[0].ventasEur)}</p>
                      <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-500 uppercase mt-1">Facturación</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
                      <p className="text-2xl font-black text-gray-700 dark:text-gray-300">{data.trabajadores[0].horasTrabajadas}h</p>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mt-1">Horas trabajadas</p>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-800/50">
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      <span className="font-bold">Productividad:</span> {data.trabajadores[0].productividadPorHora.toFixed(2)} piezas/hora · {data.trabajadores[0].incidencias} incidencias
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}
          </>
        )}

        {/* ═══ TAB: VEHÍCULOS (solo gerente) ═══ */}
        {activeTab === 'vehiculos' && role === 'gerente' && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500">Ordenar por:</span>
              {([
                { key: 'margen' as const, label: 'Margen' },
                { key: 'ingresos' as const, label: 'Ingresos' },
                { key: 'roi' as const, label: 'ROI' },
              ]).map(s => (
                <button
                  key={s.key}
                  onClick={() => {
                    if (vehicleSort === s.key) setVehicleSortDir(d => d === 'desc' ? 'asc' : 'desc');
                    else { setVehicleSort(s.key); setVehicleSortDir('desc'); }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                    vehicleSort === s.key
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500'
                  }`}
                >
                  {s.label} {vehicleSort === s.key && (vehicleSortDir === 'desc' ? '↓' : '↑')}
                </button>
              ))}
            </div>

            <SectionCard
              title="Beneficio real por vehículo"
              icon={<Car className="w-4 h-4" />}
              badge={<span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded-full">{sortedVehicles.length} vehículos</span>}
              action={<NavLink label="Ver vehículos" route="/saas/scrapyard-vehicles" />}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Vehículo</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Entrada</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Coste compra</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Otros costes</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ingresos piezas</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Beneficio</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Margen %</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Piezas V/T</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Días</th>
                      <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {sortedVehicles.map(v => {
                      const estado = v.margenPct > 20 ? 'rentable' : v.margenPct > 0 ? 'en_proceso' : v.ingresoPiezas === 0 ? 'nuevo' : 'perdidas';
                      return (
                        <tr key={v.matricula} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                estado === 'rentable' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' :
                                estado === 'perdidas' ? 'bg-gradient-to-br from-red-400 to-red-600' :
                                'bg-gradient-to-br from-blue-400 to-blue-600'
                              }`}>
                                <Car className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <span className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{v.matricula}</span>
                                <p className="text-[10px] text-gray-400">{v.marcaModelo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500">{v.fechaEntrada}</td>
                          <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(v.costeCompra)}</td>
                          <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(v.costesAdicionales)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(v.ingresoPiezas)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold">
                            <span className={v.margenEur >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatEur(v.margenEur)}</span>
                          </td>
                          <td className="px-3 py-3 text-right"><MarginBadge value={v.margenPct} /></td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{v.piezasVendidas}</span>
                              <span className="text-[10px] text-gray-400">/ {v.piezasTotales}</span>
                              <div className="w-10 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${(v.piezasVendidas / v.piezasTotales) * 100}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center text-xs text-gray-500">{v.diasEnCampa}d</td>
                          <td className="px-5 py-3 text-right">
                            <StatusPill
                              label={estado === 'rentable' ? 'Rentable' : estado === 'en_proceso' ? 'En proceso' : estado === 'nuevo' ? 'Nuevo' : 'Pérdidas'}
                              color={
                                estado === 'rentable' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                                estado === 'en_proceso' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                                estado === 'nuevo' ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' :
                                'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Summary row */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs font-bold text-gray-500 uppercase">Totales</span>
                <div className="flex items-center gap-6">
                  <span className="text-xs text-gray-500">Coste: <span className="font-bold text-gray-900 dark:text-gray-100">{formatEur(data.vehiculos.reduce((s, v) => s + v.costeCompra + v.costesAdicionales, 0))}</span></span>
                  <span className="text-xs text-gray-500">Ingresos: <span className="font-bold text-emerald-600">{formatEur(data.vehiculos.reduce((s, v) => s + v.ingresoPiezas, 0))}</span></span>
                  <span className="text-xs text-gray-500">Beneficio: <span className="font-bold text-emerald-600">{formatEur(data.vehiculos.reduce((s, v) => s + v.margenEur, 0))}</span></span>
                </div>
              </div>
            </SectionCard>

            {/* Vehicle profit chart */}
            <SectionCard
              title="Beneficio por vehículo (visual)"
              icon={<BarChart3 className="w-4 h-4" />}
            >
              <div className="p-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortedVehicles} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="matricula" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}€`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const v = payload[0].payload as VehicleProfitability;
                        return (
                          <div className="bg-gray-900 text-white text-[10px] font-semibold px-3 py-2 rounded-lg shadow-lg space-y-0.5">
                            <div className="opacity-60">{v.marcaModelo}</div>
                            <div>Beneficio: {formatEur(v.margenEur)}</div>
                            <div>Margen: {v.margenPct.toFixed(1)}%</div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="margenEur" name="Beneficio" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {sortedVehicles.map((v, i) => (
                        <Cell key={v.matricula} fill={v.margenEur >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </>
        )}

        {/* ═══ TAB: PIEZAS ═══ */}
        {activeTab === 'piezas' && (
          <>
            <SectionCard
              title="Rotación de piezas por categoría"
              icon={<RotateCcw className="w-4 h-4" />}
              badge={<span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded-full">Últimos 30 días</span>}
              action={<NavLink label="Ver inventario" route="/saas/scrapyard-inventory" />}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Categoría</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Stock</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Vendidas (30d)</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Rotación %</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Media venta</th>
                      {role === 'gerente' && (
                        <>
                          <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Valor stock</th>
                          <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ingresos 30d</th>
                        </>
                      )}
                      <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {data.rotacionPiezas.map(r => (
                      <tr key={r.categoria} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[data.rotacionPiezas.indexOf(r) % CHART_COLORS.length] }} />
                            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{r.categoria}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{r.stock}</td>
                        <td className="px-3 py-3 text-center text-xs font-bold text-emerald-600">{r.vendidas30d}</td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`text-xs font-black ${r.rotacion > 20 ? 'text-emerald-600' : r.rotacion > 15 ? 'text-amber-600' : 'text-red-600'}`}>
                              {r.rotacion.toFixed(1)}%
                            </span>
                            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${r.rotacion > 20 ? 'bg-emerald-500' : r.rotacion > 15 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(r.rotacion * 2.5, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-gray-500">{r.diasMedioVenta}d</td>
                        {role === 'gerente' && (
                          <>
                            <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(r.valorStock)}</td>
                            <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(r.ingresos30d)}</td>
                          </>
                        )}
                        <td className="px-5 py-3 text-right">
                          <StatusPill
                            label={r.rotacion > 20 ? 'Alta' : r.rotacion > 15 ? 'Media' : 'Baja'}
                            color={
                              r.rotacion > 20 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                              r.rotacion > 15 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                              'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs font-bold text-gray-500 uppercase">Totales</span>
                <div className="flex items-center gap-6">
                  <span className="text-xs text-gray-500">Stock: <span className="font-bold text-gray-900 dark:text-gray-100">{data.rotacionPiezas.reduce((s, r) => s + r.stock, 0)}</span></span>
                  <span className="text-xs text-gray-500">Vendidas: <span className="font-bold text-emerald-600">{data.rotacionPiezas.reduce((s, r) => s + r.vendidas30d, 0)}</span></span>
                  <span className="text-xs text-gray-500">Rotación media: <span className="font-bold text-cyan-600">{data.rotacionMedia.toFixed(1)}%</span></span>
                </div>
              </div>
            </SectionCard>

            {/* Rotation chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Rotación por categoría" icon={<BarChart3 className="w-4 h-4" />}>
                <div className="p-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.rotacionPiezas} layout="vertical" margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                      <YAxis dataKey="categoria" type="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const r = payload[0].payload as PartRotation;
                          return (
                            <div className="bg-gray-900 text-white text-[10px] font-semibold px-3 py-2 rounded-lg shadow-lg">
                              {r.categoria}: {r.rotacion.toFixed(1)}% · {r.vendidas30d} vendidas / {r.stock} stock
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="rotacion" name="Rotación %" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {data.rotacionPiezas.map((r, i) => (
                          <Cell key={r.categoria} fill={r.rotacion > 20 ? '#10b981' : r.rotacion > 15 ? '#f59e0b' : '#ef4444'} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard title="Distribución de stock por categoría" icon={<Layers className="w-4 h-4" />}>
                <div className="p-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.rotacionPiezas}
                        dataKey="stock"
                        nameKey="categoria"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={50}
                        paddingAngle={2}
                      >
                        {data.rotacionPiezas.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const r = payload[0].payload as PartRotation;
                          return (
                            <div className="bg-gray-900 text-white text-[10px] font-semibold px-3 py-2 rounded-lg shadow-lg">
                              {r.categoria}: {r.stock} unidades ({formatEur(r.valorStock)})
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {/* ═══ TAB: TRABAJADORES (solo gerente) ═══ */}
        {activeTab === 'trabajadores' && role === 'gerente' && (
          <>
            <SectionCard
              title="Productividad por trabajador"
              icon={<Users className="w-4 h-4" />}
              badge={<span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full">Este mes</span>}
              action={<NavLink label="Ver equipo" route="/saas/vertical/desguaces/trabajadores" />}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Trabajador</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Horas</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Piezas extraídas</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Piezas vendidas</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ventas €</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Piez/hora</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Coste/hora</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Margen generado</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Incidencias</th>
                      <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Rendimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {filteredWorkers.map(w => {
                      const rendimiento = w.productividadPorHora > 2 ? 'alto' : w.productividadPorHora > 1 ? 'medio' : 'bajo';
                      return (
                        <tr key={w.nombre} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                {w.avatar}
                              </div>
                              <span className="font-semibold text-gray-900 dark:text-gray-100 text-xs">{w.nombre}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center text-xs text-gray-600 dark:text-gray-400">{w.horasTrabajadas}h</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{w.piezasExtraidas}</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{w.piezasVendidas}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(w.ventasEur)}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-xs font-black ${w.productividadPorHora > 2 ? 'text-emerald-600' : w.productividadPorHora > 1 ? 'text-amber-600' : 'text-red-600'}`}>
                              {w.productividadPorHora.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(w.costeHora)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(w.margenGenerado)}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-xs font-bold ${w.incidencias > 2 ? 'text-red-600' : w.incidencias > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {w.incidencias}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <StatusPill
                              label={rendimiento === 'alto' ? 'Alto' : rendimiento === 'medio' ? 'Medio' : 'Bajo'}
                              color={
                                rendimiento === 'alto' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                                rendimiento === 'medio' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                                'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs font-bold text-gray-500 uppercase">Totales equipo</span>
                <div className="flex items-center gap-6">
                  <span className="text-xs text-gray-500">Horas: <span className="font-bold text-gray-900 dark:text-gray-100">{data.trabajadores.reduce((s, w) => s + w.horasTrabajadas, 0)}h</span></span>
                  <span className="text-xs text-gray-500">Ventas: <span className="font-bold text-emerald-600">{formatEur(data.trabajadores.reduce((s, w) => s + w.ventasEur, 0))}</span></span>
                  <span className="text-xs text-gray-500">Margen: <span className="font-bold text-emerald-600">{formatEur(data.trabajadores.reduce((s, w) => s + w.margenGenerado, 0))}</span></span>
                </div>
              </div>
            </SectionCard>

            {/* Worker comparison chart */}
            <SectionCard title="Comparativa: ventas vs productividad" icon={<BarChart3 className="w-4 h-4" />}>
              <div className="p-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trabajadores} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="nombre" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}€`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const w = payload[0].payload as WorkerProductivity;
                        return (
                          <div className="bg-gray-900 text-white text-[10px] font-semibold px-3 py-2 rounded-lg shadow-lg space-y-0.5">
                            <div className="opacity-60">{w.nombre}</div>
                            <div>Ventas: {formatEur(w.ventasEur)}</div>
                            <div>Piezas/hora: {w.productividadPorHora.toFixed(2)}</div>
                            <div>Margen generado: {formatEur(w.margenGenerado)}</div>
                          </div>
                        );
                      }}
                    />
                    <Bar yAxisId="left" dataKey="ventasEur" name="Ventas €" radius={[3, 3, 0, 0]} maxBarSize={24} fill="#10b981" fillOpacity={0.8} />
                    <Bar yAxisId="left" dataKey="margenGenerado" name="Margen €" radius={[3, 3, 0, 0]} maxBarSize={24} fill="#3b82f6" fillOpacity={0.6} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconSize={8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </>
        )}

        {/* ═══ TAB: COSTES (solo gerente) ═══ */}
        {activeTab === 'costes' && role === 'gerente' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Cost breakdown table */}
              <SectionCard
                title="Desglose de costes acumulados"
                icon={<Wallet className="w-4 h-4" />}
                badge={<span className="text-[10px] font-bold px-2 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full">Periodo</span>}
                action={<NavLink label="Ver finanzas" route="/saas/finance" />}
              >
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {data.desgloseCostes.map((c, i) => (
                    <div key={c.concepto} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{c.concepto}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{formatEur(c.importe)}</span>
                        <span className="text-[10px] text-gray-400 w-10 text-right">{c.porcentaje.toFixed(1)}%</span>
                        <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${c.porcentaje}%`, backgroundColor: c.color }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-xs font-bold text-gray-500 uppercase">Total costes</span>
                  <span className="text-lg font-black text-gray-900 dark:text-gray-100">{formatEur(data.totalCosteAcumulado)}</span>
                </div>
              </SectionCard>

              {/* Cost pie chart */}
              <SectionCard title="Distribución porcentual" icon={<Percent className="w-4 h-4" />}>
                <div className="p-4 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.desgloseCostes}
                        dataKey="importe"
                        nameKey="concepto"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={55}
                        paddingAngle={2}
                        label={({ concepto, porcentaje }) => `${porcentaje.toFixed(0)}%`}
                      >
                        {data.desgloseCostes.map(c => (
                          <Cell key={c.concepto} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const c = payload[0].payload as CostBreakdown;
                          return (
                            <div className="bg-gray-900 text-white text-[10px] font-semibold px-3 py-2 rounded-lg shadow-lg">
                              {c.concepto}: {formatEur(c.importe)} ({c.porcentaje.toFixed(1)}%)
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>

            {/* Costs evolution */}
            <SectionCard title="Evolución de costes vs ingresos" icon={<Activity className="w-4 h-4" />}>
              <div className="p-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.evolucionMensual} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as MonthlyData;
                        return (
                          <div className="bg-gray-900 text-white text-[10px] font-semibold px-3 py-2 rounded-lg shadow-lg space-y-0.5">
                            <div className="opacity-60">{d.label}</div>
                            <div className="text-emerald-300">Ingresos: {formatEur(d.ingresos)}</div>
                            <div className="text-red-300">Costes: {formatEur(d.costes)}</div>
                            <div>Beneficio: {formatEur(d.margen)}</div>
                          </div>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
                    <Line type="monotone" dataKey="costes" name="Costes" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: '#ef4444' }} />
                    <Line type="monotone" dataKey="margen" name="Beneficio" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconSize={8} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* P&L summary */}
            <SectionCard title="Resumen P&L del periodo" icon={<Euro className="w-4 h-4" />}>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 text-center">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1">Ingresos totales</p>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{formatCompact(data.totalIngresos)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-4 text-center">
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1">Costes totales</p>
                  <p className="text-2xl font-black text-red-700 dark:text-red-400">{formatCompact(data.totalCostes)}</p>
                </div>
                <div className={`${data.totalMargen >= 0 ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-red-50 dark:bg-red-950/30'} rounded-xl p-4 text-center`}>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">Beneficio neto</p>
                  <p className={`text-2xl font-black ${data.totalMargen >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'}`}>
                    {formatCompact(data.totalMargen)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">Margen: {data.margenGlobalPct.toFixed(1)}%</p>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* ═══ TAB: ALERTAS ═══ */}
        {activeTab === 'alertas' && (
          <>
            {/* Alert summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-4 border-2 border-red-200 dark:border-red-800/50 text-center">
                <p className="text-3xl font-black text-red-700 dark:text-red-400">{criticalAlerts}</p>
                <p className="text-[10px] font-bold text-red-600 uppercase mt-1">Críticas</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-4 border-2 border-amber-200 dark:border-amber-800/50 text-center">
                <p className="text-3xl font-black text-amber-700 dark:text-amber-400">{warningAlerts}</p>
                <p className="text-[10px] font-bold text-amber-600 uppercase mt-1">Avisos</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4 border-2 border-blue-200 dark:border-blue-800/50 text-center">
                <p className="text-3xl font-black text-blue-700 dark:text-blue-400">{data.alertas.filter(a => a.severity === 'info').length}</p>
                <p className="text-[10px] font-bold text-blue-600 uppercase mt-1">Informativos</p>
              </div>
            </div>

            {/* Alerts list */}
            <SectionCard
              title="Alertas de negocio activas"
              icon={<Bell className="w-4 h-4" />}
              badge={<span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-full">{data.alertas.length}</span>}
            >
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {data.alertas
                  .sort((a, b) => {
                    const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
                    return order[a.severity] - order[b.severity];
                  })
                  .map(alert => {
                    const s = ALERT_SEVERITY_STYLES[alert.severity];
                    return (
                      <div key={alert.id} className={`flex items-start justify-between px-5 py-4 border-l-4 ${s.border} ${s.bg}`}>
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${s.icon}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{alert.titulo}</p>
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${s.badge}`}>
                                {alert.severity === 'critical' ? 'CRÍTICA' : alert.severity === 'warning' ? 'AVISO' : 'INFO'}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400">{alert.mensaje}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[10px] text-gray-400">Valor actual: <span className="font-bold">{alert.valor}</span></span>
                              <span className="text-[10px] text-gray-400">Umbral: <span className="font-bold">{alert.umbral}</span></span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate(alert.ruta)}
                          className={`flex-shrink-0 flex items-center gap-1 ml-4 text-[11px] font-bold ${s.text} hover:underline`}
                        >
                          Ver <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
              </div>
              {data.alertas.length === 0 && (
                <div className="p-12 text-center">
                  <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No hay alertas activas</p>
                </div>
              )}
            </SectionCard>

            {/* Alert thresholds explanation */}
            {role === 'gerente' && (
              <SectionCard title="Umbrales configurados" icon={<Target className="w-4 h-4" />}>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Margen mínimo', valor: '35%', desc: 'Alerta si el margen global baja del 35%', icon: <Percent className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
                    { label: 'Stock parado', valor: '30 uds', desc: 'Alerta si >30 piezas sin movimiento 30d', icon: <Boxes className="w-4 h-4" />, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
                    { label: 'Rotación mínima', valor: '15%', desc: 'Alerta por categoría con rotación <15%', icon: <RotateCcw className="w-4 h-4" />, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/30' },
                    { label: 'Coste entrada', valor: '1.000 €', desc: 'Alerta si el coste total de entrada supera 1.000 €', icon: <Euro className="w-4 h-4" />, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/30' },
                  ].map(t => (
                    <div key={t.label} className={`${t.bg} rounded-xl p-4`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={t.color}>{t.icon}</span>
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{t.label}</span>
                      </div>
                      <p className="text-lg font-black text-gray-900 dark:text-gray-100">{t.valor}</p>
                      <p className="text-[10px] text-gray-500 mt-1">{t.desc}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </>
        )}

      </div>
    </Layout>
  );
}
