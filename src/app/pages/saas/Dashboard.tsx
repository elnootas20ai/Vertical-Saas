import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { fetchDashboardData, type DashboardServerData, type DashboardAlert, type QuickFinance, type SalesClosureKpis } from '../../lib/dashboardApi';
import { fetchActiveNow, fetchClockinStats, formatMinutes, type ActiveMember, type ClockinStatsSummary } from '../../lib/clockinsApi';
import { fetchAlertsSummary, type AlertsSummary } from '../../lib/clockinAlertsApi';
import { listDeliveryOrdersRequest, type DeliveryOrder, type DeliveryOrderStatus } from '../../lib/deliveryApi';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart,
} from 'recharts';
import { PeriodBadge } from '../../components/ui/PeriodBadge';
import { subDays, eachDayOfInterval, startOfDay, format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { BusinessType } from '../../lib/businessApi';

import { GeneralDashboard } from '../../components/saas/GeneralDashboard';
import { GymDashboard } from './dashboards/GymDashboard';
import { ClinicDashboard } from './dashboards/ClinicDashboard';
import { HotelDashboard } from './dashboards/HotelDashboard';
import { ConstructionDashboard } from './dashboards/ConstructionDashboard';
import { AcademyDashboard } from './dashboards/AcademyDashboard';
import { RealEstateDashboard } from './dashboards/RealEstateDashboard';
import { LawyerDashboard } from './dashboards/LawyerDashboard';
import { NightclubDashboard } from './dashboards/NightclubDashboard';
import { EventsDashboard } from './dashboards/EventsDashboard';
import { HairSalonDashboard } from './dashboards/HairSalonDashboard';
import { ScrapyardDashboard } from './dashboards/ScrapyardDashboard';
import { SparePartsDashboard } from './dashboards/SparePartsDashboard';
import { TaxiDashboard } from './dashboards/TaxiDashboard';
import { PharmacyDashboard } from './dashboards/PharmacyDashboard';
import { CarWashDashboard } from './dashboards/CarWashDashboard';
import { VetDashboard } from './dashboards/VetDashboard';
import {
  Car, TrendingUp, TrendingDown, FileText, AlertTriangle,
  Clock, Plus, ArrowRight, Euro, ShoppingCart, CalendarCheck,
  Wrench, PackageCheck, Bell, CheckCircle, CreditCard, Activity,
  RefreshCw, Users, Calendar, Settings2, Eye, EyeOff, GripVertical, X,
  Truck, ChefHat, Package, Timer, Hash,
  DollarSign, Wallet, AlertCircle, UserCheck, BarChart3, Briefcase,
  ShieldAlert, PieChart, Zap, Building2, FileBarChart, Boxes,
  ArrowUpRight, ArrowDownRight, Minus, CalendarRange, BookmarkCheck, Receipt,
} from 'lucide-react';
import { DocumentAlertsWidget } from '../../components/saas/DocumentAlertsWidget';
import { DashboardFinanceWidget } from '../../components/saas/finance/DashboardFinanceWidget';

// ─── Widget personalización ────────────────────────────────────────────────────

type WidgetId = 'kpis_main' | 'quick_access' | 'alertas' | 'charts' | 'operations' | 'quick_finance' | 'funnel' | 'actividad' | 'clockins';

interface WidgetConfig {
  id: WidgetId;
  label: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'kpis_main',     label: 'KPIs principales',       visible: true },
  { id: 'quick_access',  label: 'Accesos rápidos',        visible: true },
  { id: 'alertas',       label: 'Alertas inteligentes',   visible: true },
  { id: 'charts',        label: 'Gráficas principales',   visible: true },
  { id: 'operations',    label: 'Operativa del negocio',  visible: true },
  { id: 'quick_finance', label: 'Bloque financiero',      visible: true },
  { id: 'funnel',        label: 'Embudo de ventas CRM',   visible: true },
  { id: 'clockins',      label: 'Fichajes del equipo',    visible: true },
  { id: 'availability',  label: 'Disponibilidad equipo',  visible: true },
  { id: 'actividad',     label: 'Actividad reciente',     visible: true },
];

const DASH_CONFIG_KEY = 'vertial_dashboard_config_v2';
const DASH_RUNTIME_CACHE_KEY = 'vertial_dashboard_runtime_v1';
const DASH_RUNTIME_TTL_MS = 90_000;

function getDashboardConfigStorageKey(scopeId?: string): string {
  return `${DASH_CONFIG_KEY}:${scopeId || 'global'}`;
}

function loadWidgetConfig(scopeId?: string): WidgetConfig[] {
  try {
    const saved = localStorage.getItem(getDashboardConfigStorageKey(scopeId));
    if (!saved) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(saved) as WidgetConfig[];
    const ids = parsed.map(w => w.id);
    const merged = [...parsed];
    DEFAULT_WIDGETS.forEach(d => { if (!ids.includes(d.id)) merged.push(d); });
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

function formatTimeAgo(date: Date | string, lang = 'es'): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins  = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays  = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (lang === 'en') {
    if (diffMins < 60)  return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7)   return `${diffDays} days ago`;
  } else {
    if (diffMins < 60)  return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7)   return `Hace ${diffDays} días`;
  }
  return past.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short' });
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
  title, value, sub, icon, iconBg, iconColor, trend, onClick, loading, miniChart,
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
          ) : (
            <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-gray-100 mb-0.5 leading-none">{value}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {!loading && trend && (
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
  const common: QuickAccessItem[] = [
    { label: 'CRM / Clientes', icon: <Users className="w-5 h-5" />, route: '/saas/clients', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Equipo', icon: <UserCheck className="w-5 h-5" />, route: '/saas/team', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Finanzas', icon: <Wallet className="w-5 h-5" />, route: '/saas/finance', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Documentos', icon: <FileText className="w-5 h-5" />, route: '/saas/documents', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Calendario', icon: <Calendar className="w-5 h-5" />, route: '/saas/calendar', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    { label: 'Fichajes', icon: <Clock className="w-5 h-5" />, route: '/saas/clockins', color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-800' },
    { label: 'Horarios', icon: <CalendarRange className="w-5 h-5" />, route: '/saas/equipo/horarios-vacaciones', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
  ];

  const verticalLinks: Record<string, QuickAccessItem[]> = {
    carDealership: [
      { label: 'Vehículos', icon: <Car className="w-5 h-5" />, route: '/saas/vehicles', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
      { label: 'Reservas', icon: <BookmarkCheck className="w-5 h-5" />, route: '/saas/reservations', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
      { label: 'Ventas', icon: <ShoppingCart className="w-5 h-5" />, route: '/saas/sales', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
      { label: 'Gastos prep.', icon: <Receipt className="w-5 h-5" />, route: '/saas/vertical/compraventa/gastos-preparacion', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
      { label: 'Taller', icon: <Wrench className="w-5 h-5" />, route: '/saas/workshop', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    workshop: [
      { label: 'Taller', icon: <Wrench className="w-5 h-5" />, route: '/saas/workshop', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
      { label: 'Recambios', icon: <Package className="w-5 h-5" />, route: '/saas/parts', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    ],
    delivery: [
      { label: 'Pedidos', icon: <Truck className="w-5 h-5" />, route: '/saas/delivery', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Catálogo', icon: <Boxes className="w-5 h-5" />, route: '/saas/delivery-catalog', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    cleaning: [
      { label: 'Centro Operativo', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/cleaning-hub', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
      { label: 'Servicios', icon: <Users className="w-5 h-5" />, route: '/saas/cleaning-services', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    ],
    gym: [
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
      { label: 'Eventos', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/events-management', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Proveedores', icon: <Users className="w-5 h-5" />, route: '/saas/events-vendors', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    hairSalon: [
      { label: 'Citas', icon: <CalendarCheck className="w-5 h-5" />, route: '/saas/salon-appointments', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Servicios', icon: <Boxes className="w-5 h-5" />, route: '/saas/salon-services', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    scrapyard: [
      { label: 'Centro', icon: <Activity className="w-5 h-5" />, route: '/saas/scrapyard-hub', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
      { label: 'Piezas', icon: <Boxes className="w-5 h-5" />, route: '/saas/scrapyard-parts', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    ],
    spareParts: [
      { label: 'Catálogo', icon: <Boxes className="w-5 h-5" />, route: '/saas/spareparts-catalog', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
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
  const { currentBusiness, businesses } = useBusiness();
  const [generalView, setGeneralView] = useState(() => {
    try { return localStorage.getItem('vertial_dash_general') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const onGeneral = () => setGeneralView(true);
    const onBusiness = () => setGeneralView(false);
    window.addEventListener('vertial:layout-general', onGeneral);
    window.addEventListener('vertial:layout-business', onBusiness);
    return () => {
      window.removeEventListener('vertial:layout-general', onGeneral);
      window.removeEventListener('vertial:layout-business', onBusiness);
    };
  }, []);

  const showGeneral = generalView && businesses.length > 1;

  const goGeneral = useCallback(() => {
    setGeneralView(true);
    try { localStorage.setItem('vertial_dash_general', '1'); } catch { /* noop */ }
  }, []);

  const goBusiness = useCallback((_bid?: string) => {
    setGeneralView(false);
    try { localStorage.setItem('vertial_dash_general', '0'); } catch { /* noop */ }
  }, []);

  if (showGeneral) {
    return <GeneralDashboard onSelectBusiness={goBusiness} />;
  }

  return <UnifiedDashboard onSelectGeneral={goGeneral} />;
}

// ═══════════════════════════════════════════════════════════
// UNIFIED DASHBOARD (works for all verticals)
// ═══════════════════════════════════════════════════════════

function UnifiedDashboard({ onSelectGeneral }: { onSelectGeneral?: () => void }) {
  const navigate = useNavigate();
  const { vehicles, leads, sales, documents, isLoadingVehicles, isLoadingClients } = useApp();
  const { user: authUser } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const { t, i18n } = useTranslation();

  const vertical: BusinessType = (currentBusiness?.businessType as BusinessType) || 'carDealership';
  const dashboardConfigScope = `${authUser?.user_id || 'anon'}:${currentBusiness?.business_id || 'default'}`;
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

  const isVisible = useCallback((id: WidgetId) =>
    widgetConfig.find(w => w.id === id)?.visible ?? true,
  [widgetConfig]);

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
    if (!authUser?.user_id) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetchDashboardData(authUser.user_id)
        .then((data) => {
          setServerData(data);
          setServerUpdatedAt(data.updatedAt);
        })
        .catch(() => { /* noop */ });
      Promise.all([
        fetchActiveNow(authUser.user_id),
        fetchClockinStats(authUser.user_id),
        fetchAlertsSummary(authUser.user_id),
      ])
        .then(([active, stats, alertsSummary]) => {
          setClockinsActive(Array.isArray(active) ? active : []);
          setClockinsStatsSummary(stats || null);
          setClockinsAlertsSummary(alertsSummary || null);
        })
        .catch(() => { /* noop */ });
    }, 45000);
    return () => window.clearInterval(intervalId);
  }, [authUser?.user_id]);

  useEffect(() => {
    if (!authUser?.user_id) return;
    let cancelled = false;
    setClockinsLoading(true);
    Promise.all([
      fetchActiveNow(authUser.user_id),
      fetchClockinStats(authUser.user_id),
      fetchAlertsSummary(authUser.user_id),
    ])
      .then(([active, stats, alertsSummary]) => {
        if (cancelled) return;
        setClockinsActive(Array.isArray(active) ? active : []);
        setClockinsStatsSummary(stats || null);
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
  }, [authUser?.user_id]);

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
    Promise.all([
      fetchActiveNow(authUser.user_id),
      fetchClockinStats(authUser.user_id),
      fetchAlertsSummary(authUser.user_id),
    ])
      .then(([active, stats, alertsSummary]) => {
        setClockinsActive(Array.isArray(active) ? active : []);
        setClockinsStatsSummary(stats || null);
        setClockinsAlertsSummary(alertsSummary || null);
        setClockinsLoading(false);
      })
      .catch(() => {
        setClockinsActive([]);
        setClockinsStatsSummary(null);
        setClockinsAlertsSummary(null);
        setClockinsLoading(false);
      });
  }, [authUser?.user_id, serverLoading]);

  // ── KPI values (server → local fallback) ──
  const sk = serverData?.kpis;
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const soldThisMonth = useMemo(() => vehicles.filter(v => {
    if (v.status !== 'vendido' || !v.soldAt) return false;
    return new Date(v.soldAt) >= firstOfMonth;
  }), [vehicles, firstOfMonth]);

  const salesToday       = sk?.salesToday ?? 0;
  const salesTodayCount  = sk?.salesTodayCount ?? 0;
  const salesMonth       = sk?.salesMonth ?? soldThisMonth.reduce((s, v) => s + (v.salePrice || 0), 0);
  const expensesMonth    = sk?.expensesMonth ?? 0;
  const estimatedProfit  = sk?.estimatedProfit ?? (salesMonth - expensesMonth);
  const cashBalance      = sk?.cashBalance ?? 0;
  const criticalStock    = sk?.criticalStockCount ?? 0;
  const activeWorkers    = sk?.activeWorkers ?? 0;
  const totalClockinsToday = sk?.totalClockinsToday ?? 0;
  const openIncidents    = sk?.openIncidents ?? 0;
  const stockCount       = sk?.stockCount ?? vehicles.filter(v => v.status === 'listo').length;
  const oportunidades    = sk?.oportunidades ?? leads.filter(l => l.status !== 'won' && l.status !== 'lost').length;
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

  const dailySalesData = useMemo((): DailyPoint[] =>
    daysRange.map(d => {
      const dayStr = format(d, 'yyyy-MM-dd');
      const daySales = soldThisMonth.filter(v => {
        const sold = v.soldAt ? new Date(v.soldAt) : null;
        return sold && format(startOfDay(sold), 'yyyy-MM-dd') === dayStr;
      });
      return { day: dayStr, label: format(d, 'd MMM', { locale: es }), value: daySales.reduce((s, v) => s + (v.salePrice || 0), 0) };
    }),
  [soldThisMonth, daysRange]);

  const dailyLeadsData = useMemo((): DailyPoint[] =>
    daysRange.map(d => {
      const dayStr = format(d, 'yyyy-MM-dd');
      const count = leads.filter(l => {
        const created = l.createdAt ? new Date(l.createdAt) : null;
        return created && format(startOfDay(created), 'yyyy-MM-dd') === dayStr;
      }).length;
      return { day: dayStr, label: format(d, 'd MMM', { locale: es }), value: count };
    }),
  [leads, daysRange]);

  // ── Recent activity ──
  const recentActivity = useMemo(() => {
    const items: { type: string; message: string; time: string; icon: React.ReactNode; ts: Date; dot: string }[] = [];
    vehicles.slice(-3).reverse().forEach(v => items.push({
      type: 'vehicle', message: `Nuevo: ${v.brand} ${v.model} ${v.year}`,
      time: formatTimeAgo(v.createdAt, i18n.language), icon: <Car className="w-3.5 h-3.5" />,
      ts: new Date(v.createdAt), dot: 'bg-blue-400',
    }));
    soldThisMonth.slice(0, 2).forEach(v => items.push({
      type: 'sale', message: `Venta: ${v.brand} ${v.model} · ${formatEur(v.salePrice || 0)}`,
      time: formatTimeAgo(v.soldAt || v.createdAt, i18n.language), icon: <TrendingUp className="w-3.5 h-3.5" />,
      ts: new Date(v.soldAt || v.createdAt), dot: 'bg-emerald-400',
    }));
    documents.slice(-2).reverse().forEach(d => items.push({
      type: 'document', message: `Doc: ${d.name}`,
      time: formatTimeAgo(d.createdAt, i18n.language), icon: <FileText className="w-3.5 h-3.5" />,
      ts: new Date(d.createdAt), dot: 'bg-violet-400',
    }));
    return items.sort((a, b) => b.ts.getTime() - a.ts.getTime()).slice(0, 8);
  }, [vehicles, soldThisMonth, documents, i18n.language]);

  // ── Quick access items ──
  const quickAccessItems = useMemo(() => getQuickAccessItems(vertical), [vertical]);

  // ── Loading state progresivo ──
  const baseDataLoading = isLoadingVehicles || isLoadingClients;
  const alertsLoading = serverLoading && !serverData;
  const chartsLoading = baseDataLoading;
  const activityLoading = baseDataLoading;

  // ── Funnel totals ──
  const funnelTotal = funnelCounts['new'] || 0;
  const wonCount = funnelCounts['won'] || 0;
  const lostCount = funnelCounts['lost'] || 0;
  const overallConversion = funnelTotal > 0 ? Math.round((wonCount / funnelTotal) * 100) : 0;

  return (
    <Layout title="Dashboard" subtitle="Estado real de tu negocio">
      {showPersonalize && (
        <PersonalizePanel config={widgetConfig} onUpdate={updateWidgetConfig} onClose={() => setShowPersonalize(false)} />
      )}

      <div className="flex flex-col gap-5">
        {/* ── Status bar ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {authUser?.user_id && (
              serverLoading ? (
                <span className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando...
                </span>
              ) : serverUpdatedAt ? (
                <span className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Tiempo real · {new Date(serverUpdatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null
            )}
            {baseDataLoading && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                Cargando modulos...
              </span>
            )}
            <button onClick={handleRefresh} disabled={serverLoading}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${serverLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <button
            onClick={() => setShowPersonalize(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-all"
          >
            <Settings2 className="w-3.5 h-3.5" /> Personalizar
          </button>
        </div>

        {/* ═══ KPIs PRINCIPALES — 8 tarjetas ═══ */}
        {isVisible('kpis_main') && (
          <div style={{ order: getWidgetOrder('kpis_main') }}>
            <DraggableWidget id="kpis_main" {...dragProps}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard
                  title="Ventas hoy"
                  value={salesToday > 0 ? formatEur(salesToday) : '—'}
                  sub={salesTodayCount > 0 ? `${salesTodayCount} operación${salesTodayCount > 1 ? 'es' : ''}` : 'Sin ventas hoy'}
                  icon={<DollarSign className="w-4 h-4" />}
                  iconBg="bg-emerald-100 dark:bg-emerald-900/40"
                  iconColor="text-emerald-600"
                  trend={salesTodayCount > 0 ? { value: `+${salesTodayCount}`, up: true } : undefined}
                  onClick={() => navigate('/saas/sales')}
                  loading={serverLoading}
                />
                <KPICard
                  title="Ventas mes"
                  value={salesMonth > 0 ? formatEur(salesMonth) : '—'}
                  sub={`${sk?.soldThisMonthCount ?? soldThisMonth.length} ventas este mes`}
                  icon={<TrendingUp className="w-4 h-4" />}
                  iconBg="bg-blue-100 dark:bg-blue-900/40"
                  iconColor="text-blue-600"
                  trend={salesMonth > 0 ? { value: formatEur(salesMonth), up: true } : undefined}
                  onClick={() => navigate('/saas/sales-metrics')}
                  loading={serverLoading}
                  miniChart={<MiniBarChart data={dailySalesData} color="blue" />}
                />
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
                <KPICard
                  title="Beneficio est."
                  value={salesMonth > 0 ? formatEur(estimatedProfit) : '—'}
                  sub={quickFinance ? `Margen ${quickFinance.marginPct}%` : 'Ingresos - gastos'}
                  icon={<PieChart className="w-4 h-4" />}
                  iconBg={estimatedProfit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-red-100 dark:bg-red-900/40'}
                  iconColor={estimatedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
                  trend={salesMonth > 0 ? { value: `${quickFinance?.marginPct ?? 0}%`, up: estimatedProfit > 0 ? true : estimatedProfit < 0 ? false : null } : undefined}
                  onClick={() => navigate('/saas/ebitda')}
                  loading={serverLoading}
                />
                <KPICard
                  title="Caja actual"
                  value={formatEur(cashBalance)}
                  sub={cashBalance >= 0 ? 'Balance positivo' : 'Balance negativo'}
                  icon={<Wallet className="w-4 h-4" />}
                  iconBg={cashBalance >= 0 ? 'bg-cyan-100 dark:bg-cyan-900/40' : 'bg-red-100 dark:bg-red-900/40'}
                  iconColor={cashBalance >= 0 ? 'text-cyan-600' : 'text-red-600'}
                  trend={cashBalance !== 0 ? { value: formatEur(Math.abs(cashBalance)), up: cashBalance >= 0 ? true : false } : undefined}
                  onClick={() => navigate('/saas/finance')}
                  loading={serverLoading}
                />
                <KPICard
                  title="Stock crítico"
                  value={String(criticalStock)}
                  sub={criticalStock > 0 ? 'Productos bajo mínimo' : 'Todo en orden'}
                  icon={<Boxes className="w-4 h-4" />}
                  iconBg={criticalStock > 0 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-gray-100 dark:bg-gray-700'}
                  iconColor={criticalStock > 0 ? 'text-amber-600' : 'text-gray-400'}
                  trend={criticalStock > 0 ? { value: `${criticalStock} alertas`, up: false } : undefined}
                  onClick={() => navigate('/saas/catalog')}
                  loading={serverLoading}
                />
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
              </div>
            </DraggableWidget>
          </div>
        )}

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

        {/* ═══ ALERTAS INTELIGENTES ═══ */}
        {isVisible('alertas') && (
          <div style={{ order: getWidgetOrder('alertas') }}>
            <DraggableWidget id="alertas" {...dragProps}>
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas</p>
                    {alerts.length > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-full">
                        {alerts.length}
                      </span>
                    )}
                  </div>
                  {alerts.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">
                        {alerts.filter(a => a.severity === 'error').length} críticas · {alerts.filter(a => a.severity === 'warning').length} avisos
                      </span>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {alertsLoading ? (
                    <div className="p-4 space-y-2.5 animate-pulse">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-10 rounded-xl bg-gray-100 dark:bg-gray-700" />
                      ))}
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-5">
                      <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mb-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Todo en orden</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No hay alertas pendientes</p>
                    </div>
                  ) : (
                    alerts.map((alert) => {
                      const s = ALERT_SEVERITY_STYLES[alert.severity] || ALERT_SEVERITY_STYLES.info;
                      return (
                        <div key={alert.id} className={`flex items-center justify-between px-4 py-3 border-l-4 ${s.border} ${s.bg}`}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${s.icon}`} />
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{alert.message}</p>
                          </div>
                          <button onClick={() => navigate(alert.route)}
                            className={`flex-shrink-0 flex items-center gap-1 ml-3 text-[11px] font-bold ${s.text} hover:underline`}>
                            Ver <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </DraggableWidget>
          </div>
        )}

        {/* ═══ ALERTAS DOCUMENTACIÓN COMPRAVENTA ═══ */}
        <DocumentAlertsWidget />

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
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Ventas (14 días)</p>
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

                {/* Leads 14 días */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Nuevos leads (14 días)</p>
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
                                {pt.value} leads
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} fill="url(#leadsGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
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
                  openIncidents={openIncidents}
                  cobrosCount={cobrosCount}
                  activeWorkers={activeWorkers}
                  pendingDeliveries={serverData?.kpis?.pendingDeliveries ?? 0}
                  loading={serverLoading}
                  salesClosure={serverData?.salesClosure}
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

        {authUser?.user_id && (
          <div style={{ order: getWidgetOrder('quick_finance') + 1 }}>
            <DashboardFinanceWidget userId={authUser.user_id} />
          </div>
        )}

        {/* ═══ EMBUDO DE VENTAS CRM ═══ */}
        {isVisible('funnel') && (
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
                  <button onClick={() => navigate('/saas/delivery-crm')}
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
                    <button onClick={() => navigate('/saas/delivery-crm')}
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

        {/* ═══ DISPONIBILIDAD EQUIPO ═══ */}
        {isVisible('availability') && (
          <div style={{ order: getWidgetOrder('availability') }}>
            <DraggableWidget id="availability" {...dragProps}>
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <CalendarRange className="w-4 h-4 text-orange-500" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Disponibilidad hoy</p>
                  </div>
                  <button onClick={() => navigate('/saas/equipo/horarios-vacaciones')} className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline">
                    Ver horarios <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center p-3 rounded-xl bg-green-50 dark:bg-green-900/20">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400">{clockinsActive.filter(a => a.status === 'active').length}</p>
                      <p className="text-[10px] font-medium text-green-600 dark:text-green-400/70 uppercase">Trabajando</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">—</p>
                      <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400/70 uppercase">Vacaciones</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">—</p>
                      <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400/70 uppercase">Ausencia</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                      <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">—</p>
                      <p className="text-[10px] font-medium text-slate-500 uppercase">Sin turno</p>
                    </div>
                  </div>
                </div>
              </div>
            </DraggableWidget>
          </div>
        )}

        {/* ═══ ACTIVIDAD RECIENTE ═══ */}
        {isVisible('actividad') && (
          <div style={{ order: getWidgetOrder('actividad') }}>
            <DraggableWidget id="actividad" {...dragProps}>
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Actividad reciente</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {activityLoading ? (
                    <div className="p-4 space-y-2 animate-pulse">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-10 rounded-xl bg-gray-100 dark:bg-gray-700" />
                      ))}
                    </div>
                  ) : recentActivity.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-5">
                      <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">Sin actividad reciente</p>
                      <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">Los cambios aparecerán aquí</p>
                    </div>
                  ) : (
                    recentActivity.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.dot}`} />
                        <div className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0 text-gray-500 dark:text-gray-400">
                          {item.icon}
                        </div>
                        <p className="flex-1 text-xs text-gray-700 dark:text-gray-300 min-w-0 truncate">{item.message}</p>
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                          <Clock className="w-3 h-3" /> {item.time}
                        </div>
                      </div>
                    ))
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
  vertical, stockCount, oportunidades, openIncidents, cobrosCount, activeWorkers, pendingDeliveries, loading,
  salesClosure,
}: {
  vertical: string; stockCount: number; oportunidades: number; openIncidents: number;
  cobrosCount: number; activeWorkers: number; pendingDeliveries: number; loading: boolean;
  salesClosure?: SalesClosureKpis;
}) {
  const navigate = useNavigate();

  const items = useMemo(() => {
    const base = [
      { title: 'Oportunidades CRM', value: String(oportunidades), sub: 'Leads activos', icon: <ShoppingCart className="w-4 h-4" />, bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600', route: '/saas/vertical/compraventa/crm' },
      { title: 'Pagos pendientes', value: String(cobrosCount), sub: 'Por cobrar', icon: <CreditCard className="w-4 h-4" />, bg: cobrosCount > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-gray-50 dark:bg-gray-800', text: cobrosCount > 0 ? 'text-red-600' : 'text-gray-500', route: '/saas/finance' },
      { title: 'Equipo hoy', value: String(activeWorkers), sub: 'Fichados', icon: <UserCheck className="w-4 h-4" />, bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-600', route: '/saas/clockins' },
    ];

    const verticalSpecific: Record<string, { title: string; value: string; sub: string; icon: React.ReactNode; bg: string; text: string; route: string }> = {
      carDealership: { title: 'Stock vehículos', value: String(stockCount), sub: 'Disponibles', icon: <Car className="w-4 h-4" />, bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600', route: '/saas/vehicles' },
      workshop: { title: 'Órdenes taller', value: '—', sub: 'Abiertas', icon: <Wrench className="w-4 h-4" />, bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600', route: '/saas/workshop' },
      delivery: { title: 'Pedidos activos', value: String(pendingDeliveries || 0), sub: 'En curso', icon: <Truck className="w-4 h-4" />, bg: pendingDeliveries > 0 ? 'bg-cyan-50 dark:bg-cyan-950/30' : 'bg-gray-50 dark:bg-gray-800', text: pendingDeliveries > 0 ? 'text-cyan-600' : 'text-gray-500', route: '/saas/delivery' },
      cleaning: { title: 'Servicios hoy', value: '—', sub: 'Programados', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/cleaning-hub' },
      gym: { title: 'Socios activos', value: '—', sub: 'Este mes', icon: <Users className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/gym-members' },
      clinic: { title: 'Citas hoy', value: '—', sub: 'Programadas', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/clinic-appointments' },
      hotel: { title: 'Habitaciones occ.', value: '—', sub: 'Ocupadas hoy', icon: <Building2 className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/hotel-rooms' },
      construction: { title: 'Proyectos activos', value: '—', sub: 'En curso', icon: <Briefcase className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/construction-projects' },
      academy: { title: 'Alumnos activos', value: '—', sub: 'Matriculados', icon: <Users className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/academy-students' },
      realEstate: { title: 'Propiedades', value: '—', sub: 'En cartera', icon: <Building2 className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/realestate-properties' },
      lawyer: { title: 'Casos abiertos', value: '—', sub: 'En curso', icon: <Briefcase className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/lawyer-cases' },
      nightclub: { title: 'Eventos próximos', value: '—', sub: 'Programados', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/nightclub-events' },
      events: { title: 'Eventos activos', value: '—', sub: 'En curso', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/events-management' },
      hairSalon: { title: 'Citas hoy', value: '—', sub: 'Programadas', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/salon-appointments' },
      scrapyard: { title: 'Vehículos en desguace', value: '—', sub: 'En stock', icon: <Boxes className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/scrapyard-hub' },
      spareParts: { title: 'Catálogo piezas', value: '—', sub: 'Disponibles', icon: <Boxes className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/spareparts-catalog' },
      taxi: { title: 'Flota activa', value: '—', sub: 'Vehículos', icon: <Car className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/taxi-fleet' },
      pharmacy: { title: 'Inventario', value: '—', sub: 'Productos', icon: <Boxes className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/pharmacy-inventory' },
      carWash: { title: 'Servicios hoy', value: '—', sub: 'Programados', icon: <CalendarCheck className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/carwash-services' },
      vet: { title: 'Pacientes', value: '—', sub: 'Registrados', icon: <Users className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/vet-patients' },
      tobaccoShop: { title: 'Ventas hoy', value: '—', sub: 'Del día', icon: <Receipt className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/tobacco-sales' },
      butcherShop: { title: 'Centro operativo', value: '—', sub: 'Hoy', icon: <Activity className="w-4 h-4" />, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-600', route: '/saas/butcher-hub' },
    };

    const vItem = verticalSpecific[vertical] || verticalSpecific.carDealership;
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
        route: '/saas/sales',
      });
    }
    return row;
  }, [vertical, stockCount, oportunidades, cobrosCount, activeWorkers, pendingDeliveries, salesClosure]);

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
