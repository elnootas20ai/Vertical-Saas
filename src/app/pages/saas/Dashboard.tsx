import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { getVerticalDashboard } from '../../lib/verticalDashboardMap';
import { loadVerticalKpiSnapshot, type VerticalKpiSnapshot } from '../../lib/dashboardVerticalKpis';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { CeoMobileHome } from '../../components/saas/CeoMobileHome';
import { useIsMobile } from '../../components/ui/use-mobile';
import { isVertialNativeApp } from '../../lib/vertialPrint/isNativeApp';
import { useModalClose } from '../../hooks/useModalClose';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { fetchDashboardData, type DashboardServerData, type DashboardAlert, type QuickFinance, type SalesClosureKpis } from '../../lib/dashboardApi';
import {
  WorkerPayMonthPanel,
  buildWorkerPayMonthSummary,
  DeliveryOpsInsightsPanel,
  type WorkerPayMonthSummary,
} from '../../verticals/delivery';
import { countsTowardNewClientMetrics } from '../../lib/clientAcquisition';
import {
  listDeliveryOrdersRequest,
  filterDeliveryOrdersRequest,
  listTpvRegisterSessionsRequest,
  listStaffConsumptionsRequest,
  TPV_SESSION_SYNC_EVENT,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type TpvRegisterSession,
} from '../../lib/deliveryApi';
import { useDeliveryOrdersLive } from '../../hooks/useDeliveryOrdersLive';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart,
} from 'recharts';
import { PeriodBadge } from '../../components/ui/PeriodBadge';
import { subDays, eachDayOfInterval, startOfDay, format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { BusinessType } from '../../lib/businessApi';
import { clientsRouteForVertical, DELIVERY_CRM_UI_ENABLED } from '../../lib/deliveryCrmFeature';
import { DELIVERY_CAJA_PATH, RESTAURANT_CAJA_PATH } from '../../lib/retailOpsPaths';

import { isWorkerAccount } from '../../lib/authApi';
import {
  Car, TrendingUp, TrendingDown, FileText, AlertTriangle,
  Clock, Plus, ArrowRight, Euro, ShoppingCart, CalendarCheck,
  Wrench, PackageCheck, Bell, CheckCircle, CreditCard, Activity,
  RefreshCw, Users, Calendar, Settings2, Eye, EyeOff, GripVertical, X,
  Truck, ChefHat, Package, Timer, Hash,
  DollarSign, Wallet, AlertCircle, UserCheck, BarChart3, Briefcase,
  ShieldAlert, PieChart, Zap, Building2, FileBarChart, Boxes,
  ArrowUpRight, ArrowDownRight, Minus, CalendarRange, BookmarkCheck, Receipt,
  LayoutGrid, LayoutDashboard, Scale, UtensilsCrossed, ListChecks, Banknote,
} from 'lucide-react';
import { DashboardFinanceWidget } from '../../components/saas/finance/DashboardFinanceWidget';
import { DashboardLazyPanel } from '../../components/saas/DashboardLazyPanel';
import { LiveBadge } from '../../components/saas/LiveBadge';
import { GeneralDashboard } from '../../components/saas/GeneralDashboard';
import { useDashboardView } from '../../context/DashboardViewContext';
import { usePortfolioPlanAccess } from '../../hooks/usePortfolioPlanAccess';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { isDeliveryBusinessType, loadDeliveryStores } from '../../lib/deliverySetup';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { RestaurantLiveDashboardPanelFromContext } from '../../components/saas/restaurant/RestaurantLiveDashboardPanel';
import { RestaurantDashboardBillingCharts } from '../../verticals/restaurant/RestaurantDashboardBillingCharts';
import { CRM_CLIENTS_SYNC_EVENT } from '../../lib/crmApi';
import { fetchClientAcquisitionSample } from '../../lib/clientAcquisitionSample';
import { listBrandsRequest, type Brand } from '../../lib/brandApi';
import {
  computePortfolioMetrics,
  computePortfolioClientMetrics,
  emptyPortfolioMetrics,
  pickPrimaryPdvIdFromList,
  filterOrdersToPortfolioScope,
  sumDeliveredRevenueOnDay,
  countOrdersCreatedOnDay,
  getDeliveryOrderDeliveredAtIso,
  isDeliveryOrderDelivered,
  deliveryOrderRevenueAmount,
  applyTpvCashMetrics,
  buildStoreOpsPulse,
  listTrailingDayKeys,
  listMonthToDateDayKeys,
  type PortfolioMetrics,
  type StoreOpsPulse,
} from '../../lib/portfolioMetrics';
import { PortfolioOpsPulse } from '../../components/saas/PortfolioOpsPulse';
import { CompanyBrandPerformancePanel } from '../../components/saas/CompanyBrandPerformancePanel';
import { localCalendarDayKey, localDayBoundsForKey } from '../../lib/tpvCajaScope';
import {
  buildSoldProductDailySeries,
  resolveActiveSoldFamilies,
  soldProductCountsForDay,
  brandHeroSoldCountsForDay,
  type SoldProductFamilyMeta,
} from '../../lib/deliverySoldProductStats';
import { coreEbitdaSubtitle } from '../../lib/ebitdaMetrics';
import { useCoreEbitdaMonth } from '../../hooks/useCoreEbitdaMonth';
import { useDashboardPlanAccess } from '../../hooks/useDashboardPlanAccess';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { VertialBillingUpgradeLink } from '../../components/saas/VertialBillingUpgradeLink';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';

/** Evita «Cargando…» eterno si una request de ola cuelga en producción. */
const DELIVERY_DASHBOARD_WAVE_TIMEOUT_MS = 14_000;

function withTimeoutFallback<T>(promise: Promise<T>, fallback: T, timeoutMs = DELIVERY_DASHBOARD_WAVE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);
    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        resolve(fallback);
      });
  });
}

// ─── Widget personalización ────────────────────────────────────────────────────

type WidgetId = 'quick_access' | 'charts' | 'operations' | 'quick_finance' | 'funnel';

interface WidgetConfig {
  id: WidgetId;
  label: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'quick_access',  label: 'Accesos rápidos',        visible: true },
  { id: 'charts',        label: 'Gráficas principales',   visible: true },
  { id: 'operations',    label: 'Operativa del negocio',  visible: true },
  { id: 'quick_finance', label: 'Bloque financiero',      visible: true },
  { id: 'funnel',        label: 'Embudo de ventas CRM',   visible: true },
];

/** Widgets retirados del dashboard (también se filtran de configs guardadas en localStorage). */
const REMOVED_WIDGET_IDS = new Set([
  'actividad',
  'availability',
  'team_rrhh',
  'kpis_main',
  'alertas',
  'clockins',
]);

const DASH_CONFIG_KEY = 'vertial_dashboard_config_v4';
const DASH_RUNTIME_CACHE_KEY = 'vertial_dashboard_runtime_v1';
const DASH_RUNTIME_TTL_MS = 90_000;

function getDashboardConfigStorageKey(scopeId?: string): string {
  return `${DASH_CONFIG_KEY}:${scopeId || 'global'}`;
}

function loadWidgetConfig(scopeId?: string): WidgetConfig[] {
  try {
    const saved = localStorage.getItem(getDashboardConfigStorageKey(scopeId));
    if (!saved) return DEFAULT_WIDGETS;
    const parsed = (JSON.parse(saved) as WidgetConfig[]).filter(
      (w) => w?.id && !REMOVED_WIDGET_IDS.has(w.id) && DEFAULT_WIDGETS.some((d) => d.id === w.id),
    );
    const ids = parsed.map((w) => w.id);
    const merged = [...parsed];
    DEFAULT_WIDGETS.forEach((d) => { if (!ids.includes(d.id)) merged.push(d); });
    return merged;
  } catch { return DEFAULT_WIDGETS; }
}

function saveWidgetConfig(config: WidgetConfig[], scopeId?: string) {
  try { localStorage.setItem(getDashboardConfigStorageKey(scopeId), JSON.stringify(config)); } catch { /* noop */ }
}

function getDashboardRuntimeCacheKey(scopeId?: string): string {
  return `${DASH_RUNTIME_CACHE_KEY}:${scopeId || 'global'}`;
}

// ─── Draggable widget wrapper ─────────────────────────────────────────────────

function DraggableWidget({
  id, dragOverId, onDragStart, onDragOver, onDrop, onDragEnd, children,
}: {
  id: WidgetId;
  dragOverId: WidgetId | null;
  onDragStart: (id: WidgetId) => void;
  onDragOver: (e: React.DragEvent, id: WidgetId) => void;
  onDrop: (id: WidgetId) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}) {
  const isTarget = dragOverId === id;
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    onDragStart(id);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={e => onDragOver(e, id)}
      onDrop={() => onDrop(id)}
      onDragEnd={onDragEnd}
      className={`group/drag relative transition-all ${isTarget ? 'ring-2 ring-blue-400 dark:ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 rounded-2xl scale-[0.995]' : ''}`}
    >
      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover/drag:opacity-100 transition-opacity pointer-events-none">
        <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-800/80 backdrop-blur-sm text-white rounded-full text-[10px] font-semibold shadow-lg cursor-grab">
          <GripVertical className="w-3 h-3" /> Arrastrar
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Panel de personalización ──────────────────────────────────────────────────

function PersonalizePanel({
  config, onUpdate, onClose,
}: {
  config: WidgetConfig[];
  onUpdate: (config: WidgetConfig[]) => void;
  onClose: () => void;
}) {
  const dragIdx = useRef<number | null>(null);

  const toggle = (id: WidgetId) => {
    onUpdate(config.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const handleDragStart = (e: React.DragEvent, i: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
    dragIdx.current = i;
  };

  const handleDrop = (i: number) => {
    const from = dragIdx.current;
    if (from === null || from === i) return;
    const next = [...config];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    dragIdx.current = null;
    onUpdate(next);
  };

  const resetDefaults = () => onUpdate(DEFAULT_WIDGETS);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-80 h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Personalizar Dashboard</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Arrastra para reordenar · Activa o desactiva widgets</p>
          {config.map((widget, i) => (
            <div
              key={widget.id}
              draggable
              onDragStart={e => handleDragStart(e, i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-grab active:cursor-grabbing transition-all select-none ${
                widget.visible
                  ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  : 'border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
              }`}
            >
              <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-500 flex-shrink-0" />
              <p className={`flex-1 text-xs font-semibold ${widget.visible ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>
                {widget.label}
              </p>
              <button onClick={() => toggle(widget.id)}
                className={`p-1.5 rounded-lg transition-colors ${widget.visible ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30' : 'text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                {widget.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>

        <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={resetDefaults}
            className="w-full px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors">
            Restaurar configuración por defecto
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

// ─── Gráfica de progreso ───────────────────────────────────────────────────

interface DailyPoint {
  day: string;
  label: string;
  value: number;
}

// ─── Alert styles ────────────────────────────────────────────────────────────

const ALERT_SEVERITY_STYLES = {
  error:   { border: 'border-l-red-500',   bg: 'bg-red-50 dark:bg-red-950/30',   dot: 'bg-red-500',   text: 'text-red-700 dark:text-red-400',   icon: 'text-red-500' },
  warning: { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-500' },
  info:    { border: 'border-l-blue-400',  bg: 'bg-blue-50 dark:bg-blue-950/30',  dot: 'bg-blue-400',  text: 'text-blue-700 dark:text-blue-400',  icon: 'text-blue-400' },
};

// ─── Quick Access ──────────────────────────────────────────────────────────────

interface QuickAccessItem {
  label: string;
  icon: React.ReactNode;
  route: string;
  color: string;
  bg: string;
}

function getQuickAccessItems(vertical: string): QuickAccessItem[] {
  /** Delivery: solo enlaces del vertical (sin taller, vehículos ni CRM compraventa genérico). */
  if (vertical === 'delivery') {
    return [
      { label: 'Pedidos', icon: <Truck className="w-5 h-5" />, route: '/saas/delivery-ops', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Centro ops', icon: <LayoutGrid className="w-5 h-5" />, route: '/saas/delivery-ops', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
      { label: 'Catálogo', icon: <Boxes className="w-5 h-5" />, route: '/saas/catalog', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
      { label: 'Clientes', icon: <Users className="w-5 h-5" />, route: '/saas/clients', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
      { label: 'Equipo', icon: <UserCheck className="w-5 h-5" />, route: '/saas/team', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
      { label: 'Finanzas', icon: <Wallet className="w-5 h-5" />, route: '/saas/finance', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
      { label: 'Documentos', icon: <FileText className="w-5 h-5" />, route: '/saas/documents', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
      { label: 'Calendario', icon: <Calendar className="w-5 h-5" />, route: '/saas/calendar', color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-950/40' },
    ];
  }

  const common: QuickAccessItem[] = [
    { label: 'CRM / Clientes', icon: <Users className="w-5 h-5" />, route: '/saas/clients', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Equipo', icon: <UserCheck className="w-5 h-5" />, route: '/saas/team', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Finanzas', icon: <Wallet className="w-5 h-5" />, route: '/saas/finance', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Documentos', icon: <FileText className="w-5 h-5" />, route: '/saas/documents', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Calendario', icon: <Calendar className="w-5 h-5" />, route: '/saas/calendar', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    { label: 'Fichajes', icon: <Clock className="w-5 h-5" />, route: '/saas/clockins', color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-800' },
    { label: 'Horarios', icon: <CalendarRange className="w-5 h-5" />, route: '/saas/equipo/horarios-vacaciones', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    { label: 'Nóminas', icon: <Receipt className="w-5 h-5" />, route: '/saas/payroll?tab=nominas', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  ];

  const verticalLinks: Record<string, QuickAccessItem[]> = {
    carDealership: [
      { label: 'Vehículos', icon: <Car className="w-5 h-5" />, route: '/saas/vehicles', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
      { label: 'Compras', icon: <ShoppingCart className="w-5 h-5" />, route: '/saas/vertical/compraventa/compras', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Ventas', icon: <TrendingUp className="w-5 h-5" />, route: '/saas/vertical/compraventa/ventas', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
      { label: 'Tasaciones', icon: <Scale className="w-5 h-5" />, route: '/saas/vertical/compraventa/tasaciones', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
      { label: 'Entregas', icon: <Truck className="w-5 h-5" />, route: '/saas/vertical/compraventa/entregas', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    ],
    workshop: [
      { label: 'Taller', icon: <Wrench className="w-5 h-5" />, route: '/saas/workshop', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
      { label: 'Recambios', icon: <Package className="w-5 h-5" />, route: '/saas/parts', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    ],
    cleaning: [
      { label: 'Centro Operativo', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/cleaning-hub', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
      { label: 'Servicios', icon: <Users className="w-5 h-5" />, route: '/saas/cleaning-services', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    ],
    gym: [
      { label: 'Centro', icon: <LayoutDashboard className="w-5 h-5" />, route: '/saas/gym-hub', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
      { label: 'Socios', icon: <Users className="w-5 h-5" />, route: '/saas/gym-members', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Clases', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/gym-classes', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    clinic: [
      { label: 'Pacientes', icon: <Users className="w-5 h-5" />, route: '/saas/clinic-patients', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Citas', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/clinic-appointments', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    hotel: [
      { label: 'Reservas', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/hotel-reservations', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Habitaciones', icon: <Building2 className="w-5 h-5" />, route: '/saas/hotel-rooms', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    construction: [
      { label: 'Proyectos', icon: <Briefcase className="w-5 h-5" />, route: '/saas/construction-projects', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Presupuestos', icon: <FileBarChart className="w-5 h-5" />, route: '/saas/construction-budgets', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    academy: [
      { label: 'Alumnos', icon: <Users className="w-5 h-5" />, route: '/saas/academy-students', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Cursos', icon: <Boxes className="w-5 h-5" />, route: '/saas/academy-courses', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    realEstate: [
      { label: 'Propiedades', icon: <Building2 className="w-5 h-5" />, route: '/saas/realestate-properties', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Visitas', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/realestate-visits', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    lawyer: [
      { label: 'Casos', icon: <Briefcase className="w-5 h-5" />, route: '/saas/lawyer-cases', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Vistas', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/lawyer-hearings', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    nightclub: [
      { label: 'Eventos', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/nightclub-events', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'VIP', icon: <Users className="w-5 h-5" />, route: '/saas/nightclub-vip', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    events: [
      { label: 'Centro eventos', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/vertical/eventos', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Contrataciones', icon: <FileText className="w-5 h-5" />, route: '/saas/vertical/eventos/contrataciones', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
    ],
    hairSalon: [
      { label: 'Citas', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/salon-appointments', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Servicios', icon: <Boxes className="w-5 h-5" />, route: '/saas/salon-services', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    scrapyard: [
      { label: 'Centro', icon: <Activity className="w-5 h-5" />, route: '/saas/vertical/desguaces', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Piezas', icon: <Boxes className="w-5 h-5" />, route: '/saas/scrapyard-parts', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    spareParts: [
      { label: 'Catálogo', icon: <Boxes className="w-5 h-5" />, route: '/saas/catalog', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Pedidos', icon: <ShoppingCart className="w-5 h-5" />, route: '/saas/spareparts-orders', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    taxi: [
      { label: 'Flota', icon: <Car className="w-5 h-5" />, route: '/saas/taxi-fleet', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Viajes', icon: <Truck className="w-5 h-5" />, route: '/saas/taxi-trips', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    pharmacy: [
      { label: 'Inventario', icon: <Boxes className="w-5 h-5" />, route: '/saas/pharmacy-inventory', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Ventas', icon: <Receipt className="w-5 h-5" />, route: '/saas/pharmacy-sales', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    carWash: [
      { label: 'Servicios', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/carwash-services', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Reservas', icon: <BookmarkCheck className="w-5 h-5" />, route: '/saas/carwash-bookings', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    vet: [
      { label: 'Pacientes', icon: <Users className="w-5 h-5" />, route: '/saas/vet-patients', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Citas', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/vet-appointments', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    tobaccoShop: [
      { label: 'Ventas', icon: <Receipt className="w-5 h-5" />, route: '/saas/tobacco-sales', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Inventario', icon: <Boxes className="w-5 h-5" />, route: '/saas/tobacco-inventory', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    butcherShop: [
      { label: 'Centro', icon: <Activity className="w-5 h-5" />, route: '/saas/butcher-hub', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Productos', icon: <Boxes className="w-5 h-5" />, route: '/saas/butcher-products', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
  };

  const verticalItems = verticalLinks[vertical] || [];
  return [...verticalItems, ...common].slice(0, 8);
}

// ─── Funnel stages ────────────────────────────────────────────────────────────

const FUNNEL_STAGE_KEYS = [
  { key: 'new',         label: 'Nuevos',      color: 'bg-blue-500',    light: 'bg-blue-50 dark:bg-blue-950/40',   text: 'text-blue-700 dark:text-blue-300' },
  { key: 'contacted',   label: 'Contactados', color: 'bg-indigo-500',  light: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300' },
  { key: 'appointment', label: 'Con cita',    color: 'bg-violet-500',  light: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300' },
  { key: 'reserved',    label: 'Reservados',  color: 'bg-amber-500',   light: 'bg-amber-50 dark:bg-amber-950/40',  text: 'text-amber-700 dark:text-amber-300' },
  { key: 'negotiation', label: 'Negociación', color: 'bg-orange-500',  light: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300' },
  { key: 'won',         label: 'Ganados',     color: 'bg-emerald-500', light: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300' },
] as const;

// ═══════════════════════════════════════════════════════════
// MAIN EXPORT: Dashboard router
// ═══════════════════════════════════════════════════════════


export function Dashboard() {
  return <DashboardPage />;
}

function DashboardPage() {
  const { businesses, businessesFetchSettled, currentBusiness } = useBusiness();
  const { isPortfolioView, selectBusinessFromPortfolio } = useDashboardView();
  const portfolioPlan = usePortfolioPlanAccess();
  const isMobile = useIsMobile();
  const vertical = (currentBusiness?.businessType || 'carDealership') as BusinessType;
  const VerticalDashboard = getVerticalDashboard(vertical);
  const businessKey = String(currentBusiness?.business_id || currentBusiness?.id || '');
  const [showUnifiedDashboard, setShowUnifiedDashboard] = useState(false);

  // Al cambiar de empresa, volver al dashboard vertical (p. ej. bar con gráficas 14d).
  useEffect(() => {
    setShowUnifiedDashboard(false);
  }, [businessKey]);

  if (!businessesFetchSettled) {
    return (
      <Layout title="Dashboard" subtitle="">
        <div className="flex items-center justify-center py-24 text-gray-500">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          Cargando…
        </div>
      </Layout>
    );
  }

  // App / iPhone: home compacto en verticales genéricos.
  // Delivery y bar/restaurante: dashboard completo (KPIs + gráficas).
  if ((isMobile || isVertialNativeApp()) && !isPortfolioView) {
    const isDelivery =
      vertical === 'delivery' || isDeliveryBusinessType(currentBusiness?.businessType);
    const isRestaurant =
      vertical === 'restaurant' || isRestaurantBusinessType(currentBusiness?.businessType);
    if (!isDelivery && !isRestaurant) {
      return <CeoMobileHome />;
    }
  }

  /**
   * DOS VISTAS en /saas/dashboard (nunca mezclar datos):
   * 1) Visión general → TODAS las empresas (GeneralDashboard)
   * 2) Empresa activa → solo esa (VerticalDashboard / UnifiedDashboard)
   */
  if (isPortfolioView && portfolioPlan.canUsePortfolioView) {
    return <GeneralDashboard onSelectBusiness={selectBusinessFromPortfolio} />;
  }

  if (VerticalDashboard && !showUnifiedDashboard) {
    return <VerticalDashboard onSelectGeneral={() => setShowUnifiedDashboard(true)} />;
  }

  return (
    <UnifiedDashboard
      onBackToVertical={
        VerticalDashboard ? () => setShowUnifiedDashboard(false) : undefined
      }
    />
  );
}

// ═══════════════════════════════════════════════════════════
// UNIFIED DASHBOARD (works for all verticals)
// ═══════════════════════════════════════════════════════════

function UnifiedDashboard({ onBackToVertical }: { onBackToVertical?: () => void }) {
  const navigate = useNavigate();
  const { vehicles, leads, sales, documents, isLoadingVehicles, isLoadingClients } = useApp();
  const { user: authUser } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const { t, i18n } = useTranslation();

  const vertical: BusinessType = (currentBusiness?.businessType as BusinessType) || 'carDealership';
  const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '');
  const {
    planLabel,
    isBasicPlan,
    canShowWidget,
    canViewEbitda,
    canViewFinanceWidget,
    lockedWidgets,
  } = useDashboardPlanAccess();

  const { snapshot: ebitdaMonth, loading: ebitdaLoading } = useCoreEbitdaMonth(canViewEbitda);
  const financeUserId = resolveBusinessDataUserId(authUser, currentBusiness);
  const dashboardConfigScope = `${authUser?.user_id || 'anon'}:${businessId || 'default'}`;
  const runtimeCacheScope = dashboardConfigScope;

  // ── Personalización ──
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>(() => loadWidgetConfig(dashboardConfigScope));
  const [showPersonalize, setShowPersonalize] = useState(false);
  const [dragOverId, setDragOverId] = useState<WidgetId | null>(null);
  const draggingId = useRef<WidgetId | null>(null);

  useModalClose(showPersonalize, () => setShowPersonalize(false));

  const updateWidgetConfig = useCallback((next: WidgetConfig[]) => {
    setWidgetConfig(next);
    saveWidgetConfig(next, dashboardConfigScope);
  }, [dashboardConfigScope]);

  useEffect(() => {
    setWidgetConfig(loadWidgetConfig(dashboardConfigScope));
  }, [dashboardConfigScope]);

  const isVisible = useCallback((id: WidgetId) => {
    if (!canShowWidget(id)) return false;
    return widgetConfig.find(w => w.id === id)?.visible ?? true;
  }, [widgetConfig, canShowWidget]);

  const widgetOrderMap = useMemo(
    () => new Map(widgetConfig.map((widget, idx) => [widget.id, idx])),
    [widgetConfig],
  );
  const getWidgetOrder = useCallback((id: WidgetId | WidgetId[]) => {
    if (Array.isArray(id)) return Math.min(...id.map((itemId) => widgetOrderMap.get(itemId) ?? Number.MAX_SAFE_INTEGER));
    return widgetOrderMap.get(id) ?? Number.MAX_SAFE_INTEGER;
  }, [widgetOrderMap]);

  const handleWidgetDragStart = useCallback((id: WidgetId) => { draggingId.current = id; }, []);
  const handleWidgetDragOver = useCallback((e: React.DragEvent, id: WidgetId) => {
    e.preventDefault();
    if (draggingId.current && draggingId.current !== id) setDragOverId(id);
  }, []);
  const handleWidgetDrop = useCallback((targetId: WidgetId) => {
    const fromId = draggingId.current;
    draggingId.current = null;
    setDragOverId(null);
    if (!fromId || fromId === targetId) return;
    const from = widgetConfig.findIndex(w => w.id === fromId);
    const to = widgetConfig.findIndex(w => w.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...widgetConfig];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateWidgetConfig(next);
  }, [widgetConfig, updateWidgetConfig]);
  const handleWidgetDragEnd = useCallback(() => { draggingId.current = null; setDragOverId(null); }, []);

  const dragProps = { dragOverId, onDragStart: handleWidgetDragStart, onDragOver: handleWidgetDragOver, onDrop: handleWidgetDrop, onDragEnd: handleWidgetDragEnd };

  // ── Server KPIs ──
  const [serverData, setServerData] = useState<DashboardServerData | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [deliveryMetrics, setDeliveryMetrics] = useState<PortfolioMetrics | null>(null);
  const [deliveryScope, setDeliveryScope] = useState<{
    orders: DeliveryOrder[];
    pdvIds: string[];
    primaryPdvId: string | null;
    wcScopeIds: string[];
    /** Total de pedidos de la empresa (meta del filtro API). */
    ordersTotal: number;
    /** Tiendas / PDV delivery para desglose de tiempos y filtro de Marcas. */
    stores: Array<{ id: string; name: string; workCenterId?: string }>;
  } | null>(null);
  const [deliveryOpsPulses, setDeliveryOpsPulses] = useState<{
    pulses7d: StoreOpsPulse[];
    pulsesMonth: StoreOpsPulse[];
  } | null>(null);
  const [workerPayMonth, setWorkerPayMonth] = useState<WorkerPayMonthSummary | null>(null);
  /** Cierres de caja cargados (para sumar Caja 2 al panel de Marcas). */
  const [deliveryTpvSessions, setDeliveryTpvSessions] = useState<TpvRegisterSession[]>([]);
  /** Montaje 1 a 1: 0=nada · 1=pulso · 2=marcas · 3=pagos · 4=tiempos. */
  const [deliveryPanelStage, setDeliveryPanelStage] = useState(0);
  /** True cuando la ventana completa de pedidos (MoM / YoY) ya llegó. */
  const [deliveryHeavyReady, setDeliveryHeavyReady] = useState(false);
  const [deliveryWaveBusy, setDeliveryWaveBusy] = useState(false);
  const deliveryLoadGenRef = useRef(0);
  const deliveryScopeBizRef = useRef('');

  const isDeliveryVertical = vertical === 'delivery' || isDeliveryBusinessType(currentBusiness?.businessType);
  const isCompraventaVertical = vertical === 'carDealership';
  const isRestaurantVertical = vertical === 'restaurant' || isRestaurantBusinessType(currentBusiness?.businessType);

  const loadDeliveryDashboard = useCallback(async () => {
    if (!isDeliveryVertical || !authUser || !currentBusiness) {
      setDeliveryMetrics(null);
      setDeliveryScope(null);
      setDeliveryOpsPulses(null);
      setWorkerPayMonth(null);
      setDeliveryTpvSessions([]);
      setDeliveryPanelStage(0);
      setDeliveryHeavyReady(false);
      setDeliveryWaveBusy(false);
      deliveryScopeBizRef.current = '';
      return;
    }
    const dataUserId = resolveBusinessDataUserId(authUser, currentBusiness);
    if (!dataUserId) {
      setDeliveryMetrics(emptyPortfolioMetrics());
      setDeliveryScope(null);
      setDeliveryOpsPulses({ pulses7d: [], pulsesMonth: [] });
      setWorkerPayMonth(null);
      setDeliveryTpvSessions([]);
      setDeliveryPanelStage(4);
      setDeliveryHeavyReady(true);
      setDeliveryWaveBusy(false);
      return;
    }
    const scopeBusinessId = String(currentBusiness.business_id || currentBusiness.id || '')
      .replace(/^business:/, '')
      .trim();
    if (deliveryScopeBizRef.current !== scopeBusinessId) {
      deliveryScopeBizRef.current = scopeBusinessId;
      setDeliveryMetrics(null);
      setDeliveryScope(null);
      setDeliveryOpsPulses(null);
      setWorkerPayMonth(null);
      setDeliveryTpvSessions([]);
      setDeliveryPanelStage(0);
      setDeliveryHeavyReady(false);
    }

    const businessName = String(currentBusiness.name || 'Empresa');
    const todayKey = localCalendarDayKey();
    const monthKey = todayKey.slice(0, 7);
    const yearKey = todayKey.slice(0, 4);
    // Operativa (7d / mes / MoM / marcas día-mes): ~100 días basta y escala con más clientes.
    // YoY de marcas (año ant.): trozo aparte, no 2 años enteros a 8k.
    const rollingStart = (() => {
      const d = new Date(`${todayKey}T12:00:00`);
      d.setDate(d.getDate() - 100);
      return localDayBoundsForKey(localCalendarDayKey(d)).from;
    })();
    const ytdStart = localDayBoundsForKey(`${yearKey}-01-01`).from;
    const orderFetchFrom = rollingStart < ytdStart ? rollingStart : ytdStart;
    const monthEnd = `${todayKey}T23:59:59.999Z`;
    const prevYearKey = String(Number(yearKey) - 1);
    const prevYtdFrom = localDayBoundsForKey(`${prevYearKey}-01-01`).from;
    const prevYtdTo = `${prevYearKey}${todayKey.slice(4)}T23:59:59.999Z`;
    const wave0From = (() => {
      const d = new Date(`${todayKey}T12:00:00`);
      d.setDate(d.getDate() - 14);
      const fast14 = localDayBoundsForKey(localCalendarDayKey(d)).from;
      const monthFrom = localDayBoundsForKey(`${monthKey}-01`).from;
      return fast14 < monthFrom ? fast14 : monthFrom;
    })();
    const sessionsFrom = localDayBoundsForKey(
      (() => {
        const d = new Date(`${todayKey}T12:00:00`);
        d.setDate(d.getDate() - 45);
        return localCalendarDayKey(d);
      })(),
    ).from;
    const bizFilter = scopeBusinessId ? { businessId: scopeBusinessId } : {};
    const gen = ++deliveryLoadGenRef.current;
    const stillCurrent = () => gen === deliveryLoadGenRef.current;
    const yieldPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          window.setTimeout(resolve, 0);
        });
      });

    type StoreRow = { _id: string; name?: string; workCenterId?: string; active?: boolean; createdAt?: string; deletedAt?: string; centerType?: string };
    const applyDeliveryPayload = (
      pointsOfSale: StoreRow[],
      workCenters: StoreRow[],
      orders: DeliveryOrder[],
      tpvSessions: TpvRegisterSession[],
      ordersTotal: number,
    ) => {
      const activePdvIds = pointsOfSale.filter((p) => p.active !== false).map((p) => p._id);
      const orderPdvIds = [
        ...new Set(
          (orders || [])
            .map((o) => String(o.salesPointId || '').trim())
            .filter(Boolean),
        ),
      ];
      const pdvIds = [...new Set([...activePdvIds, ...orderPdvIds])];
      const storeIds = workCenters
        .filter((wc) => !wc.deletedAt && (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'))
        .map((wc) => wc._id);
      const wcScope = new Set(storeIds);
      const keys7d = listTrailingDayKeys(todayKey, 7);
      const keysMonth = listMonthToDateDayKeys(todayKey);
      const pdvByWorkCenterId = new Map<string, string>();
      const wcNameById = new Map<string, string>();
      for (const wc of workCenters) {
        if (wc?._id) wcNameById.set(String(wc._id), String(wc.name || wc._id));
      }
      for (const p of pointsOfSale) {
        const wcId = String(p.workCenterId || '').trim();
        if (wcId) pdvByWorkCenterId.set(wcId, String(p._id));
      }

      const pulseStores: Array<{ id: string; name: string; workCenterId: string }> = [];
      const pulseStoreMap = new Map<string, { id: string; name: string; workCenterId: string }>();
      const addPulseStore = (idRaw: string, nameRaw?: string, wcRaw?: string) => {
        const id = String(idRaw || '').trim();
        if (!id) return;
        const prev = pulseStoreMap.get(id);
        const workCenterId = String(wcRaw || prev?.workCenterId || '').trim();
        const name = String(nameRaw || prev?.name || wcNameById.get(workCenterId) || id).trim();
        pulseStoreMap.set(id, { id, name, workCenterId });
      };
      for (const p of pointsOfSale) {
        if (p.active === false) continue;
        addPulseStore(String(p._id || ''), String(p.name || ''), String(p.workCenterId || ''));
      }
      for (const wc of workCenters) {
        if (wc.deletedAt) continue;
        if (wc.centerType !== 'punto_de_venta' && wc.centerType !== 'almacen') continue;
        const linkedPdv = pdvByWorkCenterId.get(String(wc._id));
        if (linkedPdv) addPulseStore(linkedPdv, String(wc.name || ''), String(wc._id));
      }
      for (const id of orderPdvIds) addPulseStore(id);
      for (const s of tpvSessions || []) {
        addPulseStore(String(s.pointOfSaleId || ''), undefined, String((s as { workCenterId?: string }).workCenterId || ''));
      }
      pulseStores.push(...pulseStoreMap.values());

      const buildPulses = (dayKeys: string[]): StoreOpsPulse[] =>
        pulseStores.map((store) =>
          buildStoreOpsPulse(orders || [], {
            storeId: store.workCenterId || store.id,
            storeName: store.name,
            businessId: scopeBusinessId,
            businessName,
            pdvId: store.id,
            workCenterId: store.workCenterId || undefined,
            todayKey,
            dayKeys,
            sessions: tpvSessions || [],
          }),
        ).filter((p) => Boolean(p.pdvId));

      const deliveryStores = (
        pulseStores.length > 0
          ? pulseStores
          : pointsOfSale
              .filter((p) => p.active !== false)
              .map((p) => ({
                id: String(p._id || '').trim(),
                name: String(p.name || p._id || 'Tienda').trim(),
                workCenterId: String(p.workCenterId || ''),
              }))
      )
        .map((s) => ({
          id: s.id,
          name: s.name,
          workCenterId: String((s as { workCenterId?: string }).workCenterId || '').trim() || undefined,
        }))
        .filter((s) => s.id);

      setDeliveryTpvSessions(tpvSessions || []);

      if (pulseStores.length === 0 && (orders || []).length === 0) {
        setDeliveryMetrics(emptyPortfolioMetrics());
        setDeliveryOpsPulses({ pulses7d: [], pulsesMonth: [] });
        setDeliveryScope({
          orders: orders || [],
          pdvIds,
          primaryPdvId: null,
          wcScopeIds: [...wcScope],
          ordersTotal: Number(ordersTotal || 0),
          stores: deliveryStores,
        });
        return;
      }
      const createdMap = new Map(pointsOfSale.map((p) => [p._id, String(p.createdAt || '')]));
      const scopePdvIds = pdvIds.length ? pdvIds : orderPdvIds;
      const primaryPdv = pickPrimaryPdvIdFromList(scopePdvIds, createdMap) || orderPdvIds[0] || null;
      const baseMetrics =
        scopePdvIds.length === 0
          ? emptyPortfolioMetrics()
          : computePortfolioMetrics(orders, scopePdvIds, primaryPdv, todayKey, wcScope);
      setDeliveryMetrics(applyTpvCashMetrics(baseMetrics, tpvSessions || [], scopePdvIds, todayKey));
      setDeliveryOpsPulses({
        pulses7d: buildPulses(keys7d),
        pulsesMonth: buildPulses(keysMonth),
      });
      const scopedForTotal = filterOrdersToPortfolioScope(
        orders || [],
        scopePdvIds,
        primaryPdv,
        wcScope,
      );
      setDeliveryScope({
        orders: orders || [],
        pdvIds: scopePdvIds,
        primaryPdvId: primaryPdv,
        wcScopeIds: [...wcScope],
        ordersTotal: Math.max(Number(ordersTotal || 0), scopedForTotal.length),
        stores: deliveryStores,
      });
    };

    setDeliveryWaveBusy(true);
    setDeliveryHeavyReady(false);
    let paintedPulse = false;
    try {
      const emptyStores = {
        dataUserId: '',
        workCenters: [] as StoreRow[],
        pointsOfSale: [] as StoreRow[],
      };
      const emptyOrders = { orders: [] as DeliveryOrder[], total: 0 };

      // Ola 0 — rápida: tiendas + mes/14d + cajas → pintar Resumen operativo ya.
      // Timeout: en prod una request colgada no puede dejar «Cargando…» eterno.
      const [
        { pointsOfSale, workCenters },
        fastOrderResult,
        tpvSessions,
        ordersCountResult,
      ] = await withTimeoutFallback(
        Promise.all([
          withTimeoutFallback(
            loadDeliveryStores(authUser, currentBusiness, {
              accountBusinessCount: businesses.length || 1,
            }),
            emptyStores,
          ),
          withTimeoutFallback(
            filterDeliveryOrdersRequest(dataUserId, {
              dateFrom: wave0From,
              dateTo: monthEnd,
              limit: 800,
              ...bizFilter,
            }),
            emptyOrders,
          ),
          withTimeoutFallback(
            listTpvRegisterSessionsRequest(dataUserId, {
              ...bizFilter,
              dateFrom: sessionsFrom,
            }),
            [] as TpvRegisterSession[],
          ),
          withTimeoutFallback(
            filterDeliveryOrdersRequest(dataUserId, {
              limit: 1,
              ...bizFilter,
            }),
            emptyOrders,
          ),
        ]),
        [emptyStores, emptyOrders, [] as TpvRegisterSession[], emptyOrders] as const,
      );
      if (!stillCurrent()) return;

      const wave0Orders = Array.isArray(fastOrderResult.orders) ? fastOrderResult.orders : [];
      const sessions = Array.isArray(tpvSessions) ? tpvSessions : [];
      const ordersTotal = Number(ordersCountResult.total || wave0Orders.length || 0);
      applyDeliveryPayload(pointsOfSale, workCenters, wave0Orders, sessions, ordersTotal);
      paintedPulse = true;
      setDeliveryPanelStage((s) => Math.max(s, 1));
      await yieldPaint();
      if (!stillCurrent()) return;
      setDeliveryPanelStage((s) => Math.max(s, 2));

      // Ola 1 — ventana completa + YoY (marcas / insights MoM).
      const [fullOrderResult, prevYearOrderResult] = await withTimeoutFallback(
        Promise.all([
          withTimeoutFallback(
            filterDeliveryOrdersRequest(dataUserId, {
              dateFrom: orderFetchFrom,
              dateTo: monthEnd,
              limit: 2500,
              ...bizFilter,
            }),
            { orders: wave0Orders, total: wave0Orders.length },
          ),
          withTimeoutFallback(
            filterDeliveryOrdersRequest(dataUserId, {
              dateFrom: prevYtdFrom,
              dateTo: prevYtdTo,
              limit: 1500,
              ...bizFilter,
            }),
            emptyOrders,
          ),
        ]),
        [
          { orders: wave0Orders, total: wave0Orders.length },
          emptyOrders,
        ] as const,
      );
      if (!stillCurrent()) return;

      const mergedOrdersById = new Map<string, DeliveryOrder>();
      for (const o of [...(fullOrderResult.orders || []), ...(prevYearOrderResult.orders || [])]) {
        const id = String(o?._id || '').trim();
        if (id) mergedOrdersById.set(id, o);
      }
      // Conserva pedidos ola 0 por si el full vino truncado/vacío.
      for (const o of wave0Orders) {
        const id = String(o?._id || '').trim();
        if (id && !mergedOrdersById.has(id)) mergedOrdersById.set(id, o);
      }
      const heavyOrders = Array.from(mergedOrdersById.values());
      applyDeliveryPayload(
        pointsOfSale,
        workCenters,
        heavyOrders,
        sessions,
        Math.max(ordersTotal, Number(fullOrderResult.total || 0), heavyOrders.length),
      );
      setDeliveryHeavyReady(true);
      setDeliveryPanelStage((s) => Math.max(s, 3));
      await yieldPaint();
      if (!stillCurrent()) return;

      // Ola 2 — pagos trabajadores (no bloquea el resto).
      const staffConsumptionsResult = await withTimeoutFallback(
        listStaffConsumptionsRequest(dataUserId, {
          month: monthKey,
        }),
        {
          items: [],
          summary: { count: 0, total: 0, cashNowTotal: 0, payrollTotal: 0 },
        },
      );
      if (!stillCurrent()) return;
      setWorkerPayMonth(
        buildWorkerPayMonthSummary(sessions, monthKey, staffConsumptionsResult.items || []),
      );
      setDeliveryPanelStage(4);
    } catch (err) {
      if (!stillCurrent()) return;
      console.warn('[Dashboard] loadDeliveryDashboard', err);
      if (!paintedPulse) {
        setDeliveryMetrics(emptyPortfolioMetrics());
        setDeliveryScope(null);
        // Nunca ocultar el bloque «Resumen operativo»: con error se muestra vacío.
        setDeliveryOpsPulses({ pulses7d: [], pulsesMonth: [] });
        setDeliveryTpvSessions([]);
      }
      setWorkerPayMonth(null);
      setDeliveryHeavyReady(true);
      setDeliveryPanelStage(4);
    } finally {
      if (!stillCurrent()) return;
      setDeliveryWaveBusy(false);
      // Cinturón: si algo falló a medias, no dejar stage 0 / metrics null / marcas eternas.
      setDeliveryPanelStage((s) => (s < 1 ? 1 : s));
      setDeliveryMetrics((prev) => prev ?? emptyPortfolioMetrics());
      setDeliveryOpsPulses((prev) => prev ?? { pulses7d: [], pulsesMonth: [] });
      setDeliveryHeavyReady(true);
    }
  }, [isDeliveryVertical, authUser, currentBusiness, businesses.length]);

  useEffect(() => {
    void loadDeliveryDashboard();
  }, [loadDeliveryDashboard]);

  const [crmClientsCount, setCrmClientsCount] = useState<number | null>(null);
  const [crmNewClientsMonth, setCrmNewClientsMonth] = useState<number | null>(null);
  const [crmNewClientsPrevMonth, setCrmNewClientsPrevMonth] = useState<number | null>(null);
  const [crmNewClientsWeek, setCrmNewClientsWeek] = useState<number | null>(null);
  const [crmNewClientsPrevWeek, setCrmNewClientsPrevWeek] = useState<number | null>(null);
  const [crmNewClientsToday, setCrmNewClientsToday] = useState<number | null>(null);
  const [crmNewClientsYesterday, setCrmNewClientsYesterday] = useState<number | null>(null);
  const [deliveryBrands, setDeliveryBrands] = useState<Brand[]>([]);

  useEffect(() => {
    if (!isDeliveryVertical || !businessId) {
      setDeliveryBrands([]);
      return;
    }
    let cancelled = false;
    listBrandsRequest(businessId)
      .then((list) => {
        if (!cancelled) setDeliveryBrands(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setDeliveryBrands([]);
      });
    return () => { cancelled = true; };
  }, [isDeliveryVertical, businessId]);

  const loadCrmClientsCount = useCallback(async () => {
    if (!financeUserId || !(isDeliveryVertical || isRestaurantVertical)) {
      setCrmClientsCount(null);
      setCrmNewClientsMonth(null);
      setCrmNewClientsPrevMonth(null);
      setCrmNewClientsWeek(null);
      setCrmNewClientsPrevWeek(null);
      setCrmNewClientsToday(null);
      setCrmNewClientsYesterday(null);
      return;
    }
    try {
      const todayKey = localCalendarDayKey();
      const monthKey = todayKey.slice(0, 7);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = localCalendarDayKey(yesterday);
      const weekKeys = new Set(listTrailingDayKeys(todayKey, 7));
      const prevWeekEnd = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return localCalendarDayKey(d);
      })();
      const prevWeekKeys = new Set(listTrailingDayKeys(prevWeekEnd, 7));
      // Capado: no bajar los ~6k de Pau (saturaba API y dejaba el TPV ciego).
      const { totalClients, sample } = await fetchClientAcquisitionSample(financeUserId, {
        monthKey,
        businessId: businessId || undefined,
      });
      const metrics = computePortfolioClientMetrics(sample, monthKey);
      let newToday = 0;
      let newYesterday = 0;
      let newWeek = 0;
      let newPrevWeek = 0;
      for (const client of sample) {
        if (!countsTowardNewClientMetrics(client)) continue;
        const raw = client.createdAt;
        const iso = raw instanceof Date ? raw.toISOString() : String(raw || '');
        if (!iso) continue;
        const day = localCalendarDayKey(new Date(iso));
        if (day === todayKey) newToday += 1;
        else if (day === yesterdayKey) newYesterday += 1;
        if (weekKeys.has(day)) newWeek += 1;
        if (prevWeekKeys.has(day)) newPrevWeek += 1;
      }
      setCrmClientsCount(totalClients || sample.length);
      setCrmNewClientsMonth(metrics.newClientsMonth);
      setCrmNewClientsPrevMonth(metrics.newClientsPrevMonth);
      setCrmNewClientsWeek(newWeek);
      setCrmNewClientsPrevWeek(newPrevWeek);
      setCrmNewClientsToday(newToday);
      setCrmNewClientsYesterday(newYesterday);
    } catch {
      setCrmClientsCount(null);
      setCrmNewClientsMonth(null);
      setCrmNewClientsPrevMonth(null);
      setCrmNewClientsWeek(null);
      setCrmNewClientsPrevWeek(null);
      setCrmNewClientsToday(null);
      setCrmNewClientsYesterday(null);
    }
  }, [financeUserId, businessId, isDeliveryVertical, isRestaurantVertical]);

  useEffect(() => {
    // Delivery: CRM después del primer paint del resumen (no pelear con ola 0).
    if (isDeliveryVertical && deliveryPanelStage < 1) return;
    void loadCrmClientsCount();
  }, [loadCrmClientsCount, isDeliveryVertical, deliveryPanelStage]);

  const refreshDashboardLive = useCallback(() => {
    void loadDeliveryDashboard();
    void loadCrmClientsCount();
    if (authUser?.user_id) {
      fetchDashboardData(authUser.user_id)
        .then((data) => {
          setServerData(data);
          setServerUpdatedAt(data.updatedAt);
        })
        .catch(() => { /* noop */ });
    }
  }, [loadDeliveryDashboard, loadCrmClientsCount, authUser?.user_id]);

  /** Evita martillar Couch/API en cada SSE de pedido (escala con varios locales). */
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDashboardLiveRefresh = useCallback(() => {
    if (liveRefreshTimerRef.current) return;
    liveRefreshTimerRef.current = setTimeout(() => {
      liveRefreshTimerRef.current = null;
      refreshDashboardLive();
    }, 8_000);
  }, [refreshDashboardLive]);

  useEffect(() => () => {
    if (liveRefreshTimerRef.current) clearTimeout(liveRefreshTimerRef.current);
  }, []);

  const { sseOk: liveSseOk } = useDeliveryOrdersLive({
    authUserId: authUser?.user_id || authUser?.id || null,
    businessId: businessId || null,
    onRefresh: scheduleDashboardLiveRefresh,
    enabled: !!authUser && (isDeliveryVertical || isRestaurantVertical),
    fallbackPollMs: 90_000,
  });

  useEffect(() => {
    const onCajaSync = () => scheduleDashboardLiveRefresh();
    const onClientsSync = () => { void loadCrmClientsCount(); };
    window.addEventListener(TPV_SESSION_SYNC_EVENT, onCajaSync);
    window.addEventListener(CRM_CLIENTS_SYNC_EVENT, onClientsSync);
    return () => {
      window.removeEventListener(TPV_SESSION_SYNC_EVENT, onCajaSync);
      window.removeEventListener(CRM_CLIENTS_SYNC_EVENT, onClientsSync);
    };
  }, [scheduleDashboardLiveRefresh, loadCrmClientsCount]);

  const [verticalKpi, setVerticalKpi] = useState<VerticalKpiSnapshot | null>(null);
  const [verticalKpiLoading, setVerticalKpiLoading] = useState(false);

  useEffect(() => {
    if (!financeUserId || isDeliveryVertical || isCompraventaVertical) {
      setVerticalKpi(null);
      return;
    }
    let cancelled = false;
    setVerticalKpiLoading(true);
    void loadVerticalKpiSnapshot(vertical, financeUserId, businessId)
      .then((snap) => {
        if (!cancelled) setVerticalKpi(snap);
      })
      .finally(() => {
        if (!cancelled) setVerticalKpiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vertical, financeUserId, businessId, isDeliveryVertical, isCompraventaVertical]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(getDashboardRuntimeCacheKey(runtimeCacheScope));
      if (!raw) return;
      const cached = JSON.parse(raw) as {
        at: number;
        serverData: DashboardServerData | null;
        serverUpdatedAt: string | null;
      };
      if (!cached?.at || Date.now() - cached.at > DASH_RUNTIME_TTL_MS) return;
      setServerData(cached.serverData || null);
      setServerUpdatedAt(cached.serverUpdatedAt || null);
    } catch {
      // noop
    }
  }, [runtimeCacheScope]);

  useEffect(() => {
    if (!authUser?.user_id) return;
    let cancelled = false;
    setServerLoading(true);
    fetchDashboardData(authUser.user_id)
      .then((data) => {
        if (!cancelled) {
          setServerData(data);
          setServerUpdatedAt(data.updatedAt);
          setServerLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setServerLoading(false); });
    return () => { cancelled = true; };
  }, [authUser?.user_id]);

  // Refresh silencioso en segundo plano para mantener el dashboard "vivo"
  useEffect(() => {
    if (!businessId) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetchDashboardData(authUser?.user_id || '')
        .then((data) => {
          setServerData(data);
          setServerUpdatedAt(data.updatedAt);
        })
        .catch(() => { /* noop */ });
    }, 45000);
    return () => window.clearInterval(intervalId);
  }, [businessId, authUser?.user_id]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        getDashboardRuntimeCacheKey(runtimeCacheScope),
        JSON.stringify({
          at: Date.now(),
          serverData,
          serverUpdatedAt,
        }),
      );
    } catch {
      // noop
    }
  }, [runtimeCacheScope, serverData, serverUpdatedAt]);

  // ── Refresh handler ──
  const handleRefresh = useCallback(() => {
    if (!authUser?.user_id || serverLoading) return;
    setServerLoading(true);
    fetchDashboardData(authUser.user_id)
      .then((data) => { setServerData(data); setServerUpdatedAt(data.updatedAt); setServerLoading(false); })
      .catch(() => setServerLoading(false));
    if (isDeliveryVertical) {
      void loadDeliveryDashboard();
    }
  }, [authUser?.user_id, businessId, serverLoading, isDeliveryVertical, loadDeliveryDashboard]);

  // ── KPI values (server → local fallback) ──
  const sk = serverData?.kpis;
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const soldThisMonth = useMemo(() => vehicles.filter(v => {
    if (v.status !== 'vendido' || !v.soldAt) return false;
    return new Date(v.soldAt) >= firstOfMonth;
  }), [vehicles, firstOfMonth]);

  const salesToday       = isDeliveryVertical && deliveryMetrics
    ? deliveryMetrics.revenueToday
    : (sk?.salesToday ?? 0);
  const salesTodayCount  = isDeliveryVertical && deliveryMetrics
    ? deliveryMetrics.deliveredToday
    : (sk?.salesTodayCount ?? 0);
  const salesMonth       = isDeliveryVertical && deliveryMetrics
    ? deliveryMetrics.revenueMonth
    : (sk?.salesMonth ?? soldThisMonth.reduce((s, v) => s + (v.salePrice || 0), 0));
  const expensesMonth    = sk?.expensesMonth ?? 0;
  const estimatedProfit  = sk?.estimatedProfit ?? (salesMonth - expensesMonth);
  // Delivery: efectivo en cajones abiertos (no la suma de todos los pedidos del año).
  const cashBalance = isDeliveryVertical && deliveryMetrics
    ? Number(deliveryMetrics.cashInRegisters || 0)
    : (sk?.cashBalance ?? 0);
  const criticalStock    = sk?.criticalStockCount ?? 0;
  const activeWorkers    = sk?.activeWorkers ?? 0;
  const totalClockinsToday = sk?.totalClockinsToday ?? 0;
  const openIncidents    = (isDeliveryVertical || isRestaurantVertical)
    && serverData?.deliveryAlerts
    ? Number(serverData.deliveryAlerts.total || 0)
    : (sk?.openIncidents ?? 0);
  const deliveryAlertsCritical = Number(serverData?.deliveryAlerts?.critical || 0);
  const pendingDeliveriesKpi = isDeliveryVertical && deliveryMetrics
    ? deliveryMetrics.activeOrders
    : (sk?.pendingDeliveries ?? 0);
  const stockCount       = sk?.stockCount ?? vehicles.filter(v => v.status === 'listo').length;
  const oportunidades    = (isDeliveryVertical || isRestaurantVertical) && crmClientsCount != null
    ? crmClientsCount
    : (sk?.oportunidades ?? leads.filter(l => l.status !== 'won' && l.status !== 'lost').length);
  const cobrosCount      = sk?.cobrosCount ?? sales.filter(s => s.status === 'pending').length;
  const cobrosPend       = sk?.cobrosPendientes ?? sales.filter(s => s.status === 'pending').reduce((sum, s) => sum + (s.salePrice || 0), 0);

  // ── Funnel ──
  const funnelCounts = useMemo(() => {
    if (serverData?.funnel) return serverData.funnel as Record<string, number>;
    const stages = ['new', 'contacted', 'appointment', 'reserved', 'negotiation', 'won', 'lost'];
    const counts: Record<string, number> = {};
    stages.forEach(s => { counts[s] = leads.filter(l => l.status === s).length; });
    return counts;
  }, [serverData, leads]);

  // ── Alerts ──
  const alerts: DashboardAlert[] = serverData?.alerts ?? [];
  const quickFinance: QuickFinance | null = serverData?.quickFinance ?? null;

  // ── Daily charts ──
  const daysRange = useMemo(() => {
    const end = startOfDay(new Date());
    const start = subDays(end, 13);
    return eachDayOfInterval({ start, end });
  }, []);

  const scopedDeliveryOrders = useMemo(() => {
    if (!deliveryScope) return [];
    return filterOrdersToPortfolioScope(
      deliveryScope.orders,
      deliveryScope.pdvIds,
      deliveryScope.primaryPdvId,
      new Set(deliveryScope.wcScopeIds),
    );
  }, [deliveryScope]);

  const dailySalesData = useMemo((): DailyPoint[] => {
    if (isDeliveryVertical && deliveryScope) {
      return daysRange.map((d) => {
        const dayStr = format(d, 'yyyy-MM-dd');
        return {
          day: dayStr,
          label: format(d, 'd MMM', { locale: es }),
          value: sumDeliveredRevenueOnDay(scopedDeliveryOrders, dayStr),
        };
      });
    }
    return daysRange.map(d => {
      const dayStr = format(d, 'yyyy-MM-dd');
      const daySales = soldThisMonth.filter(v => {
        const sold = v.soldAt ? new Date(v.soldAt) : null;
        return sold && format(startOfDay(sold), 'yyyy-MM-dd') === dayStr;
      });
      return { day: dayStr, label: format(d, 'd MMM', { locale: es }), value: daySales.reduce((s, v) => s + (v.salePrice || 0), 0) };
    });
  }, [isDeliveryVertical, deliveryScope, scopedDeliveryOrders, daysRange, soldThisMonth]);

  const dailyLeadsData = useMemo((): DailyPoint[] => {
    if (isDeliveryVertical && deliveryScope) {
      return daysRange.map((d) => {
        const dayStr = format(d, 'yyyy-MM-dd');
        return {
          day: dayStr,
          label: format(d, 'd MMM', { locale: es }),
          value: countOrdersCreatedOnDay(scopedDeliveryOrders, dayStr),
        };
      });
    }
    return daysRange.map(d => {
      const dayStr = format(d, 'yyyy-MM-dd');
      const count = leads.filter(l => {
        const created = l.createdAt ? new Date(l.createdAt) : null;
        return created && format(startOfDay(created), 'yyyy-MM-dd') === dayStr;
      }).length;
      return { day: dayStr, label: format(d, 'd MMM', { locale: es }), value: count };
    });
  }, [isDeliveryVertical, deliveryScope, scopedDeliveryOrders, daysRange, leads]);

  const soldProductFamilies = useMemo((): SoldProductFamilyMeta[] => {
    if (!isDeliveryVertical) return [];
    const todayKey = localCalendarDayKey();
    const todayCounts = soldProductCountsForDay(scopedDeliveryOrders, todayKey);
    return resolveActiveSoldFamilies(deliveryBrands, todayCounts);
  }, [isDeliveryVertical, deliveryBrands, scopedDeliveryOrders]);

  const soldProductToday = useMemo(() => {
    if (!isDeliveryVertical) return null;
    return soldProductCountsForDay(scopedDeliveryOrders, localCalendarDayKey());
  }, [isDeliveryVertical, scopedDeliveryOrders]);

  const brandHeroToday = useMemo(() => {
    if (!isDeliveryVertical) return [];
    return brandHeroSoldCountsForDay(
      scopedDeliveryOrders,
      deliveryBrands,
      localCalendarDayKey(),
    );
  }, [isDeliveryVertical, scopedDeliveryOrders, deliveryBrands]);

  const soldProductDailyData = useMemo(() => {
    if (!isDeliveryVertical || soldProductFamilies.length === 0) return [];
    const dayKeys = daysRange.map((d) => format(d, 'yyyy-MM-dd'));
    return buildSoldProductDailySeries(
      scopedDeliveryOrders,
      dayKeys,
      soldProductFamilies,
      (dayKey) => {
        const d = daysRange.find((x) => format(x, 'yyyy-MM-dd') === dayKey);
        return d ? format(d, 'd MMM', { locale: es }) : dayKey.slice(5);
      },
    );
  }, [isDeliveryVertical, scopedDeliveryOrders, soldProductFamilies, daysRange]);

  // ── Quick access items ──
  const quickAccessItems = useMemo(() => getQuickAccessItems(vertical), [vertical]);

  // ── Loading state progresivo (por ola / panel) ──
  // Con ola 0 pintada (metrics !== null) no bloqueamos marcas/insights en skeleton eterno:
  // muestran datos parciales y el refresh sigue mientras waveBusy.
  const baseDataLoading = isLoadingVehicles || isLoadingClients;
  const deliveryDataLoading = isDeliveryVertical && deliveryMetrics === null;
  const deliveryBrandsLoading =
    isDeliveryVertical && deliveryDataLoading && deliveryPanelStage < 1;
  const deliveryWorkerLoading =
    isDeliveryVertical
    && deliveryPanelStage < 3
    && deliveryWaveBusy
    && !workerPayMonth;
  const deliveryInsightsLoading =
    isDeliveryVertical && deliveryDataLoading && deliveryPanelStage < 1;
  const alertsLoading = serverLoading && !serverData;
  const chartsLoading = isDeliveryVertical ? deliveryDataLoading : baseDataLoading;

  // ── Funnel totals ──
  const funnelTotal = funnelCounts['new'] || 0;
  const wonCount = funnelCounts['won'] || 0;
  const lostCount = funnelCounts['lost'] || 0;
  const overallConversion = funnelTotal > 0 ? Math.round((wonCount / funnelTotal) * 100) : 0;

  return (
    <Layout
      title={currentBusiness?.name || 'Dashboard'}
      subtitle={
        businesses.length > 1
          ? `Solo esta empresa · operativa y KPIs`
          : 'Estado real de tu negocio'
      }
    >
      {showPersonalize && (
        <PersonalizePanel config={widgetConfig} onUpdate={updateWidgetConfig} onClose={() => setShowPersonalize(false)} />
      )}

      <div className="flex flex-col gap-5">
        {/* Controles mínimos: sin franja vacía a ancho completo */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 -mt-1">
          <LiveBadge
            live={liveSseOk}
            refreshing={serverLoading}
            updatedAt={serverUpdatedAt ? new Date(serverUpdatedAt) : null}
            className="mr-auto"
          />
          {onBackToVertical ? (
            <button
              type="button"
              onClick={onBackToVertical}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Vertical
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={serverLoading}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title="Actualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${serverLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowPersonalize(true)}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title="Personalizar dashboard"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {isBasicPlan && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50 dark:from-slate-900/60 dark:to-indigo-950/30 border border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-3 flex-1">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Dashboard plan {planLabel}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Operativa básica activa. Finanzas, EBITDA, gráficas avanzadas e informes completos desde plan Normal.
                  {lockedWidgets.length > 0 ? ` · ${lockedWidgets.length} bloques en tu plan` : ''}
                </p>
              </div>
            </div>
            <VertialBillingUpgradeLink
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-bold shrink-0"
              fallback={
                <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">
                  En iOS no se cambian planes
                </span>
              }
            >
              Ver planes
            </VertialBillingUpgradeLink>
          </div>
        )}

        {/* Bar/restaurante: facturación 14 días también en vista unificada */}
        {isRestaurantVertical && financeUserId ? (
          <RestaurantDashboardBillingCharts
            userId={financeUserId}
            businessId={businessId}
            businessIdForScope={businessId}
          />
        ) : null}

        {/* Resumen operativo por tienda (solo empresa delivery) — ola 1 */}
        {isDeliveryVertical && deliveryPanelStage < 1 ? (
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:rounded-2xl sm:p-5">
            <div className="mb-3 h-3.5 w-44 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-50 dark:bg-gray-900/50" />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-400">Cargando resumen operativo…</p>
          </section>
        ) : null}
        {isDeliveryVertical && deliveryPanelStage >= 1 && deliveryOpsPulses && (
          <PortfolioOpsPulse
            pulses7d={deliveryOpsPulses.pulses7d}
            pulsesMonth={deliveryOpsPulses.pulsesMonth}
            singleBusiness
            businessId={businessId || undefined}
            brands={deliveryBrands}
            orders={scopedDeliveryOrders}
            refreshButton={
              <button
                type="button"
                onClick={() => void loadDeliveryDashboard()}
                disabled={deliveryWaveBusy || deliveryDataLoading}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                title="Actualizar resumen operativo"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${deliveryWaveBusy || deliveryDataLoading ? 'animate-spin' : ''}`} />
              </button>
            }
          />
        )}

        {isDeliveryVertical && businessId && deliveryPanelStage >= 2 ? (
          <CompanyBrandPerformancePanel
            businessId={businessId}
            brands={deliveryBrands}
            orders={scopedDeliveryOrders}
            sessions={deliveryTpvSessions}
            stores={deliveryScope?.stores || []}
            loading={deliveryBrandsLoading}
          />
        ) : null}

        {isDeliveryVertical && deliveryPanelStage >= 3 ? (
          <WorkerPayMonthPanel
            summary={workerPayMonth}
            loading={deliveryWorkerLoading}
          />
        ) : null}

        {isDeliveryVertical && deliveryPanelStage >= 4 ? (
          <DashboardLazyPanel
            title="Tiempos de entrega"
            hint="Por tienda · abrir para cargar"
            icon={<Timer className="w-4 h-4" />}
            storageKey={`dash_lazy_ops_insights:${dashboardConfigScope}`}
          >
            <DeliveryOpsInsightsPanel
              orders={scopedDeliveryOrders}
              stores={deliveryScope?.stores || []}
              loading={deliveryInsightsLoading}
              newClientsMonth={crmNewClientsMonth}
              newClientsPrevMonth={crmNewClientsPrevMonth}
              newClientsWeek={crmNewClientsWeek}
              newClientsPrevWeek={crmNewClientsPrevWeek}
              newClientsToday={crmNewClientsToday}
              newClientsYesterday={crmNewClientsYesterday}
            />
          </DashboardLazyPanel>
        ) : null}

        {isRestaurantVertical ? (
          <div style={{ order: getWidgetOrder('quick_access') - 0.5 }}>
            <RestaurantLiveDashboardPanelFromContext />
          </div>
        ) : null}

        {/* ═══ ACCESOS RÁPIDOS ═══ */}
        {isVisible('quick_access') && (
          <div style={{ order: getWidgetOrder('quick_access') }}>
            <DraggableWidget id="quick_access" {...dragProps}>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {quickAccessItems.map((item) => (
                  <button
                    key={item.route}
                    onClick={() => navigate(item.route)}
                    className={`${item.bg} rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-all group`}
                  >
                    <span className={item.color}>{item.icon}</span>
                    <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>
            </DraggableWidget>
          </div>
        )}

        {/* ═══ GRÁFICAS PRINCIPALES (colapsadas: recharts solo al abrir) ═══ */}
        {isVisible('charts') && (
          <div style={{ order: getWidgetOrder('charts') }}>
            <DraggableWidget id="charts" {...dragProps}>
              <DashboardLazyPanel
                title="Gráficas principales"
                hint="Entregas, pedidos y productos · abrir para cargar"
                icon={<BarChart3 className="w-4 h-4" />}
                storageKey={`dash_lazy_charts:${dashboardConfigScope}`}
              >
                {chartsLoading ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                          <div className="h-4 w-40 bg-gray-100 dark:bg-gray-700 rounded" />
                        </div>
                        <div className="p-4 h-48">
                          <div className="w-full h-full rounded-xl bg-gray-100 dark:bg-gray-700" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Ventas 14 días */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {isDeliveryVertical ? 'Entregas (14 días)' : 'Ventas (14 días)'}
                        </p>
                      </div>
                      <PeriodBadge period="14d" variant="minimal" className="text-[9px] opacity-50" />
                    </div>
                    <div className="p-4 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailySalesData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <defs>
                            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis hide />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const pt = payload[0].payload as DailyPoint;
                              return (
                                <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                                  <span className="opacity-60 mr-1">{pt.label}</span>
                                  {formatEur(pt.value)}
                                </div>
                              );
                            }}
                          />
                          <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#salesGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Pedidos / leads 14 días */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {isDeliveryVertical ? 'Pedidos nuevos (14 días)' : 'Nuevos leads (14 días)'}
                        </p>
                      </div>
                      <PeriodBadge period="14d" variant="minimal" className="text-[9px] opacity-50" />
                    </div>
                    <div className="p-4 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyLeadsData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <defs>
                            <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis hide />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const pt = payload[0].payload as DailyPoint;
                              return (
                                <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                                  <span className="opacity-60 mr-1">{pt.label}</span>
                                  {pt.value} {isDeliveryVertical ? 'pedidos' : 'leads'}
                                </div>
                              );
                            }}
                          />
                          <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} fill="url(#leadsGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Productos vendidos por tipo (marcas de la empresa) */}
                  {isDeliveryVertical && soldProductFamilies.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden lg:col-span-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <Package className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              Productos vendidos (14 días)
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              Según tipos de marca de la empresa (pizza, kebab, burger…)
                            </p>
                          </div>
                        </div>
                        <PeriodBadge period="14d" variant="minimal" className="text-[9px] opacity-50 self-start sm:self-auto" />
                      </div>
                      {soldProductToday && (
                        <div className="flex flex-wrap gap-2 px-5 pt-3">
                          {soldProductFamilies.map((fam) => {
                            const n = Number(soldProductToday[fam.id] || 0);
                            return (
                              <span
                                key={fam.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
                              >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: fam.color }} />
                                {fam.label} hoy: {n}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="p-4 h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={soldProductDailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} tickLine={false} axisLine={false} />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg space-y-0.5">
                                    <p className="opacity-60 mb-1">{label}</p>
                                    {payload.map((p) => (
                                      <p key={String(p.dataKey)}>
                                        <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: String(p.color || '#fff') }} />
                                        {soldProductFamilies.find((f) => f.id === p.dataKey)?.label || String(p.dataKey)}: {Number(p.value || 0)}
                                      </p>
                                    ))}
                                  </div>
                                );
                              }}
                            />
                            {soldProductFamilies.map((fam) => (
                              <Bar
                                key={fam.id}
                                dataKey={fam.id}
                                name={fam.label}
                                fill={fam.color}
                                radius={[3, 3, 0, 0]}
                                maxBarSize={18}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
                )}
              </DashboardLazyPanel>
            </DraggableWidget>
          </div>
        )}

        {/* ═══ BLOQUE OPERATIVA (colapsado) ═══ */}
        {isVisible('operations') && (
          <div style={{ order: getWidgetOrder('operations') }}>
            <DraggableWidget id="operations" {...dragProps}>
              <DashboardLazyPanel
                title="Operativa del negocio"
                hint="Pedidos, clientes, equipo · abrir para ver"
                icon={<Activity className="w-4 h-4" />}
                storageKey={`dash_lazy_ops:${dashboardConfigScope}`}
              >
                <div className={`grid grid-cols-2 gap-3 ${serverData?.salesClosure ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                  <OperativeBlock
                    vertical={vertical}
                    stockCount={stockCount}
                    oportunidades={oportunidades}
                    newClientsMonth={crmNewClientsMonth}
                    openIncidents={openIncidents}
                    cobrosCount={cobrosCount}
                    activeWorkers={activeWorkers}
                    pendingDeliveries={pendingDeliveriesKpi}
                    loading={serverLoading || verticalKpiLoading}
                    salesClosure={serverData?.salesClosure}
                    verticalKpi={verticalKpi}
                  />
                </div>
              </DashboardLazyPanel>
            </DraggableWidget>
          </div>
        )}

        {/* ═══ BLOQUE FINANCIERO RÁPIDO (colapsado) ═══ */}
        {isVisible('quick_finance') && quickFinance && (
          <div style={{ order: getWidgetOrder('quick_finance') }}>
            <DraggableWidget id="quick_finance" {...dragProps}>
              <DashboardLazyPanel
                title="Resumen financiero"
                hint="Ingresos, gastos y margen · abrir para ver"
                icon={<Euro className="w-4 h-4" />}
                storageKey={`dash_lazy_qfin:${dashboardConfigScope}`}
              >
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <Euro className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Resumen financiero</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full">
                        Este mes
                      </span>
                    </div>
                    <button onClick={() => navigate('/saas/finance')}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                      Ver finanzas <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <FinanceStat label="Ingresos" value={formatEur(quickFinance.incomeMonth)} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/30" icon={<ArrowUpRight className="w-4 h-4" />} />
                      <FinanceStat label="Gastos" value={formatEur(quickFinance.expensesMonth)} color="text-red-600" bg="bg-red-50 dark:bg-red-950/30" icon={<ArrowDownRight className="w-4 h-4" />} />
                      <FinanceStat label="Beneficio" value={formatEur(quickFinance.estimatedProfit)} color={quickFinance.estimatedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} bg={quickFinance.estimatedProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'} icon={<TrendingUp className="w-4 h-4" />} />
                      <FinanceStat label="Pendiente cobro" value={formatEur(quickFinance.pendingAmount)} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/30" icon={<Clock className="w-4 h-4" />} sub={`${quickFinance.pendingInvoices} facturas`} />
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Margen operativo</span>
                        <span className={`text-sm font-black ${quickFinance.marginPct >= 10 ? 'text-emerald-600' : quickFinance.marginPct >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                          {quickFinance.marginPct}%
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            quickFinance.marginPct >= 20 ? 'bg-emerald-500' :
                            quickFinance.marginPct >= 10 ? 'bg-emerald-400' :
                            quickFinance.marginPct >= 0 ? 'bg-amber-400' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.max(Math.min(Math.abs(quickFinance.marginPct), 100), 2)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </DashboardLazyPanel>
            </DraggableWidget>
          </div>
        )}

        {financeUserId && canViewFinanceWidget && (
          <div style={{ order: getWidgetOrder('quick_finance') + 1 }}>
            <DashboardLazyPanel
              title="Finanzas"
              hint="Saldo, ingresos y movimientos · abrir para cargar"
              icon={<Wallet className="w-4 h-4" />}
              storageKey={`dash_lazy_fin:${dashboardConfigScope}`}
            >
              <DashboardFinanceWidget userId={financeUserId} />
            </DashboardLazyPanel>
          </div>
        )}

        {/* ═══ EMBUDO DE VENTAS CRM (colapsado) ═══ */}
        {isVisible('funnel') && vertical !== 'delivery' && DELIVERY_CRM_UI_ENABLED && (
          <div style={{ order: getWidgetOrder('funnel') }}>
            <DraggableWidget id="funnel" {...dragProps}>
              <DashboardLazyPanel
                title="Embudo de ventas CRM"
                hint={`${overallConversion}% conversión · abrir para ver`}
                icon={<TrendingUp className="w-4 h-4" />}
                storageKey={`dash_lazy_funnel:${dashboardConfigScope}`}
              >
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Embudo de ventas CRM</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                        {overallConversion}% conversión
                      </span>
                    </div>
                    <button onClick={() => navigate(clientsRouteForVertical(vertical))}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                      Ver CRM <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {funnelTotal === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-5">
                      <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-3">
                        <Users className="w-5 h-5 text-blue-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">Sin leads aún</p>
                      <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">Los leads aparecerán aquí</p>
                      <button onClick={() => navigate(clientsRouteForVertical(vertical))}
                        className="mt-4 px-4 py-2 bg-gray-900 dark:bg-white hover:bg-black dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-xs font-semibold transition-colors">
                        Ir al CRM
                      </button>
                    </div>
                  ) : (
                    <div className="p-5 space-y-2.5">
                      {FUNNEL_STAGE_KEYS.map((stage) => {
                        const count = funnelCounts[stage.key] || 0;
                        const pctOfTotal = funnelTotal > 0 ? Math.round((count / funnelTotal) * 100) : 0;
                        return (
                          <div key={stage.key} className="flex items-center gap-3">
                            <div className="w-24 flex-shrink-0">
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{stage.label}</p>
                            </div>
                            <div className="flex-1 relative">
                              <div className="h-7 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                                <div className={`h-full ${stage.color} rounded-lg transition-all duration-500`}
                                  style={{ width: `${Math.max(pctOfTotal, 2)}%` }} />
                              </div>
                            </div>
                            <div className={`flex-shrink-0 w-10 h-7 ${stage.light} rounded-lg flex items-center justify-center`}>
                              <span className={`text-xs font-black ${stage.text}`}>{count}</span>
                            </div>
                            <div className="flex-shrink-0 w-10 text-right">
                              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{pctOfTotal}%</span>
                            </div>
                          </div>
                        );
                      })}
                      <div className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">Perdidos: <span className="font-bold text-red-500">{lostCount}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">Ganados: <span className="font-bold text-emerald-600">{wonCount}</span></span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{funnelTotal} leads totales</span>
                      </div>
                    </div>
                  )}
                </div>
              </DashboardLazyPanel>
            </DraggableWidget>
          </div>
        )}

      </div>
    </Layout>
  );
}

// ─── Finance stat sub-component ──────────────────────────────────────────────

function FinanceStat({ label, value, color, bg, icon, sub }: {
  label: string; value: string; color: string; bg: string; icon: React.ReactNode; sub?: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-3`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className={`text-lg font-black ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Operative block (adapts to vertical) ───────────────────────────────────

function OperativeBlock({
  vertical, stockCount, oportunidades, newClientsMonth, openIncidents, cobrosCount, activeWorkers, pendingDeliveries, loading,
  salesClosure, verticalKpi,
}: {
  vertical: string; stockCount: number; oportunidades: number; newClientsMonth?: number | null; openIncidents: number;
  cobrosCount: number; activeWorkers: number; pendingDeliveries: number; loading: boolean;
  salesClosure?: SalesClosureKpis;
  verticalKpi?: VerticalKpiSnapshot | null;
}) {
  const navigate = useNavigate();

  const items = useMemo(() => {
    const crmRoute = clientsRouteForVertical(vertical);
    const crmTitle = vertical === 'delivery' || vertical === 'restaurant' ? 'Clientes' : 'Oportunidades CRM';
    const crmSub =
      vertical === 'delivery' || vertical === 'restaurant'
        ? (typeof newClientsMonth === 'number' && newClientsMonth > 0
          ? `+${newClientsMonth} nuevo${newClientsMonth === 1 ? '' : 's'} este mes`
          : 'Fichas de cliente')
        : 'Leads activos';

    const base = [
      { title: crmTitle, value: String(oportunidades), sub: crmSub, icon: <ShoppingCart className="w-4 h-4" />, bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600', route: crmRoute },
      { title: 'Pagos pendientes', value: String(cobrosCount), sub: 'Por cobrar', icon: <CreditCard className="w-4 h-4" />, bg: cobrosCount > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-gray-50 dark:bg-gray-800', text: cobrosCount > 0 ? 'text-red-600' : 'text-gray-500', route: '/saas/finance' },
      { title: 'Equipo hoy', value: String(activeWorkers), sub: 'Fichados', icon: <UserCheck className="w-4 h-4" />, bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-600', route: '/saas/clockins' },
    ];

    const verticalSpecific: Record<string, { title: string; value: string; sub: string; icon: React.ReactNode; bg: string; text: string; route: string }> = {
      carDealership: { title: 'Stock vehículos', value: String(stockCount), sub: 'Disponibles', icon: <Car className="w-4 h-4" />, bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600', route: '/saas/vehicles' },
      workshop: { title: 'Órdenes taller', value: '—', sub: 'Abiertas', icon: <Wrench className="w-4 h-4" />, bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600', route: '/saas/workshop' },
      delivery: { title: 'Pedidos activos', value: String(pendingDeliveries || 0), sub: 'En curso', icon: <Truck className="w-4 h-4" />, bg: pendingDeliveries > 0 ? 'bg-cyan-50 dark:bg-cyan-950/30' : 'bg-gray-50 dark:bg-gray-800', text: pendingDeliveries > 0 ? 'text-cyan-600' : 'text-gray-500', route: '/saas/delivery-ops' },
      restaurant: { title: 'Centro operativo', value: '—', sub: 'Sala, cocina y caja', icon: <UtensilsCrossed className="w-4 h-4" />, bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-600', route: '/saas/restaurant-ops' },
      cleaning: { title: 'Servicios hoy', value: '—', sub: 'Programados', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/cleaning-hub' },
      gym: { title: 'Socios activos', value: '—', sub: 'Registrados', icon: <Users className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/gym-hub' },
      clinic: { title: 'Citas hoy', value: '—', sub: 'Programadas', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/clinic-appointments' },
      hotel: { title: 'Habitaciones occ.', value: '—', sub: 'Ocupadas hoy', icon: <Building2 className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/hotel-rooms' },
      construction: { title: 'Proyectos activos', value: '—', sub: 'En curso', icon: <Briefcase className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/construction-projects' },
      academy: { title: 'Alumnos activos', value: '—', sub: 'Matriculados', icon: <Users className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/academy-students' },
      realEstate: { title: 'Propiedades', value: '—', sub: 'En cartera', icon: <Building2 className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/realestate-properties' },
      lawyer: { title: 'Casos abiertos', value: '—', sub: 'En curso', icon: <Briefcase className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/lawyer-cases' },
      nightclub: { title: 'Eventos próximos', value: '—', sub: 'Programados', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/nightclub-events' },
      events: { title: 'Eventos activos', value: '—', sub: 'En curso', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/vertical/eventos' },
      hairSalon: { title: 'Citas hoy', value: '—', sub: 'Programadas', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/salon-appointments' },
      scrapyard: { title: 'Vehículos en desguace', value: '—', sub: 'En stock', icon: <Boxes className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/vertical/desguaces' },
      spareParts: { title: 'Catálogo piezas', value: '—', sub: 'Disponibles', icon: <Boxes className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/catalog' },
      taxi: { title: 'Flota activa', value: '—', sub: 'Vehículos', icon: <Car className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/taxi-fleet' },
      pharmacy: { title: 'Inventario', value: '—', sub: 'Productos', icon: <Boxes className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/pharmacy-inventory' },
      carWash: { title: 'Servicios hoy', value: '—', sub: 'Programados', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/carwash-services' },
      vet: { title: 'Pacientes', value: '—', sub: 'Registrados', icon: <Users className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/vet-patients' },
      tobaccoShop: { title: 'Ventas hoy', value: '—', sub: 'Del día', icon: <Receipt className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/tobacco-sales' },
      butcherShop: { title: 'Centro operativo', value: '—', sub: 'Hoy', icon: <Activity className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/butcher-hub' },
    };

    const vItem = verticalKpi
      ? {
          title: verticalKpi.label,
          value: verticalKpi.value,
          sub: verticalKpi.sub,
          icon: verticalSpecific[vertical]?.icon ?? <Activity className="w-4 h-4" />,
          bg: verticalSpecific[vertical]?.bg ?? 'bg-cyan-50 dark:bg-cyan-950/30',
          text: verticalSpecific[vertical]?.text ?? 'text-cyan-600',
          route: verticalKpi.route,
        }
      : (verticalSpecific[vertical] || verticalSpecific.carDealership);
    const row: typeof base = [vItem, ...base];
    if (vertical === 'carDealership' && salesClosure) {
      const n = salesClosure.soldAwaitingDelivery;
      row.splice(1, 0, {
        title: 'Entregas pendientes',
        value: String(n),
        sub: 'Vendido, sin entregar',
        icon: <Truck className="w-4 h-4" />,
        bg: n > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-gray-50 dark:bg-gray-800',
        text: n > 0 ? 'text-amber-700' : 'text-gray-500',
        route: '/saas/vertical/compraventa/entregas',
      });
    }
    return row;
  }, [vertical, stockCount, oportunidades, newClientsMonth, cobrosCount, activeWorkers, pendingDeliveries, salesClosure, verticalKpi]);

  return (
    <>
      {items.map((item) => (
        <button key={item.title} onClick={() => navigate(item.route)}
          className={`${item.bg} rounded-2xl p-4 flex items-center gap-3 text-left hover:brightness-95 dark:hover:brightness-110 transition-all w-full`}>
          <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className={item.text}>{item.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-7 w-10 bg-white/50 dark:bg-white/10 animate-pulse rounded mb-1" />
            ) : (
              <p className={`text-2xl font-black ${item.text} leading-none`}>{item.value}</p>
            )}
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-0.5">{item.title}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{item.sub}</p>
          </div>
        </button>
      ))}
    </>
  );
}
