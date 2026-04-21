import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie,
} from 'recharts';
import {
  Users, UserCheck, Clock, TrendingUp, TrendingDown,
  DollarSign, Receipt, AlertTriangle, Shield, Zap,
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus,
  Bell, ChevronDown, RefreshCw, Search, Filter,
  FileText, CalendarDays, Timer, Euro, Briefcase,
  Eye, Phone, Mail, MapPin, CreditCard, Key,
  ClipboardList, BarChart3, Monitor, Beef, Wallet,
  CheckCircle, XCircle, AlertCircle, Info,
  Sun, Moon, ChevronRight, Star, Award,
  Building2, BadgeCheck, CircleAlert, Hash,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole = 'gerente' | 'trabajador';
type TabId = 'resumen' | 'equipo' | 'rendimiento' | 'alertas';
type AlertSeverity = 'critical' | 'warning' | 'info';
type ShiftType = 'manana' | 'tarde' | 'completa';

interface Worker {
  id: string;
  nombre: string;
  avatar: string;
  rol: string;
  email: string;
  telefono: string;
  turno: ShiftType;
  horario: string;
  costeHora: number;
  estado: 'fichado' | 'descanso' | 'sin_fichar' | 'libre';
  horaEntrada: string | null;
  permisosTpv: string[];
  documentos: { tipo: string; estado: 'vigente' | 'pendiente' | 'caducado' }[];
  ventasHoy: number;
  ingresosHoy: number;
  ticketsHoy: number;
  horasTrabajadas: number;
  incidencias: number;
  tareasCompletadas: number;
  tareasPendientes: number;
  productividadHora: number;
  tendencia: number;
}

interface WorkerAlert {
  id: string;
  tipo: 'sin_fichar' | 'baja_productividad' | 'exceso_horas' | 'permiso_incompleto' | 'documento_caducado';
  severity: AlertSeverity;
  trabajador: string;
  mensaje: string;
  timestamp: Date;
}

interface HourlyProductivity {
  hora: string;
  ventas: number;
  tickets: number;
  trabajadores: number;
}

interface ShiftComparison {
  metrica: string;
  manana: number;
  tarde: number;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

function generateMockData() {
  const workers: Worker[] = [
    {
      id: 'w1', nombre: 'Carlos García', avatar: 'CG', rol: 'Carnicero Senior',
      email: 'carlos@carniceria.es', telefono: '+34 612 345 678',
      turno: 'manana', horario: '07:00 – 15:00', costeHora: 14.50,
      estado: 'fichado', horaEntrada: '06:58',
      permisosTpv: ['Ventas', 'Devoluciones', 'Descuentos', 'Cierre caja'],
      documentos: [
        { tipo: 'Contrato', estado: 'vigente' },
        { tipo: 'Manipulador alimentos', estado: 'vigente' },
        { tipo: 'PRL', estado: 'vigente' },
        { tipo: 'Nómina abril', estado: 'pendiente' },
      ],
      ventasHoy: 18, ingresosHoy: 1_024.60, ticketsHoy: 18,
      horasTrabajadas: 6.5, incidencias: 0, tareasCompletadas: 4, tareasPendientes: 1,
      productividadHora: 157.63, tendencia: 12.3,
    },
    {
      id: 'w2', nombre: 'María López', avatar: 'ML', rol: 'Carnicera',
      email: 'maria@carniceria.es', telefono: '+34 623 456 789',
      turno: 'manana', horario: '07:30 – 15:30', costeHora: 12.00,
      estado: 'fichado', horaEntrada: '07:28',
      permisosTpv: ['Ventas', 'Devoluciones'],
      documentos: [
        { tipo: 'Contrato', estado: 'vigente' },
        { tipo: 'Manipulador alimentos', estado: 'vigente' },
        { tipo: 'PRL', estado: 'caducado' },
      ],
      ventasHoy: 22, ingresosHoy: 1_187.30, ticketsHoy: 22,
      horasTrabajadas: 6.0, incidencias: 1, tareasCompletadas: 3, tareasPendientes: 2,
      productividadHora: 197.88, tendencia: 8.7,
    },
    {
      id: 'w3', nombre: 'Pedro Sánchez', avatar: 'PS', rol: 'Ayudante',
      email: 'pedro@carniceria.es', telefono: '+34 634 567 890',
      turno: 'manana', horario: '08:00 – 14:00', costeHora: 10.00,
      estado: 'descanso', horaEntrada: '08:02',
      permisosTpv: ['Ventas'],
      documentos: [
        { tipo: 'Contrato', estado: 'vigente' },
        { tipo: 'Manipulador alimentos', estado: 'pendiente' },
        { tipo: 'PRL', estado: 'vigente' },
      ],
      ventasHoy: 9, ingresosHoy: 412.80, ticketsHoy: 9,
      horasTrabajadas: 4.5, incidencias: 0, tareasCompletadas: 2, tareasPendientes: 3,
      productividadHora: 91.73, tendencia: -5.2,
    },
    {
      id: 'w4', nombre: 'Ana Martínez', avatar: 'AM', rol: 'Carnicera',
      email: 'ana@carniceria.es', telefono: '+34 645 678 901',
      turno: 'tarde', horario: '15:00 – 22:00', costeHora: 12.00,
      estado: 'sin_fichar', horaEntrada: null,
      permisosTpv: ['Ventas', 'Devoluciones', 'Descuentos'],
      documentos: [
        { tipo: 'Contrato', estado: 'vigente' },
        { tipo: 'Manipulador alimentos', estado: 'vigente' },
        { tipo: 'PRL', estado: 'vigente' },
        { tipo: 'Nómina abril', estado: 'pendiente' },
      ],
      ventasHoy: 0, ingresosHoy: 0, ticketsHoy: 0,
      horasTrabajadas: 0, incidencias: 0, tareasCompletadas: 0, tareasPendientes: 5,
      productividadHora: 0, tendencia: 0,
    },
    {
      id: 'w5', nombre: 'Javier Ruiz', avatar: 'JR', rol: 'Repartidor',
      email: 'javier@carniceria.es', telefono: '+34 656 789 012',
      turno: 'completa', horario: '09:00 – 18:00', costeHora: 11.00,
      estado: 'fichado', horaEntrada: '08:55',
      permisosTpv: [],
      documentos: [
        { tipo: 'Contrato', estado: 'vigente' },
        { tipo: 'Carnet conducir', estado: 'vigente' },
        { tipo: 'PRL', estado: 'vigente' },
      ],
      ventasHoy: 0, ingresosHoy: 0, ticketsHoy: 0,
      horasTrabajadas: 5.0, incidencias: 0, tareasCompletadas: 6, tareasPendientes: 2,
      productividadHora: 0, tendencia: 0,
    },
  ];

  const hourlyProductivity: HourlyProductivity[] = [
    { hora: '07:00', ventas: 85.20, tickets: 2, trabajadores: 2 },
    { hora: '08:00', ventas: 142.60, tickets: 4, trabajadores: 3 },
    { hora: '09:00', ventas: 198.40, tickets: 5, trabajadores: 4 },
    { hora: '10:00', ventas: 267.30, tickets: 7, trabajadores: 4 },
    { hora: '11:00', ventas: 345.80, tickets: 9, trabajadores: 4 },
    { hora: '12:00', ventas: 412.50, tickets: 11, trabajadores: 4 },
    { hora: '13:00', ventas: 389.20, tickets: 10, trabajadores: 3 },
  ];

  const shiftComparison: ShiftComparison[] = [
    { metrica: 'Ventas (€)', manana: 2_624.70, tarde: 1_890.40 },
    { metrica: 'Tickets', manana: 49, tarde: 35 },
    { metrica: 'Ticket medio', manana: 53.57, tarde: 54.01 },
    { metrica: 'Productividad/h', manana: 149.12, tarde: 135.03 },
    { metrica: 'Horas totales', manana: 17.0, tarde: 14.0 },
  ];

  const alerts: WorkerAlert[] = [
    { id: 'a1', tipo: 'sin_fichar', severity: 'critical', trabajador: 'Ana Martínez', mensaje: 'No ha fichado – Su turno empezaba a las 15:00', timestamp: new Date() },
    { id: 'a2', tipo: 'baja_productividad', severity: 'warning', trabajador: 'Pedro Sánchez', mensaje: 'Productividad 42% por debajo de la media del equipo', timestamp: new Date() },
    { id: 'a3', tipo: 'documento_caducado', severity: 'warning', trabajador: 'María López', mensaje: 'Certificado PRL caducado – Requiere renovación', timestamp: new Date() },
    { id: 'a4', tipo: 'permiso_incompleto', severity: 'info', trabajador: 'Pedro Sánchez', mensaje: 'Manipulador de alimentos pendiente de validación', timestamp: new Date() },
    { id: 'a5', tipo: 'exceso_horas', severity: 'warning', trabajador: 'Carlos García', mensaje: 'Acumula 3.5h extra esta semana – Revisar compensación', timestamp: new Date() },
  ];

  const totalVentas = workers.reduce((a, w) => a + w.ingresosHoy, 0);
  const totalTickets = workers.reduce((a, w) => a + w.ticketsHoy, 0);
  const trabajadoresFichados = workers.filter(w => w.estado === 'fichado' || w.estado === 'descanso').length;
  const horasTotales = workers.reduce((a, w) => a + w.horasTrabajadas, 0);
  const ticketMedio = totalTickets > 0 ? totalVentas / totalTickets : 0;
  const productividadMedia = horasTotales > 0 ? totalVentas / horasTotales : 0;
  const costeLaboralEstimado = workers.reduce((a, w) => a + (w.costeHora * w.horasTrabajadas), 0);
  const ratioCosteIngreso = totalVentas > 0 ? (costeLaboralEstimado / totalVentas) * 100 : 0;

  return {
    workers, hourlyProductivity, shiftComparison, alerts,
    totalVentas, totalTickets, trabajadoresFichados, horasTotales,
    ticketMedio, productividadMedia, costeLaboralEstimado, ratioCosteIngreso,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatNum(n: number, decimals = 0) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const ESTADO_CONFIG = {
  fichado:    { label: 'Fichado',    dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  descanso:   { label: 'Descanso',   dot: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300' },
  sin_fichar: { label: 'Sin fichar', dot: 'bg-red-500',     bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300' },
  libre:      { label: 'Libre',      dot: 'bg-gray-400',    bg: 'bg-gray-50 dark:bg-gray-800',           text: 'text-gray-500 dark:text-gray-400' },
} as const;

const TURNO_LABEL: Record<ShiftType, string> = { manana: 'Mañana', tarde: 'Tarde', completa: 'Jornada completa' };

const ALERT_STYLES: Record<AlertSeverity, { border: string; bg: string; icon: string; text: string }> = {
  critical: { border: 'border-l-red-500',   bg: 'bg-red-50 dark:bg-red-950/30',    icon: 'text-red-500',   text: 'text-red-700 dark:text-red-400' },
  warning:  { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', icon: 'text-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  info:     { border: 'border-l-blue-400',  bg: 'bg-blue-50 dark:bg-blue-950/30',   icon: 'text-blue-400',  text: 'text-blue-700 dark:text-blue-400' },
};

const DOC_ESTADO_CONFIG = {
  vigente:  { label: 'Vigente',  icon: CheckCircle, color: 'text-emerald-500' },
  pendiente:{ label: 'Pendiente', icon: AlertCircle, color: 'text-amber-500' },
  caducado: { label: 'Caducado', icon: XCircle,      color: 'text-red-500' },
} as const;

const ALERT_ICON_MAP = {
  sin_fichar: XCircle,
  baja_productividad: TrendingDown,
  exceso_horas: Timer,
  permiso_incompleto: Key,
  documento_caducado: FileText,
} as const;

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'resumen',      label: 'Resumen',      icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'equipo',       label: 'Equipo',        icon: <Users className="w-4 h-4" /> },
  { id: 'rendimiento',  label: 'Rendimiento',   icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'alertas',      label: 'Alertas',       icon: <Bell className="w-4 h-4" /> },
];

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({ title, value, sub, icon, iconBg, iconColor, trend, onClick }: {
  title: string; value: string; sub: string;
  icon: React.ReactNode; iconBg: string; iconColor: string;
  trend?: { value: string; up: boolean | null };
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all group"
    >
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
    </button>
  );
}

// ─── Worker Card ─────────────────────────────────────────────────────────────

function WorkerCard({ worker, isManager, onSelect }: {
  worker: Worker; isManager: boolean; onSelect: (w: Worker) => void;
}) {
  const estado = ESTADO_CONFIG[worker.estado];
  const docsPending = worker.documentos.filter(d => d.estado !== 'vigente').length;

  return (
    <button
      onClick={() => onSelect(worker)}
      className="w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-5 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm">
          {worker.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{worker.nombre}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${estado.bg} ${estado.text} flex-shrink-0`}>
              <span className={`w-1.5 h-1.5 rounded-full ${estado.dot}`} />
              {estado.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{worker.rol} · {TURNO_LABEL[worker.turno]} · {worker.horario}</p>

          {isManager && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 text-center">
                <p className="text-sm font-black text-gray-900 dark:text-gray-100">{worker.ticketsHoy}</p>
                <p className="text-[9px] font-semibold text-gray-400 uppercase">Tickets</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 text-center">
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatEur(worker.ingresosHoy)}</p>
                <p className="text-[9px] font-semibold text-gray-400 uppercase">Ventas</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 text-center">
                <p className="text-sm font-black text-blue-600 dark:text-blue-400">{formatNum(worker.horasTrabajadas, 1)}h</p>
                <p className="text-[9px] font-semibold text-gray-400 uppercase">Horas</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isManager && (
                <span className="text-[10px] font-semibold text-gray-400">
                  {formatEur(worker.costeHora)}/h
                </span>
              )}
              {worker.permisosTpv.length > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-indigo-500">
                  <Monitor className="w-3 h-3" /> TPV
                </span>
              )}
              {docsPending > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-500">
                  <AlertCircle className="w-3 h-3" /> {docsPending} doc.
                </span>
              )}
            </div>
            {isManager && worker.tendencia !== 0 && (
              <span className={`flex items-center gap-0.5 text-[10px] font-bold ${worker.tendencia > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {worker.tendencia > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {worker.tendencia > 0 ? '+' : ''}{worker.tendencia}%
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Worker Detail Modal ─────────────────────────────────────────────────────

function WorkerDetailModal({ worker, isManager, onClose }: {
  worker: Worker; isManager: boolean; onClose: () => void;
}) {
  const navigate = useNavigate();
  const estado = ESTADO_CONFIG[worker.estado];

  const radarData = [
    { subject: 'Ventas', value: Math.min(100, (worker.ingresosHoy / 1500) * 100) },
    { subject: 'Tickets', value: Math.min(100, (worker.ticketsHoy / 25) * 100) },
    { subject: 'Productividad', value: Math.min(100, (worker.productividadHora / 200) * 100) },
    { subject: 'Tareas', value: worker.tareasCompletadas + worker.tareasPendientes > 0
      ? (worker.tareasCompletadas / (worker.tareasCompletadas + worker.tareasPendientes)) * 100 : 0 },
    { subject: 'Puntualidad', value: worker.estado === 'sin_fichar' ? 20 : 90 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-700 opacity-10" />
          <div className="relative px-6 pt-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-lg font-bold shadow-lg">
                {worker.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">{worker.nombre}</h2>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${estado.bg} ${estado.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${estado.dot}`} />
                    {estado.label}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{worker.rol}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="flex items-center gap-1 text-[11px] text-gray-400"><Clock className="w-3 h-3" /> {worker.horario}</span>
                  <span className="flex items-center gap-1 text-[11px] text-gray-400"><Sun className="w-3 h-3" /> {TURNO_LABEL[worker.turno]}</span>
                  {isManager && <span className="flex items-center gap-1 text-[11px] text-gray-400"><Euro className="w-3 h-3" /> {formatEur(worker.costeHora)}/h</span>}
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="px-6 py-3 border-t border-b border-gray-100 dark:border-gray-700/50 flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-gray-500"><Mail className="w-3.5 h-3.5" /> {worker.email}</span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500"><Phone className="w-3.5 h-3.5" /> {worker.telefono}</span>
        </div>

        <div className="p-6 space-y-5">
          {/* KPIs row */}
          {isManager && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{formatEur(worker.ingresosHoy)}</p>
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 uppercase">Ventas hoy</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-blue-700 dark:text-blue-400">{worker.ticketsHoy}</p>
                <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-500 uppercase">Tickets</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-indigo-700 dark:text-indigo-400">{formatNum(worker.horasTrabajadas, 1)}h</p>
                <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-500 uppercase">Horas</p>
              </div>
              <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-violet-700 dark:text-violet-400">{formatEur(worker.productividadHora)}/h</p>
                <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-500 uppercase">Productividad</p>
              </div>
            </div>
          )}

          {/* Radar chart + details */}
          {isManager && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Perfil de rendimiento</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="70%">
                      <PolarGrid stroke="rgba(0,0,0,0.08)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                      <Radar dataKey="value" stroke="#dc2626" fill="#dc2626" fillOpacity={0.2} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Tareas</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600 dark:text-gray-300">Completadas</span>
                        <span className="text-xs font-bold text-emerald-600">{worker.tareasCompletadas}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600 dark:text-gray-300">Pendientes</span>
                        <span className="text-xs font-bold text-amber-600">{worker.tareasPendientes}</span>
                      </div>
                    </div>
                    <div className="w-12 h-12">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { value: worker.tareasCompletadas, fill: '#10b981' },
                              { value: worker.tareasPendientes, fill: '#f59e0b' },
                            ]}
                            dataKey="value" innerRadius={14} outerRadius={22} strokeWidth={0}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Incidencias hoy</p>
                  <p className={`text-lg font-black ${worker.incidencias > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {worker.incidencias}
                  </p>
                </div>
                {isManager && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Coste laboral hoy</p>
                    <p className="text-lg font-black text-gray-900 dark:text-gray-100">
                      {formatEur(worker.costeHora * worker.horasTrabajadas)}
                    </p>
                    <p className="text-[10px] text-gray-400">{formatNum(worker.horasTrabajadas, 1)}h x {formatEur(worker.costeHora)}/h</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Worker self view */}
          {!isManager && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-red-700 dark:text-red-400">{worker.ticketsHoy}</p>
                <p className="text-[10px] font-semibold text-red-600 dark:text-red-500 uppercase">Tickets</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{formatEur(worker.ingresosHoy)}</p>
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 uppercase">Ventas</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-blue-700 dark:text-blue-400">{formatNum(worker.horasTrabajadas, 1)}h</p>
                <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-500 uppercase">Horas</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-amber-700 dark:text-amber-400">{worker.horaEntrada ?? '–'}</p>
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-500 uppercase">Entrada</p>
              </div>
            </div>
          )}

          {/* Permisos TPV */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Permisos TPV</p>
            {worker.permisosTpv.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {worker.permisosTpv.map(p => (
                  <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold rounded-lg">
                    <Key className="w-3 h-3" /> {p}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Sin permisos de TPV asignados</p>
            )}
          </div>

          {/* Documentación */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Documentación</p>
            <div className="space-y-2">
              {worker.documentos.map((doc, i) => {
                const cfg = DOC_ESTADO_CONFIG[doc.estado];
                const Icon = cfg.icon;
                return (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{doc.tipo}</span>
                    </div>
                    <span className={`flex items-center gap-1 text-[11px] font-semibold ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" /> {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-3 rounded-b-2xl">
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/saas/clockins')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" /> Fichajes
            </button>
            <button
              onClick={() => navigate(`/saas/team/${worker.id}`)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Users className="w-3.5 h-3.5" /> Ficha completa
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-xs font-bold hover:opacity-90 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export function ButcherWorkers() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [role, setRole] = useState<UserRole>('gerente');
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const [search, setSearch] = useState('');
  const [filterTurno, setFilterTurno] = useState<ShiftType | 'todos'>('todos');
  const [filterEstado, setFilterEstado] = useState<Worker['estado'] | 'todos'>('todos');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [showAlerts, setShowAlerts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate] = useState(new Date());

  const data = useMemo(() => generateMockData(), []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const filteredWorkers = useMemo(() => {
    return data.workers.filter(w => {
      if (search) {
        const q = search.toLowerCase();
        if (!w.nombre.toLowerCase().includes(q) && !w.rol.toLowerCase().includes(q)) return false;
      }
      if (filterTurno !== 'todos' && w.turno !== filterTurno) return false;
      if (filterEstado !== 'todos' && w.estado !== filterEstado) return false;
      return true;
    });
  }, [data.workers, search, filterTurno, filterEstado]);

  const criticalAlerts = data.alerts.filter(a => a.severity === 'critical').length;

  const isManager = role === 'gerente';

  // ─── Quick connections ─────────────────────────────────────────────
  const connections = [
    { label: 'Equipo', icon: <Users className="w-4 h-4" />, route: '/saas/team', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
    { label: 'Fichajes', icon: <Clock className="w-4 h-4" />, route: '/saas/clockins', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'TPV', icon: <Monitor className="w-4 h-4" />, route: '/saas/butcher-tpv', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/40' },
    { label: 'Finanzas', icon: <Wallet className="w-4 h-4" />, route: '/saas/finance', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" />, route: '/saas/dashboard', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Ventas', icon: <Receipt className="w-4 h-4" />, route: '/saas/butcher-sales', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
  ];

  return (
    <Layout title="Trabajadores y productividad" subtitle="Carnicería — Rendimiento del equipo">
      <div className="flex flex-col gap-4">

        {/* ── Header: Role toggle + Status ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button
                onClick={() => setRole('gerente')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  role === 'gerente'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Shield className="w-3.5 h-3.5" /> Gerente
              </button>
              <button
                onClick={() => setRole('trabajador')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  role === 'trabajador'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" /> Trabajador
              </button>
            </div>

            {criticalAlerts > 0 && (
              <button
                onClick={() => { setActiveTab('alertas'); setShowAlerts(true); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 dark:bg-red-950/40 rounded-lg text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors animate-pulse"
              >
                <CircleAlert className="w-3.5 h-3.5" /> {criticalAlerts} alerta{criticalAlerts > 1 ? 's' : ''} crítica{criticalAlerts > 1 ? 's' : ''}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {refreshing ? (
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
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

        {/* ── Tab navigation ── */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon} {tab.label}
              {tab.id === 'alertas' && data.alerts.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] text-center">
                  {data.alerts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: RESUMEN */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'resumen' && (
          <>
            {/* KPIs */}
            {isManager ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard
                  title="Ventas equipo"
                  value={formatEur(data.totalVentas)}
                  sub={`${data.totalTickets} tickets`}
                  icon={<DollarSign className="w-4 h-4" />}
                  iconBg="bg-emerald-100 dark:bg-emerald-900/40" iconColor="text-emerald-600"
                  trend={{ value: '+14% vs ayer', up: true }}
                  onClick={() => navigate('/saas/butcher-sales')}
                />
                <KPICard
                  title="Ticket medio"
                  value={formatEur(data.ticketMedio)}
                  sub="Por operación"
                  icon={<Receipt className="w-4 h-4" />}
                  iconBg="bg-blue-100 dark:bg-blue-900/40" iconColor="text-blue-600"
                />
                <KPICard
                  title="Productividad/h"
                  value={formatEur(data.productividadMedia)}
                  sub="Media del equipo"
                  icon={<TrendingUp className="w-4 h-4" />}
                  iconBg="bg-violet-100 dark:bg-violet-900/40" iconColor="text-violet-600"
                  trend={{ value: '+8.3% vs semana ant.', up: true }}
                />
                <KPICard
                  title="Equipo fichado"
                  value={`${data.trabajadoresFichados}/${data.workers.length}`}
                  sub="Trabajadores activos"
                  icon={<UserCheck className="w-4 h-4" />}
                  iconBg="bg-indigo-100 dark:bg-indigo-900/40" iconColor="text-indigo-600"
                  onClick={() => navigate('/saas/clockins')}
                />
                <KPICard
                  title="Horas trabajadas"
                  value={`${formatNum(data.horasTotales, 1)}h`}
                  sub="Total equipo hoy"
                  icon={<Clock className="w-4 h-4" />}
                  iconBg="bg-cyan-100 dark:bg-cyan-900/40" iconColor="text-cyan-600"
                />
                <KPICard
                  title="Coste laboral"
                  value={formatEur(data.costeLaboralEstimado)}
                  sub="Estimado hoy"
                  icon={<Euro className="w-4 h-4" />}
                  iconBg="bg-amber-100 dark:bg-amber-900/40" iconColor="text-amber-600"
                  trend={{ value: `${formatNum(data.ratioCosteIngreso, 1)}% sobre ventas`, up: null }}
                />
                <KPICard
                  title="Incidencias"
                  value={String(data.workers.reduce((a, w) => a + w.incidencias, 0))}
                  sub="Reportadas hoy"
                  icon={<AlertTriangle className="w-4 h-4" />}
                  iconBg="bg-orange-100 dark:bg-orange-900/40" iconColor="text-orange-600"
                />
                <KPICard
                  title="Alertas activas"
                  value={String(data.alerts.length)}
                  sub={`${criticalAlerts} críticas`}
                  icon={<Bell className="w-4 h-4" />}
                  iconBg={criticalAlerts > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-800'}
                  iconColor={criticalAlerts > 0 ? 'text-red-600' : 'text-gray-400'}
                  onClick={() => setActiveTab('alertas')}
                />
              </div>
            ) : (
              /* Worker self-view KPIs */
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard title="Mis tickets" value={String(data.workers[0].ticketsHoy)} sub="Hoy"
                  icon={<Receipt className="w-4 h-4" />} iconBg="bg-red-100 dark:bg-red-900/40" iconColor="text-red-600" />
                <KPICard title="Mis ventas" value={formatEur(data.workers[0].ingresosHoy)} sub="Hoy"
                  icon={<DollarSign className="w-4 h-4" />} iconBg="bg-emerald-100 dark:bg-emerald-900/40" iconColor="text-emerald-600" />
                <KPICard title="Horas" value={`${formatNum(data.workers[0].horasTrabajadas, 1)}h`} sub="Trabajadas hoy"
                  icon={<Clock className="w-4 h-4" />} iconBg="bg-blue-100 dark:bg-blue-900/40" iconColor="text-blue-600" />
                <KPICard title="Entrada" value={data.workers[0].horaEntrada ?? '–'} sub="Hora de fichaje"
                  icon={<Timer className="w-4 h-4" />} iconBg="bg-amber-100 dark:bg-amber-900/40" iconColor="text-amber-600" />
              </div>
            )}

            {/* Charts: Productividad por hora + Comparativa turnos */}
            {isManager && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Productividad por hora */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Productividad por hora</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full">
                      Hoy
                    </span>
                  </div>
                  <div className="p-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.hourlyProductivity} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <defs>
                          <linearGradient id="workerProdGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                        <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}€`} width={40} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const pt = payload[0].payload as HourlyProductivity;
                            return (
                              <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                                <span className="opacity-60 mr-1">{pt.hora}</span>
                                {formatEur(pt.ventas)} · {pt.tickets} tickets · {pt.trabajadores} trab.
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="ventas" stroke="#dc2626" strokeWidth={2} fill="url(#workerProdGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Comparativa por turno */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-amber-500" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Comparativa por turno</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-amber-600"><Sun className="w-3 h-3" /> Mañana</span>
                      <span className="flex items-center gap-1 text-indigo-600"><Moon className="w-3 h-3" /> Tarde</span>
                    </div>
                  </div>
                  <div className="p-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.shiftComparison} margin={{ top: 5, right: 5, left: 5, bottom: 5 }} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="metrica" type="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const pt = payload[0]?.payload as ShiftComparison;
                            return (
                              <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                                <p className="opacity-60 mb-0.5">{pt.metrica}</p>
                                <p>Mañana: {formatNum(pt.manana, 2)} · Tarde: {formatNum(pt.tarde, 2)}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="manana" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={16} name="Mañana" />
                        <Bar dataKey="tarde" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={16} name="Tarde" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Ranking rápido de trabajadores */}
            {isManager && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Ranking productividad</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full">Hoy</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('rendimiento')}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Ver detalle <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase w-12">#</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Trabajador</th>
                        <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                        <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tickets</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ventas</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">€/hora</th>
                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tendencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {[...data.workers]
                        .sort((a, b) => b.productividadHora - a.productividadHora)
                        .map((w, idx) => {
                          const estado = ESTADO_CONFIG[w.estado];
                          const medal = idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-orange-400' : 'text-gray-300';
                          return (
                            <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => setSelectedWorker(w)}>
                              <td className="px-3 py-3 text-center">
                                {idx < 3 ? <Star className={`w-4 h-4 mx-auto ${medal}`} fill="currentColor" /> : <span className="text-xs text-gray-400">{idx + 1}</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-bold">
                                    {w.avatar}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100">{w.nombre}</span>
                                    <p className="text-[10px] text-gray-400">{w.rol}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${estado.bg} ${estado.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${estado.dot}`} />
                                  {estado.label}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{w.ticketsHoy}</td>
                              <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(w.ingresosHoy)}</td>
                              <td className="px-3 py-3 text-right text-xs font-bold text-gray-900 dark:text-gray-100">{formatEur(w.productividadHora)}</td>
                              <td className="px-4 py-3 text-right">
                                {w.tendencia !== 0 ? (
                                  <span className={`flex items-center justify-end gap-0.5 text-[11px] font-bold ${w.tendencia > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {w.tendencia > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                    {w.tendencia > 0 ? '+' : ''}{w.tendencia}%
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-gray-400">–</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Worker self-view: tasks & schedule */}
            {!isManager && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-gray-500" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Mis tareas de hoy</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Completadas</span>
                      <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">{data.workers[0].tareasCompletadas}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Pendientes</span>
                      <span className="text-sm font-black text-amber-700 dark:text-amber-400">{data.workers[0].tareasPendientes}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-gray-500" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Mi horario</p>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-4 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                      <Clock className="w-8 h-8 text-red-500" />
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.workers[0].horario}</p>
                        <p className="text-xs text-gray-500">{TURNO_LABEL[data.workers[0].turno]} · {data.workers[0].rol}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => navigate('/saas/worker/clock')}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5" /> Fichar
                      </button>
                      <button
                        onClick={() => navigate('/saas/worker/tasks')}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <ClipboardList className="w-3.5 h-3.5" /> Tareas
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Conexiones rápidas */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Conexiones rápidas</p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {connections.map(c => (
                    <button
                      key={c.route}
                      onClick={() => navigate(c.route)}
                      className={`${c.bg} rounded-xl p-3 flex flex-col items-center gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-all`}
                    >
                      <span className={c.color}>{c.icon}</span>
                      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 text-center">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: EQUIPO */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'equipo' && (
          <>
            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="relative flex-1 w-full sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm"
                    placeholder="Buscar por nombre o rol..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                      className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                      value={filterTurno}
                      onChange={e => setFilterTurno(e.target.value as ShiftType | 'todos')}
                    >
                      <option value="todos">Todos los turnos</option>
                      <option value="manana">Mañana</option>
                      <option value="tarde">Tarde</option>
                      <option value="completa">Jornada completa</option>
                    </select>
                  </div>
                  <select
                    className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                    value={filterEstado}
                    onChange={e => setFilterEstado(e.target.value as Worker['estado'] | 'todos')}
                  >
                    <option value="todos">Todos los estados</option>
                    <option value="fichado">Fichados</option>
                    <option value="descanso">En descanso</option>
                    <option value="sin_fichar">Sin fichar</option>
                    <option value="libre">Libres</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['fichado', 'descanso', 'sin_fichar', 'libre'] as const).map(estado => {
                const cfg = ESTADO_CONFIG[estado];
                const count = data.workers.filter(w => w.estado === estado).length;
                return (
                  <div key={estado} className={`${cfg.bg} rounded-xl p-3 flex items-center gap-3`}>
                    <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                    <div>
                      <p className={`text-lg font-black ${cfg.text}`}>{count}</p>
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">{cfg.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Worker cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredWorkers.map(w => (
                <WorkerCard key={w.id} worker={w} isManager={isManager} onSelect={setSelectedWorker} />
              ))}
            </div>

            {filteredWorkers.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-12 text-center">
                <Users className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">No se encontraron trabajadores con esos filtros</p>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: RENDIMIENTO */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'rendimiento' && isManager && (
          <>
            {/* Full performance table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Rendimiento detallado</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Trabajador</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Turno</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Horas</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tickets</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ventas</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ticket medio</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">€/hora</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Coste</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Incid.</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tareas</th>
                      <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tendencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {data.workers.map(w => {
                      const ticketMedio = w.ticketsHoy > 0 ? w.ingresosHoy / w.ticketsHoy : 0;
                      const coste = w.costeHora * w.horasTrabajadas;
                      return (
                        <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => setSelectedWorker(w)}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-bold">
                                {w.avatar}
                              </div>
                              <div>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{w.nombre}</span>
                                <p className="text-[10px] text-gray-400">{w.rol}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-[10px] font-semibold text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                              {TURNO_LABEL[w.turno]}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{formatNum(w.horasTrabajadas, 1)}h</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{w.ticketsHoy}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{formatEur(w.ingresosHoy)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-gray-900 dark:text-gray-100">{formatEur(ticketMedio)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-violet-600">{formatEur(w.productividadHora)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-gray-600 dark:text-gray-400">{formatEur(coste)}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-xs font-bold ${w.incidencias > 0 ? 'text-red-600' : 'text-gray-400'}`}>{w.incidencias}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{w.tareasCompletadas}/{w.tareasCompletadas + w.tareasPendientes}</span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {w.tendencia !== 0 ? (
                              <span className={`flex items-center justify-end gap-0.5 text-[11px] font-bold ${w.tendencia > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {w.tendencia > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {w.tendencia > 0 ? '+' : ''}{w.tendencia}%
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400">–</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <td className="px-5 py-3 text-xs font-bold text-gray-500 uppercase" colSpan={2}>Totales</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-gray-900 dark:text-gray-100">{formatNum(data.horasTotales, 1)}h</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-gray-900 dark:text-gray-100">{data.totalTickets}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-emerald-600">{formatEur(data.totalVentas)}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-gray-900 dark:text-gray-100">{formatEur(data.ticketMedio)}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-violet-600">{formatEur(data.productividadMedia)}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-gray-600 dark:text-gray-400">{formatEur(data.costeLaboralEstimado)}</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-gray-900 dark:text-gray-100">{data.workers.reduce((a, w) => a + w.incidencias, 0)}</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-gray-900 dark:text-gray-100">
                        {data.workers.reduce((a, w) => a + w.tareasCompletadas, 0)}/{data.workers.reduce((a, w) => a + w.tareasCompletadas + w.tareasPendientes, 0)}
                      </td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Hourly breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Ventas por hora del equipo</p>
                </div>
              </div>
              <div className="p-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourlyProductivity} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}€`} width={40} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const pt = payload[0].payload as HourlyProductivity;
                        return (
                          <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                            <span className="opacity-60 mr-1">{pt.hora}</span>
                            {formatEur(pt.ventas)} · {pt.tickets} tickets
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="ventas" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {data.hourlyProductivity.map((d, idx) => (
                        <Cell key={idx} fill={d.ventas > 300 ? '#dc2626' : d.ventas > 150 ? '#f59e0b' : '#6b7280'} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* Rendimiento — worker self view */}
        {activeTab === 'rendimiento' && !isManager && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 text-center">
            <Eye className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Vista restringida</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">El detalle de rendimiento del equipo solo está disponible para gerentes. Puedes consultar tu operativa en la pestaña Resumen.</p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: ALERTAS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'alertas' && (
          <>
            {/* Alert summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(['critical', 'warning', 'info'] as AlertSeverity[]).map(severity => {
                const count = data.alerts.filter(a => a.severity === severity).length;
                const labels: Record<AlertSeverity, string> = { critical: 'Críticas', warning: 'Avisos', info: 'Informativas' };
                const colors: Record<AlertSeverity, { bg: string; text: string; dot: string }> = {
                  critical: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
                  warning:  { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
                  info:     { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-400' },
                };
                const c = colors[severity];
                return (
                  <div key={severity} className={`${c.bg} rounded-xl p-3 flex items-center gap-3`}>
                    <div className={`w-3 h-3 rounded-full ${c.dot}`} />
                    <div>
                      <p className={`text-lg font-black ${c.text}`}>{count}</p>
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">{labels[severity]}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Alert list */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setShowAlerts(!showAlerts)}
                className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas de trabajadores</p>
                  <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-full">
                    {data.alerts.length}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAlerts ? 'rotate-180' : ''}`} />
              </button>
              {showAlerts && (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {data.alerts.map(alert => {
                    const s = ALERT_STYLES[alert.severity];
                    const AlertIcon = ALERT_ICON_MAP[alert.tipo];
                    return (
                      <div key={alert.id} className={`flex items-center justify-between px-5 py-4 border-l-4 ${s.border} ${s.bg}`}>
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <AlertIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${s.icon}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{alert.trabajador}</span>
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                alert.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                  : alert.severity === 'warning' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                  : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                              }`}>
                                {alert.severity === 'critical' ? 'Crítica' : alert.severity === 'warning' ? 'Aviso' : 'Info'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{alert.mensaje}</p>
                          </div>
                        </div>
                        <button className={`flex-shrink-0 flex items-center gap-1 ml-3 text-[11px] font-bold ${s.text} hover:underline`}>
                          Resolver <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {data.alerts.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-12 text-center">
                <CheckCircle className="w-10 h-10 mx-auto text-emerald-400 mb-3" />
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Todo en orden — No hay alertas activas</p>
              </div>
            )}
          </>
        )}

      </div>

      {/* Worker detail modal */}
      {selectedWorker && (
        <WorkerDetailModal
          worker={selectedWorker}
          isManager={isManager}
          onClose={() => setSelectedWorker(null)}
        />
      )}
    </Layout>
  );
}
