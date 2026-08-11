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
import { fetchActiveNow, fetchClockinStats, formatMinutes, type ActiveMember, type ClockinStatsSummary } from '../../lib/clockinsApi';
import { fetchAlertsSummary, type AlertsSummary } from '../../lib/clockinAlertsApi';
import { AlertSummaryWidget } from '../../components/saas/AlertSummaryWidget';
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
import { LiveBadge } from '../../components/saas/LiveBadge';
import { GeneralDashboard } from '../../components/saas/GeneralDashboard';
import { useDashboardView } from '../../context/DashboardViewContext';
import { usePortfolioPlanAccess } from '../../hooks/usePortfolioPlanAccess';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { isDeliveryBusinessType, loadDeliveryStores } from '../../lib/deliverySetup';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { RestaurantLiveDashboardPanelFromContext } from '../../components/saas/restaurant/RestaurantLiveDashboardPanel';
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

// ─── Widget personalización ────────────────────────────────────────────────────

type WidgetId = 'kpis_main' | 'quick_access' | 'alertas' | 'charts' | 'operations' | 'quick_finance' | 'funnel' | 'clockins';

interface WidgetConfig {
  id: WidgetId;
  label: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'kpis_main',     label: 'KPIs principales',       visible: true },
  { id: 'alertas',       label: 'Alertas',                visible: true },
  { id: 'quick_access',  label: 'Accesos rápidos',        visible: true },
  { id: 'charts',        label: 'Gráficas principales',   visible: true },
  { id: 'operations',    label: 'Operativa del negocio',  visible: true },
  { id: 'quick_finance', label: 'Bloque financiero',      visible: true },
  { id: 'funnel',        label: 'Embudo de ventas CRM',   visible: true },
  { id: 'clockins',      label: 'Fichajes del equipo',    visible: true },
];

const REMOVED_WIDGET_IDS = new Set(['actividad', 'availability', 'team_rrhh']);

const DASH_CONFIG_KEY = 'vertial_dashboard_config_v3';
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

function MiniBarChart({ data, color }: { data: DailyPoint[]; color: string }) {
  if (!data.length) return null;
  const colorMap: Record<string, string> = {
    blue: '#3b82f6', emerald: '#10b981', amber: '#f59e0b', red: '#ef4444',
    violet: '#8b5cf6', gray: '#6b7280', cyan: '#06b6d4',
  };
  const fillColor = colorMap[color] ?? colorMap.blue;
  const lastIdx = data.length - 1;

  return (
    <div className="h-full w-full min-h-[3.5rem]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 1, left: 1, bottom: 1 }} barCategoryGap="25%">
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.06)', radius: 3 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const pt = payload[0].payload as DailyPoint;
              return (
                <div className="bg-gray-900 text-white text-[10px] font-semibold px-2 py-1 rounded-lg shadow-lg whitespace-nowrap">
                  <span className="opacity-60 mr-1">{pt.label}</span>
                  {pt.value}
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive animationDuration={500} maxBarSize={12}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={fillColor} fillOpacity={idx === lastIdx ? 1 : 0.25 + (idx / lastIdx) * 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  title, value, sub, icon, iconBg, iconColor, trend, onClick, loading, miniChart, detail,
}: {
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: { value: string; up: boolean | null };
  onClick?: () => void;
  loading?: boolean;
  miniChart?: React.ReactNode;
  /** Sustituye el valor grande (p. ej. desglose por marca). */
  detail?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-5 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all group"
    >
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
            <div className={`w-8 h-8 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <span className={iconColor}>{icon}</span>
            </div>
          </div>
          {loading ? (
            <div className="h-8 w-20 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg mb-1" />
          ) : detail ? (
            <div className="mb-0.5 min-h-[2rem]">{detail}</div>
          ) : (
            <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-gray-100 mb-0.5 leading-none">{value}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {!loading && !detail && trend && (
              <span className={`flex items-center gap-0.5 text-[11px] font-bold ${
                trend.up === true ? 'text-emerald-600' : trend.up === false ? 'text-red-500' : 'text-gray-400'
              }`}>
                {trend.up === true ? <ArrowUpRight className="w-3 h-3" /> : trend.up === false ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {trend.value}
              </span>
            )}
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{loading ? '…' : sub}</span>
          </div>
        </div>
        {!loading && miniChart && (
          <div className="w-20 flex-shrink-0 flex items-end">{miniChart}</div>
        )}
      </div>
    </button>
  );
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
  const [showUnifiedDashboard, setShowUnifiedDashboard] = useState(false);

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
  // Delivery (pizzería/burger/…): SIEMPRE el dashboard completo (pulse, marcas, KPIs, gráficas).
  if ((isMobile || isVertialNativeApp()) && !isPortfolioView) {
    const isDelivery =
      vertical === 'delivery' || isDeliveryBusinessType(currentBusiness?.businessType);
    if (!isDelivery) {
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
  const [clockinsActive, setClockinsActive] = useState<ActiveMember[]>([]);
  const [clockinsStatsSummary, setClockinsStatsSummary] = useState<ClockinStatsSummary | null>(null);
  const [clockinsAlertsSummary, setClockinsAlertsSummary] = useState<AlertsSummary | null>(null);
  const [clockinsLoading, setClockinsLoading] = useState(false);
  const [deliveryMetrics, setDeliveryMetrics] = useState<PortfolioMetrics | null>(null);
  const [deliveryScope, setDeliveryScope] = useState<{
    orders: DeliveryOrder[];
    pdvIds: string[];
    primaryPdvId: string | null;
    wcScopeIds: string[];
    /** Total de pedidos de la empresa (meta del filtro API). */
    ordersTotal: number;
    /** Tiendas / PDV delivery para desglose de tiempos. */
    stores: Array<{ id: string; name: string }>;
  } | null>(null);
  const [deliveryOpsPulses, setDeliveryOpsPulses] = useState<{
    pulses7d: StoreOpsPulse[];
    pulsesMonth: StoreOpsPulse[];
  } | null>(null);
  const [workerPayMonth, setWorkerPayMonth] = useState<WorkerPayMonthSummary | null>(null);
  /** Cierres de caja cargados (para sumar Caja 2 al panel de Marcas). */
  const [deliveryTpvSessions, setDeliveryTpvSessions] = useState<TpvRegisterSession[]>([]);

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
      return;
    }
    const dataUserId = resolveBusinessDataUserId(authUser, currentBusiness);
    if (!dataUserId) {
      setDeliveryMetrics(emptyPortfolioMetrics());
      setDeliveryScope(null);
      setDeliveryOpsPulses({ pulses7d: [], pulsesMonth: [] });
      setWorkerPayMonth(null);
      setDeliveryTpvSessions([]);
      return;
    }
    const scopeBusinessId = String(currentBusiness.business_id || currentBusiness.id || '')
      .replace(/^business:/, '')
      .trim();
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
    try {
      const [
        { pointsOfSale, workCenters },
        orderResult,
        prevYearOrderResult,
        tpvSessions,
        ordersCountResult,
        staffConsumptionsResult,
      ] = await Promise.all([
        loadDeliveryStores(authUser, currentBusiness, {
          accountBusinessCount: businesses.length || 1,
        }).catch(() => ({
          dataUserId: '',
          workCenters: [],
          pointsOfSale: [],
        })),
        filterDeliveryOrdersRequest(dataUserId, {
          dateFrom: orderFetchFrom,
          dateTo: monthEnd,
          limit: 2500,
          ...(scopeBusinessId ? { businessId: scopeBusinessId } : {}),
        }).catch(() => ({ orders: [], total: 0 })),
        // Solo YTD año anterior para “vs año ant.” en panel marcas (ligero).
        filterDeliveryOrdersRequest(dataUserId, {
          dateFrom: prevYtdFrom,
          dateTo: prevYtdTo,
          limit: 1500,
          ...(scopeBusinessId ? { businessId: scopeBusinessId } : {}),
        }).catch(() => ({ orders: [], total: 0 })),
        listTpvRegisterSessionsRequest(dataUserId, {
          ...(scopeBusinessId ? { businessId: scopeBusinessId } : {}),
          // Misma ventana útil que el resumen (mes + MoM): sin dateFrom el listado
          // puede truncar y los integradores de Caja 2 no entran en CANALES.
          dateFrom: localDayBoundsForKey(
            (() => {
              const d = new Date(`${todayKey}T12:00:00`);
              d.setDate(d.getDate() - 45);
              return localCalendarDayKey(d);
            })(),
          ).from,
        }).catch(() => []),
        // Total real de la empresa (sin recortar por fechas del dashboard)
        filterDeliveryOrdersRequest(dataUserId, {
          limit: 1,
          ...(scopeBusinessId ? { businessId: scopeBusinessId } : {}),
        }).catch(() => ({ orders: [], total: 0 })),
        listStaffConsumptionsRequest(dataUserId, { month: monthKey }).catch(() => ({
          items: [],
          summary: { count: 0, total: 0, cashNowTotal: 0, payrollTotal: 0 },
        })),
      ]);
      const mergedOrdersById = new Map<string, DeliveryOrder>();
      for (const o of [...(orderResult.orders || []), ...(prevYearOrderResult.orders || [])]) {
        const id = String(o?._id || '').trim();
        if (id) mergedOrdersById.set(id, o);
      }
      const orderResultMerged = {
        orders: Array.from(mergedOrdersById.values()),
        total: ordersCountResult.total || mergedOrdersById.size,
      };
      const activePdvIds = pointsOfSale.filter((p) => p.active !== false).map((p) => p._id);
      const orderPdvIds = [
        ...new Set(
          (orderResultMerged.orders || [])
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

      // Fuentes del resumen: PDVs cargados + pedidos + cierres de caja.
      // Así la lista no se vacía si falla el enlace WC↔PDV o el filtro de scope.
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
          buildStoreOpsPulse(orderResultMerged.orders || [], {
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
        .map((s) => ({ id: s.id, name: s.name }))
        .filter((s) => s.id);

      setWorkerPayMonth(
        buildWorkerPayMonthSummary(
          tpvSessions || [],
          monthKey,
          staffConsumptionsResult.items || [],
        ),
      );
      setDeliveryTpvSessions(tpvSessions || []);

      if (pulseStores.length === 0 && (orderResultMerged.orders || []).length === 0) {
        setDeliveryMetrics(emptyPortfolioMetrics());
        setDeliveryOpsPulses({ pulses7d: [], pulsesMonth: [] });
        setDeliveryScope({
          orders: orderResultMerged.orders,
          pdvIds,
          primaryPdvId: null,
          wcScopeIds: [...wcScope],
          ordersTotal: Number(ordersCountResult.total || orderResultMerged.total || 0),
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
          : computePortfolioMetrics(
              orderResultMerged.orders,
              scopePdvIds,
              primaryPdv,
              todayKey,
              wcScope,
            );
      setDeliveryMetrics(applyTpvCashMetrics(baseMetrics, tpvSessions || [], scopePdvIds, todayKey));
      setDeliveryOpsPulses({
        pulses7d: buildPulses(keys7d),
        pulsesMonth: buildPulses(keysMonth),
      });
      const scopedForTotal = filterOrdersToPortfolioScope(
        orderResultMerged.orders || [],
        scopePdvIds,
        primaryPdv,
        wcScope,
      );
      setDeliveryScope({
        orders: orderResultMerged.orders,
        pdvIds: scopePdvIds,
        primaryPdvId: primaryPdv,
        wcScopeIds: [...wcScope],
        ordersTotal: Math.max(
          Number(ordersCountResult.total || 0),
          Number(orderResultMerged.total || 0),
          scopedForTotal.length,
        ),
        stores: deliveryStores,
      });
    } catch (err) {
      console.warn('[Dashboard] loadDeliveryDashboard', err);
      setDeliveryMetrics(emptyPortfolioMetrics());
      setDeliveryScope(null);
      // Nunca ocultar el bloque «Resumen operativo»: con error se muestra vacío.
      setDeliveryOpsPulses({ pulses7d: [], pulsesMonth: [] });
      setWorkerPayMonth(null);
      setDeliveryTpvSessions([]);
    }
  }, [isDeliveryVertical, authUser, currentBusiness, businesses.length]);

  useEffect(() => {
    void loadDeliveryDashboard();
  }, [loadDeliveryDashboard]);

  const [crmClientsCount, setCrmClientsCount] = useState<number | null>(null);
  const [crmNewClientsMonth, setCrmNewClientsMonth] = useState<number | null>(null);
  const [crmNewClientsPrevMonth, setCrmNewClientsPrevMonth] = useState<number | null>(null);
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
      // Capado: no bajar los ~6k de Pau (saturaba API y dejaba el TPV ciego).
      const { totalClients, sample } = await fetchClientAcquisitionSample(financeUserId, {
        monthKey,
        businessId: businessId || undefined,
      });
      const metrics = computePortfolioClientMetrics(sample, monthKey);
      let newToday = 0;
      let newYesterday = 0;
      for (const client of sample) {
        if (!countsTowardNewClientMetrics(client)) continue;
        const raw = client.createdAt;
        const iso = raw instanceof Date ? raw.toISOString() : String(raw || '');
        if (!iso) continue;
        const day = localCalendarDayKey(new Date(iso));
        if (day === todayKey) newToday += 1;
        else if (day === yesterdayKey) newYesterday += 1;
      }
      setCrmClientsCount(totalClients || sample.length);
      setCrmNewClientsMonth(metrics.newClientsMonth);
      setCrmNewClientsPrevMonth(metrics.newClientsPrevMonth);
      setCrmNewClientsToday(newToday);
      setCrmNewClientsYesterday(newYesterday);
    } catch {
      setCrmClientsCount(null);
      setCrmNewClientsMonth(null);
      setCrmNewClientsPrevMonth(null);
      setCrmNewClientsToday(null);
      setCrmNewClientsYesterday(null);
    }
  }, [financeUserId, businessId, isDeliveryVertical, isRestaurantVertical]);

  useEffect(() => {
    void loadCrmClientsCount();
  }, [loadCrmClientsCount]);

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
        clockinsActive: ActiveMember[];
        clockinsStatsSummary: ClockinStatsSummary | null;
        clockinsAlertsSummary: AlertsSummary | null;
      };
      if (!cached?.at || Date.now() - cached.at > DASH_RUNTIME_TTL_MS) return;
      setServerData(cached.serverData || null);
      setServerUpdatedAt(cached.serverUpdatedAt || null);
      setClockinsActive(Array.isArray(cached.clockinsActive) ? cached.clockinsActive : []);
      setClockinsStatsSummary(cached.clockinsStatsSummary || null);
      setClockinsAlertsSummary(cached.clockinsAlertsSummary || null);
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
      Promise.all([
        fetchActiveNow(businessId),
        fetchClockinStats(businessId),
        fetchAlertsSummary(businessId),
      ])
        .then(([active, stats, alertsSummary]) => {
          setClockinsActive(Array.isArray(active) ? active : []);
          setClockinsStatsSummary(stats?.summary || null);
          setClockinsAlertsSummary(alertsSummary || null);
        })
        .catch(() => { /* noop */ });
    }, 45000);
    return () => window.clearInterval(intervalId);
  }, [businessId, authUser?.user_id]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    setClockinsLoading(true);
    Promise.all([
      fetchActiveNow(businessId),
      fetchClockinStats(businessId),
      fetchAlertsSummary(businessId),
    ])
      .then(([active, stats, alertsSummary]) => {
        if (cancelled) return;
        setClockinsActive(Array.isArray(active) ? active : []);
        setClockinsStatsSummary(stats?.summary || null);
        setClockinsAlertsSummary(alertsSummary || null);
        setClockinsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setClockinsActive([]);
        setClockinsStatsSummary(null);
        setClockinsAlertsSummary(null);
        setClockinsLoading(false);
      });
    return () => { cancelled = true; };
  }, [businessId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        getDashboardRuntimeCacheKey(runtimeCacheScope),
        JSON.stringify({
          at: Date.now(),
          serverData,
          serverUpdatedAt,
          clockinsActive,
          clockinsStatsSummary,
          clockinsAlertsSummary,
        }),
      );
    } catch {
      // noop
    }
  }, [runtimeCacheScope, serverData, serverUpdatedAt, clockinsActive, clockinsStatsSummary, clockinsAlertsSummary]);

  // ── Refresh handler ──
  const handleRefresh = useCallback(() => {
    if (!authUser?.user_id || serverLoading) return;
    setServerLoading(true);
    setClockinsLoading(true);
    fetchDashboardData(authUser.user_id)
      .then((data) => { setServerData(data); setServerUpdatedAt(data.updatedAt); setServerLoading(false); })
      .catch(() => setServerLoading(false));
    if (isDeliveryVertical) {
      void loadDeliveryDashboard();
    }
    if (businessId) {
      Promise.all([
        fetchActiveNow(businessId),
        fetchClockinStats(businessId),
        fetchAlertsSummary(businessId),
      ])
        .then(([active, stats, alertsSummary]) => {
          setClockinsActive(Array.isArray(active) ? active : []);
          setClockinsStatsSummary(stats?.summary || null);
          setClockinsAlertsSummary(alertsSummary || null);
          setClockinsLoading(false);
        })
        .catch(() => {
          setClockinsActive([]);
          setClockinsStatsSummary(null);
          setClockinsAlertsSummary(null);
          setClockinsLoading(false);
        });
    } else {
      setClockinsLoading(false);
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

  // ── Loading state progresivo ──
  const baseDataLoading = isLoadingVehicles || isLoadingClients;
  const deliveryDataLoading = isDeliveryVertical && deliveryMetrics === null;
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

        {/* Resumen operativo por tienda (solo empresa delivery) */}
        {isDeliveryVertical && deliveryOpsPulses && (
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
                disabled={deliveryDataLoading}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                title="Actualizar resumen operativo"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${deliveryDataLoading ? 'animate-spin' : ''}`} />
              </button>
            }
          />
        )}

        {isDeliveryVertical && businessId ? (
          <CompanyBrandPerformancePanel
            businessId={businessId}
            brands={deliveryBrands}
            orders={scopedDeliveryOrders}
            sessions={deliveryTpvSessions}
            loading={deliveryDataLoading}
          />
        ) : null}

        {isDeliveryVertical ? (
          <WorkerPayMonthPanel
            summary={workerPayMonth}
            loading={deliveryDataLoading && !workerPayMonth}
          />
        ) : null}

        {isDeliveryVertical ? (
          <DeliveryOpsInsightsPanel
            orders={scopedDeliveryOrders}
            stores={deliveryScope?.stores || []}
            loading={deliveryDataLoading}
            newClientsMonth={crmNewClientsMonth}
            newClientsPrevMonth={crmNewClientsPrevMonth}
            newClientsToday={crmNewClientsToday}
            newClientsYesterday={crmNewClientsYesterday}
          />
        ) : null}

        {/* ═══ KPIs PRINCIPALES — 8 tarjetas ═══ */}
        {isVisible('kpis_main') && (
          <div style={{ order: getWidgetOrder('kpis_main') }}>
            <DraggableWidget id="kpis_main" {...dragProps}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard
                  title="Ventas hoy"
                  value={salesToday > 0 ? formatEur(salesToday) : '—'}
                  sub={isDeliveryVertical && deliveryMetrics
                    ? `${deliveryMetrics.deliveredToday} entrega${deliveryMetrics.deliveredToday !== 1 ? 's' : ''} hoy`
                    : (salesTodayCount > 0 ? `${salesTodayCount} operación${salesTodayCount > 1 ? 'es' : ''}` : 'Sin ventas hoy')}
                  icon={<DollarSign className="w-4 h-4" />}
                  iconBg="bg-emerald-100 dark:bg-emerald-900/40"
                  iconColor="text-emerald-600"
                  trend={salesTodayCount > 0 ? { value: `+${salesTodayCount}`, up: true } : undefined}
                  onClick={() => navigate(isCompraventaVertical ? '/saas/vertical/compraventa/ventas' : '/saas/sales')}
                  loading={isDeliveryVertical ? deliveryDataLoading : serverLoading}
                />
                {(isDeliveryVertical || isRestaurantVertical) && (
                  <KPICard
                    title="Alertas ops"
                    value={String(openIncidents)}
                    sub={
                      openIncidents > 0
                        ? `${deliveryAlertsCritical} crítica${deliveryAlertsCritical === 1 ? '' : 's'}`
                        : 'Sin alertas'
                    }
                    icon={<ShieldAlert className="w-4 h-4" />}
                    iconBg={openIncidents > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-emerald-100 dark:bg-emerald-900/40'}
                    iconColor={openIncidents > 0 ? 'text-red-600' : 'text-emerald-600'}
                    trend={openIncidents > 0 ? { value: `${openIncidents} abierta${openIncidents > 1 ? 's' : ''}`, up: false } : undefined}
                    onClick={() => navigate(isDeliveryVertical ? '/saas/delivery-ops' : RESTAURANT_CAJA_PATH)}
                    loading={serverLoading}
                  />
                )}
                <KPICard
                  title="Ventas mes"
                  value={salesMonth > 0 ? formatEur(salesMonth) : '—'}
                  sub={isDeliveryVertical && deliveryMetrics
                    ? `${deliveryMetrics.deliveredMonth} entregas este mes`
                    : `${sk?.soldThisMonthCount ?? soldThisMonth.length} ventas este mes`}
                  icon={<TrendingUp className="w-4 h-4" />}
                  iconBg="bg-blue-100 dark:bg-blue-900/40"
                  iconColor="text-blue-600"
                  trend={salesMonth > 0 ? { value: formatEur(salesMonth), up: true } : undefined}
                  onClick={() => navigate('/saas/sales-metrics')}
                  loading={isDeliveryVertical ? deliveryDataLoading : serverLoading}
                  miniChart={<MiniBarChart data={dailySalesData} color="blue" />}
                />
                {isDeliveryVertical ? (
                  <KPICard
                    title="Pedidos totales"
                    value={
                      deliveryScope != null
                        ? String(deliveryScope.ordersTotal)
                        : '—'
                    }
                    sub={
                      deliveryMetrics
                        ? `${deliveryMetrics.ordersMonth} este mes · ${deliveryMetrics.ordersToday} hoy`
                        : 'Pedidos de la empresa'
                    }
                    icon={<Hash className="w-4 h-4" />}
                    iconBg="bg-violet-100 dark:bg-violet-900/40"
                    iconColor="text-violet-600"
                    trend={
                      deliveryMetrics && deliveryMetrics.ordersToday > 0
                        ? { value: `+${deliveryMetrics.ordersToday} hoy`, up: true }
                        : undefined
                    }
                    onClick={() => navigate('/saas/delivery-ops')}
                    loading={deliveryDataLoading}
                  />
                ) : (
                  <KPICard
                    title="Gastos mes"
                    value={expensesMonth > 0 ? formatEur(expensesMonth) : '—'}
                    sub="Pagos registrados"
                    icon={<CreditCard className="w-4 h-4" />}
                    iconBg="bg-red-100 dark:bg-red-900/40"
                    iconColor="text-red-600"
                    trend={expensesMonth > 0 ? { value: formatEur(expensesMonth), up: false } : undefined}
                    onClick={() => navigate('/saas/income-expenses')}
                    loading={serverLoading}
                  />
                )}
                <KPICard
                  title={canViewEbitda ? 'EBITDA mes' : 'Beneficio est.'}
                  value={
                    canViewEbitda && ebitdaMonth
                      ? formatEur(ebitdaMonth.ebitda)
                      : (salesMonth > 0 ? formatEur(estimatedProfit) : '—')
                  }
                  sub={
                    canViewEbitda && ebitdaMonth
                      ? coreEbitdaSubtitle(ebitdaMonth, currentBusiness?.name)
                      : isBasicPlan
                        ? 'Sube a Normal para EBITDA'
                        : (quickFinance ? `Margen ${quickFinance.marginPct}%` : 'Empresa activa')
                  }
                  icon={<PieChart className="w-4 h-4" />}
                  iconBg={(canViewEbitda && ebitdaMonth ? ebitdaMonth.ebitda : estimatedProfit) >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-red-100 dark:bg-red-900/40'}
                  iconColor={(canViewEbitda && ebitdaMonth ? ebitdaMonth.ebitda : estimatedProfit) >= 0 ? 'text-emerald-600' : 'text-red-600'}
                  trend={
                    canViewEbitda && ebitdaMonth
                      ? (ebitdaMonth.quality === 'income_only'
                        ? { value: 'Sin gastos', up: null }
                        : ebitdaMonth.quality === 'empty'
                          ? undefined
                          : { value: `${ebitdaMonth.ebitdaMargin.toFixed(1)}%`, up: ebitdaMonth.ebitda > 0 ? true : ebitdaMonth.ebitda < 0 ? false : null })
                      : (salesMonth > 0 ? { value: `${quickFinance?.marginPct ?? 0}%`, up: estimatedProfit > 0 ? true : estimatedProfit < 0 ? false : null } : undefined)
                  }
                  onClick={() => {
                    if (canViewEbitda) {
                      navigate('/saas/ebitda');
                      return;
                    }
                    if (!isIosCustomerAccessOnlyApp()) {
                      navigate('/saas/billing');
                    }
                  }}
                  loading={canViewEbitda ? ebitdaLoading : serverLoading}
                />
                <KPICard
                  title="Caja actual"
                  value={formatEur(cashBalance)}
                  sub={
                    isDeliveryVertical
                      ? (deliveryMetrics && deliveryMetrics.openCashRegisters > 0
                        ? `${deliveryMetrics.openCashRegisters} caja${deliveryMetrics.openCashRegisters !== 1 ? 's' : ''} abierta${deliveryMetrics.openCashRegisters !== 1 ? 's' : ''}`
                        : (cashBalance > 0 ? 'Cobros de pedidos' : 'Sin cobros aún'))
                      : (cashBalance >= 0 ? 'Balance positivo' : 'Balance negativo')
                  }
                  icon={<Wallet className="w-4 h-4" />}
                  iconBg={cashBalance >= 0 ? 'bg-cyan-100 dark:bg-cyan-900/40' : 'bg-red-100 dark:bg-red-900/40'}
                  iconColor={cashBalance >= 0 ? 'text-cyan-600' : 'text-red-600'}
                  trend={cashBalance !== 0 ? { value: formatEur(Math.abs(cashBalance)), up: cashBalance >= 0 ? true : false } : undefined}
                  onClick={() => navigate(isDeliveryVertical ? DELIVERY_CAJA_PATH : '/saas/finance')}
                  loading={isDeliveryVertical ? deliveryDataLoading : serverLoading}
                />
                <KPICard
                  title={isDeliveryVertical ? 'Pedidos activos' : 'Stock crítico'}
                  value={isDeliveryVertical ? String(pendingDeliveriesKpi) : String(criticalStock)}
                  sub={
                    isDeliveryVertical
                      ? (pendingDeliveriesKpi > 0 ? 'En cocina / reparto' : 'Sin pedidos en curso')
                      : (criticalStock > 0 ? 'Productos bajo mínimo' : 'Todo en orden')
                  }
                  icon={isDeliveryVertical ? <Truck className="w-4 h-4" /> : <Boxes className="w-4 h-4" />}
                  iconBg={
                    isDeliveryVertical
                      ? (pendingDeliveriesKpi > 0 ? 'bg-cyan-100 dark:bg-cyan-900/40' : 'bg-gray-100 dark:bg-gray-700')
                      : (criticalStock > 0 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-gray-100 dark:bg-gray-700')
                  }
                  iconColor={
                    isDeliveryVertical
                      ? (pendingDeliveriesKpi > 0 ? 'text-cyan-600' : 'text-gray-400')
                      : (criticalStock > 0 ? 'text-amber-600' : 'text-gray-400')
                  }
                  trend={
                    isDeliveryVertical
                      ? (pendingDeliveriesKpi > 0 ? { value: `${pendingDeliveriesKpi} en curso`, up: true } : undefined)
                      : (criticalStock > 0 ? { value: `${criticalStock} alertas`, up: false } : undefined)
                  }
                  onClick={() => navigate(
                    isDeliveryVertical
                      ? '/saas/delivery-ops'
                      : isRestaurantVertical
                        ? '/saas/restaurant-ops'
                        : '/saas/catalog',
                  )}
                  loading={isDeliveryVertical ? deliveryDataLoading : serverLoading}
                />
                {isDeliveryVertical ? (
                  <KPICard
                    title="Por marca · hoy"
                    value={
                      brandHeroToday.length === 0
                        ? '—'
                        : String(brandHeroToday.reduce((s, b) => s + b.count, 0))
                    }
                    sub={
                      brandHeroToday.length === 0
                        ? 'Configura marcas en Ajustes'
                        : brandHeroToday.length === 1
                          ? `${brandHeroToday[0].familyLabel} de ${brandHeroToday[0].brandName}`
                          : `${brandHeroToday.length} marcas`
                    }
                    icon={<Package className="w-4 h-4" />}
                    iconBg="bg-amber-100 dark:bg-amber-900/40"
                    iconColor="text-amber-700"
                    detail={
                      brandHeroToday.length > 0 ? (
                        <div className="space-y-1">
                          {brandHeroToday.slice(0, 3).map((row) => (
                            <div
                              key={row.brandId}
                              className="flex items-baseline justify-between gap-2 text-sm leading-tight"
                            >
                              <span className="truncate text-gray-600 dark:text-gray-300 font-medium">
                                {row.brandName}
                              </span>
                              <span className="shrink-0 font-black text-gray-900 dark:text-gray-100 tabular-nums">
                                {row.count}{' '}
                                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                  {row.familyLabel.toLowerCase()}
                                </span>
                              </span>
                            </div>
                          ))}
                          {brandHeroToday.length > 3 && (
                            <p className="text-[10px] text-gray-400">+{brandHeroToday.length - 3} más</p>
                          )}
                        </div>
                      ) : undefined
                    }
                    onClick={() => navigate('/saas/sales-metrics')}
                    loading={deliveryDataLoading}
                  />
                ) : (
                  <>
                    <KPICard
                      title="Equipo activo"
                      value={activeWorkers > 0 ? String(activeWorkers) : totalClockinsToday > 0 ? String(totalClockinsToday) : '—'}
                      sub={totalClockinsToday > 0 ? `${totalClockinsToday} fichaje${totalClockinsToday > 1 ? 's' : ''} hoy` : 'Sin fichajes hoy'}
                      icon={<UserCheck className="w-4 h-4" />}
                      iconBg="bg-violet-100 dark:bg-violet-900/40"
                      iconColor="text-violet-600"
                      trend={activeWorkers > 0 ? { value: `${activeWorkers} ahora`, up: true } : undefined}
                      onClick={() => navigate('/saas/clockins')}
                      loading={serverLoading}
                    />
                    {!isRestaurantVertical && (
                      <KPICard
                        title="Incidencias"
                        value={String(openIncidents)}
                        sub={openIncidents > 0 ? 'Abiertas ahora' : 'Sin incidencias'}
                        icon={<ShieldAlert className="w-4 h-4" />}
                        iconBg={openIncidents > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-emerald-100 dark:bg-emerald-900/40'}
                        iconColor={openIncidents > 0 ? 'text-red-600' : 'text-emerald-600'}
                        trend={openIncidents > 0 ? { value: `${openIncidents} abierta${openIncidents > 1 ? 's' : ''}`, up: false } : undefined}
                        onClick={() => navigate('/saas/workshop')}
                        loading={serverLoading}
                      />
                    )}
                  </>
                )}
              </div>
            </DraggableWidget>
          </div>
        )}

        {isRestaurantVertical ? (
          <div style={{ order: getWidgetOrder('kpis_main') + 0.5 }}>
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

        {/* ═══ CENTRO DE ALERTAS ═══ */}
        {isVisible('alertas') && (
          <div style={{ order: getWidgetOrder('alertas') }}>
            <DraggableWidget id="alertas" {...dragProps}>
              <AlertSummaryWidget embedded />
            </DraggableWidget>
          </div>
        )}

        {/* ═══ GRÁFICAS PRINCIPALES ═══ */}
        {isVisible('charts') && (
          <div style={{ order: getWidgetOrder('charts') }}>
            <DraggableWidget id="charts" {...dragProps}>
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
            </DraggableWidget>
          </div>
        )}

        {/* ═══ BLOQUE OPERATIVA SEGÚN VERTICAL ═══ */}
        {isVisible('operations') && (
          <div style={{ order: getWidgetOrder('operations') }}>
            <DraggableWidget id="operations" {...dragProps}>
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
            </DraggableWidget>
          </div>
        )}

        {/* ═══ BLOQUE FINANCIERO RÁPIDO ═══ */}
        {isVisible('quick_finance') && quickFinance && (
          <div style={{ order: getWidgetOrder('quick_finance') }}>
            <DraggableWidget id="quick_finance" {...dragProps}>
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

                  {/* Progress bar de margen */}
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
            </DraggableWidget>
          </div>
        )}

        {financeUserId && canViewFinanceWidget && (
          <div style={{ order: getWidgetOrder('quick_finance') + 1 }}>
            <DashboardFinanceWidget userId={financeUserId} />
          </div>
        )}

        {/* ═══ EMBUDO DE VENTAS CRM ═══ */}
        {isVisible('funnel') && vertical !== 'delivery' && DELIVERY_CRM_UI_ENABLED && (
          <div style={{ order: getWidgetOrder('funnel') }}>
            <DraggableWidget id="funnel" {...dragProps}>
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
                    {FUNNEL_STAGE_KEYS.map((stage, i) => {
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
            </DraggableWidget>
          </div>
        )}

        {/* ═══ FICHAJES DEL EQUIPO ═══ */}
        {isVisible('clockins') && (
          <div style={{ order: getWidgetOrder('clockins') }}>
            <DraggableWidget id="clockins" {...dragProps}>
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Fichajes hoy</p>
                    {clockinsAlertsSummary && clockinsAlertsSummary.total > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-red-500 text-white">{clockinsAlertsSummary.total}</span>
                    )}
                  </div>
                  <button onClick={() => navigate('/saas/clockins')} className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                    Ver fichajes <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {clockinsLoading ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="grid grid-cols-3 gap-3">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-700" />)}
                      </div>
                      <div className="h-10 rounded-xl bg-gray-100 dark:bg-gray-700" />
                    </div>
                  ) : (
                    <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-xl bg-green-50 dark:bg-green-900/20">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400">{clockinsActive.filter(a => a.status === 'active').length}</p>
                      <p className="text-[10px] font-medium text-green-600 dark:text-green-400/70 uppercase">Trabajando</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{clockinsActive.filter(a => a.status === 'break').length}</p>
                      <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400/70 uppercase">Descanso</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                      <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{clockinsStatsSummary ? formatMinutes(clockinsStatsSummary.totalMinutes) : '—'}</p>
                      <p className="text-[10px] font-medium text-slate-500 uppercase">Total semana</p>
                    </div>
                  </div>
                  {clockinsActive.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {clockinsActive.slice(0, 8).map((a) => (
                        <div key={a.member_id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          a.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${a.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                          {a.member_name.split(' ')[0]}
                        </div>
                      ))}
                      {clockinsActive.length > 8 && (
                        <span className="flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500">+{clockinsActive.length - 8}</span>
                      )}
                    </div>
                  )}
                  {clockinsAlertsSummary && clockinsAlertsSummary.total > 0 && (
                    <button onClick={() => navigate('/saas/clockins')} className="w-full flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="text-xs font-medium text-red-700 dark:text-red-400">
                          {clockinsAlertsSummary.total} {clockinsAlertsSummary.total === 1 ? 'alerta' : 'alertas'}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  )}
                    </>
                  )}
                </div>
              </div>
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
