import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie,
} from 'recharts';
import {
  Users, UserCheck, Clock, TrendingUp, TrendingDown,
  DollarSign, AlertTriangle, Shield, Wrench,
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus,
  Bell, ChevronDown, RefreshCw, Search, Filter,
  FileText, Timer, Euro, Boxes,
  Eye, Phone, Mail, ClipboardList, BarChart3,
  CheckCircle, XCircle, AlertCircle,
  ChevronRight, Star, Award, Truck,
  Receipt, Package, HardHat, MapPin,
  Play, Pause, Square, CircleDot, PackageCheck, Key,
  Loader2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole = 'gerente' | 'trabajador';
type TabId = 'resumen' | 'tareas' | 'equipo' | 'rendimiento' | 'alertas';
type AlertSeverity = 'critical' | 'warning' | 'info';
type ShiftType = 'manana' | 'tarde' | 'completa' | 'rotativo';
type TaskType = 'recepcion' | 'desmontaje' | 'catalogacion' | 'almacen' | 'venta' | 'expedicion';
type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';

interface Worker extends VerticalEntity {
  nombre: string;
  avatar: string;
  rol: string;
  email: string;
  telefono: string;
  zona: string;
  turno: ShiftType;
  horario: string;
  costeHora: number;
  estado: 'fichado' | 'descanso' | 'sin_fichar' | 'libre';
  horaEntrada: string | null;
  permisos: string[];
  especializaciones: string[];
  documentos: { tipo: string; estado: 'vigente' | 'pendiente' | 'caducado' }[];
  piezasDesmontadas: number;
  piezasCatalogadas: number;
  ventasAtendidas: number;
  ingresosHoy: number;
  expedicionesHoy: number;
  horasTrabajadas: number;
  tareasCompletadas: number;
  tareasPendientes: number;
  tareasEnCurso: number;
  incidencias: number;
  productividadHora: number;
  tendencia: number;
}

interface OperativeTask {
  id: string;
  taskType: TaskType;
  title: string;
  description: string;
  assignedWorkerName: string | null;
  assignedWorkerId: string | null;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  partCount: number | null;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  estimatedMinutes: number;
  totalMinutes: number;
  scheduledTime: string | null;
}

interface WorkerAlert {
  id: string;
  tipo: 'sin_fichar' | 'baja_productividad' | 'exceso_horas' | 'documento_caducado' | 'tarea_pendiente';
  severity: AlertSeverity;
  trabajador: string;
  mensaje: string;
  timestamp: Date;
}

interface HourlyProductivity {
  hora: string;
  piezas: number;
  tareas: number;
  trabajadores: number;
}

interface TaskTypeSummary {
  tipo: TaskType;
  label: string;
  pendientes: number;
  enCurso: number;
  completadas: number;
}

// ─── Datos derivados (trabajadores desde API; tareas/alertas vacías hasta integración) ──

function buildDashboardData(workers: Worker[]) {
  const tasks: OperativeTask[] = [];
  const hourlyProductivity: HourlyProductivity[] = [];
  const alerts: WorkerAlert[] = [];

  const totalPiezas = workers.reduce((a, w) => a + w.piezasDesmontadas + w.piezasCatalogadas, 0);
  const totalVentas = workers.reduce((a, w) => a + w.ingresosHoy, 0);
  const totalTickets = workers.reduce((a, w) => a + w.ventasAtendidas, 0);
  const trabajadoresFichados = workers.filter(w => w.estado === 'fichado' || w.estado === 'descanso').length;
  const horasTotales = workers.reduce((a, w) => a + w.horasTrabajadas, 0);
  const productividadMedia = horasTotales > 0 ? totalPiezas / horasTotales : 0;
  const costeLaboralEstimado = workers.reduce((a, w) => a + (w.costeHora * w.horasTrabajadas), 0);
  const tareasPendientesTotal = workers.reduce((a, w) => a + w.tareasPendientes, 0)
    + tasks.filter(t => !t.assignedWorkerId && t.status === 'pending').length;

  return {
    workers, tasks, hourlyProductivity, alerts,
    totalPiezas, totalVentas, totalTickets, trabajadoresFichados, horasTotales,
    productividadMedia, costeLaboralEstimado, tareasPendientesTotal,
  };
}

function normalizeWorker(raw: Worker): Worker {
  const w = raw;
  return {
    ...w,
    permisos: Array.isArray(w.permisos) ? w.permisos : [],
    especializaciones: Array.isArray(w.especializaciones) ? w.especializaciones : [],
    documentos: Array.isArray(w.documentos) ? w.documentos : [],
    nombre: w.nombre ?? '',
    avatar: w.avatar ?? '?',
    rol: w.rol ?? '',
    email: w.email ?? '',
    telefono: w.telefono ?? '',
    zona: w.zona ?? '',
    turno: (w.turno as ShiftType) || 'manana',
    horario: w.horario ?? '',
    costeHora: Number(w.costeHora) || 0,
    estado: w.estado ?? 'sin_fichar',
    horaEntrada: w.horaEntrada ?? null,
    piezasDesmontadas: Number(w.piezasDesmontadas) || 0,
    piezasCatalogadas: Number(w.piezasCatalogadas) || 0,
    ventasAtendidas: Number(w.ventasAtendidas) || 0,
    ingresosHoy: Number(w.ingresosHoy) || 0,
    expedicionesHoy: Number(w.expedicionesHoy) || 0,
    horasTrabajadas: Number(w.horasTrabajadas) || 0,
    tareasCompletadas: Number(w.tareasCompletadas) || 0,
    tareasPendientes: Number(w.tareasPendientes) || 0,
    tareasEnCurso: Number(w.tareasEnCurso) || 0,
    incidencias: Number(w.incidencias) || 0,
    productividadHora: Number(w.productividadHora) || 0,
    tendencia: Number(w.tendencia) || 0,
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

const TURNO_LABEL: Record<ShiftType, string> = { manana: 'Mañana', tarde: 'Tarde', completa: 'Jornada completa', rotativo: 'Rotativo' };

const ALERT_STYLES: Record<AlertSeverity, { border: string; bg: string; icon: string; text: string }> = {
  critical: { border: 'border-l-red-500',   bg: 'bg-red-50 dark:bg-red-950/30',    icon: 'text-red-500',   text: 'text-red-700 dark:text-red-400' },
  warning:  { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', icon: 'text-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  info:     { border: 'border-l-blue-400',  bg: 'bg-blue-50 dark:bg-blue-950/30',   icon: 'text-blue-400',  text: 'text-blue-700 dark:text-blue-400' },
};

const DOC_ESTADO_CONFIG = {
  vigente:   { label: 'Vigente',   icon: CheckCircle, color: 'text-emerald-500' },
  pendiente: { label: 'Pendiente', icon: AlertCircle, color: 'text-amber-500' },
  caducado:  { label: 'Caducado',  icon: XCircle,     color: 'text-red-500' },
} as const;

const ALERT_ICON_MAP = {
  sin_fichar: XCircle,
  baja_productividad: TrendingDown,
  exceso_horas: Timer,
  documento_caducado: FileText,
  tarea_pendiente: ClipboardList,
} as const;

const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: typeof Truck; color: string; bg: string }> = {
  recepcion:    { label: 'Recepción',    icon: Truck,         color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  desmontaje:   { label: 'Desmontaje',   icon: Wrench,        color: 'text-orange-600',  bg: 'bg-orange-50 dark:bg-orange-900/30' },
  catalogacion: { label: 'Catalogación', icon: ClipboardList, color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-900/30' },
  almacen:      { label: 'Almacén',      icon: Boxes,         color: 'text-violet-600',  bg: 'bg-violet-50 dark:bg-violet-900/30' },
  venta:        { label: 'Venta',        icon: Receipt,       color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  expedicion:   { label: 'Expedición',   icon: PackageCheck,  color: 'text-cyan-600',    bg: 'bg-cyan-50 dark:bg-cyan-900/30' },
};

const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string; bg: string; text: string }> = {
  pending:     { label: 'Pendiente',  dot: 'bg-gray-400',    bg: 'bg-gray-100 dark:bg-gray-700/50', text: 'text-gray-600 dark:text-gray-400' },
  assigned:    { label: 'Asignada',   dot: 'bg-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/30',  text: 'text-blue-700 dark:text-blue-300' },
  in_progress: { label: 'En curso',   dot: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  paused:      { label: 'Pausada',    dot: 'bg-orange-500',  bg: 'bg-orange-50 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
  completed:   { label: 'Completada', dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  cancelled:   { label: 'Cancelada',  dot: 'bg-red-500',     bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Baja',    color: 'text-gray-500' },
  normal: { label: 'Normal',  color: 'text-blue-600' },
  high:   { label: 'Alta',    color: 'text-amber-600' },
  urgent: { label: 'Urgente', color: 'text-red-600' },
} as const;

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'resumen',      label: 'Resumen',      icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'tareas',       label: 'Tareas',        icon: <ClipboardList className="w-4 h-4" /> },
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
  const totalPiezas = worker.piezasDesmontadas + worker.piezasCatalogadas;

  return (
    <button
      onClick={() => onSelect(worker)}
      className="w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-5 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm">
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{worker.rol} · {worker.zona} · {worker.horario}</p>

          {isManager && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 text-center">
                <p className="text-sm font-black text-gray-900 dark:text-gray-100">{totalPiezas}</p>
                <p className="text-[9px] font-semibold text-gray-400 uppercase">Piezas</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2 text-center">
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{worker.ingresosHoy > 0 ? formatEur(worker.ingresosHoy) : `${worker.ventasAtendidas} ventas`}</p>
                <p className="text-[9px] font-semibold text-gray-400 uppercase">{worker.ingresosHoy > 0 ? 'Ventas' : 'Operaciones'}</p>
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
                <span className="text-[10px] font-semibold text-gray-400">{formatEur(worker.costeHora)}/h</span>
              )}
              {worker.especializaciones.length > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-indigo-500">
                  <Wrench className="w-3 h-3" /> {worker.especializaciones[0]}
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
  const totalPiezas = worker.piezasDesmontadas + worker.piezasCatalogadas;

  const radarData = [
    { subject: 'Piezas', value: Math.min(100, (totalPiezas / 30) * 100) },
    { subject: 'Ventas', value: Math.min(100, (worker.ventasAtendidas / 15) * 100) },
    { subject: 'Productividad', value: Math.min(100, (worker.productividadHora / 4) * 100) },
    { subject: 'Tareas', value: worker.tareasCompletadas + worker.tareasPendientes > 0
      ? (worker.tareasCompletadas / (worker.tareasCompletadas + worker.tareasPendientes)) * 100 : 0 },
    { subject: 'Puntualidad', value: worker.estado === 'sin_fichar' ? 20 : 90 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-700 opacity-10" />
          <div className="relative px-6 pt-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shadow-lg">
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
                  <span className="flex items-center gap-1 text-[11px] text-gray-400"><MapPin className="w-3 h-3" /> {worker.zona}</span>
                  {isManager && <span className="flex items-center gap-1 text-[11px] text-gray-400"><Euro className="w-3 h-3" /> {formatEur(worker.costeHora)}/h</span>}
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-b border-gray-100 dark:border-gray-700/50 flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-gray-500"><Mail className="w-3.5 h-3.5" /> {worker.email}</span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500"><Phone className="w-3.5 h-3.5" /> {worker.telefono}</span>
        </div>

        <div className="p-6 space-y-5">
          {isManager && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-blue-700 dark:text-blue-400">{totalPiezas}</p>
                <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-500 uppercase">Piezas hoy</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{worker.ingresosHoy > 0 ? formatEur(worker.ingresosHoy) : worker.ventasAtendidas}</p>
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 uppercase">{worker.ingresosHoy > 0 ? 'Ventas €' : 'Operaciones'}</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-indigo-700 dark:text-indigo-400">{formatNum(worker.horasTrabajadas, 1)}h</p>
                <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-500 uppercase">Horas</p>
              </div>
              <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-violet-700 dark:text-violet-400">{formatNum(worker.productividadHora, 2)}/h</p>
                <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-500 uppercase">Productividad</p>
              </div>
            </div>
          )}

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
                      <Radar dataKey="value" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.2} strokeWidth={2} />
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
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600 dark:text-gray-300">En curso</span>
                        <span className="text-xs font-bold text-amber-600">{worker.tareasEnCurso}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600 dark:text-gray-300">Pendientes</span>
                        <span className="text-xs font-bold text-gray-500">{worker.tareasPendientes}</span>
                      </div>
                    </div>
                    <div className="w-12 h-12">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { value: worker.tareasCompletadas, fill: '#10b981' },
                              { value: worker.tareasEnCurso, fill: '#f59e0b' },
                              { value: worker.tareasPendientes, fill: '#9ca3af' },
                            ]}
                            dataKey="value" innerRadius={14} outerRadius={22} strokeWidth={0}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
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

          {!isManager && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-blue-700 dark:text-blue-400">{totalPiezas}</p>
                <p className="text-[10px] font-semibold text-blue-600 uppercase">Piezas</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{worker.tareasCompletadas}</p>
                <p className="text-[10px] font-semibold text-emerald-600 uppercase">Tareas</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-indigo-700 dark:text-indigo-400">{formatNum(worker.horasTrabajadas, 1)}h</p>
                <p className="text-[10px] font-semibold text-indigo-600 uppercase">Horas</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-amber-700 dark:text-amber-400">{worker.horaEntrada ?? '–'}</p>
                <p className="text-[10px] font-semibold text-amber-600 uppercase">Entrada</p>
              </div>
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Especializaciones</p>
            <div className="flex flex-wrap gap-2">
              {worker.especializaciones.map(e => (
                <span key={e} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold rounded-lg">
                  <Wrench className="w-3 h-3" /> {e}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Permisos</p>
            <div className="flex flex-wrap gap-2">
              {worker.permisos.map(p => (
                <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-semibold rounded-lg capitalize">
                  <Key className="w-3 h-3" /> {p}
                </span>
              ))}
            </div>
          </div>

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

        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-3 rounded-b-2xl">
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/saas/clockins')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" /> Fichajes
            </button>
            <button
              onClick={() => navigate(`/saas/team/${worker._id}`)}
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

export function ScrapyardWorkers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Worker>('scrapyard-ops', 'workers'), []);
  const userId = user?.user_id || user?.id || '';

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>('gerente');
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const [search, setSearch] = useState('');
  const [filterTurno, setFilterTurno] = useState<ShiftType | 'todos'>('todos');
  const [filterEstado, setFilterEstado] = useState<Worker['estado'] | 'todos'>('todos');
  const [filterZona, setFilterZona] = useState('todas');
  const [filterTaskType, setFilterTaskType] = useState<TaskType | 'todos'>('todos');
  const [filterTaskStatus, setFilterTaskStatus] = useState<TaskStatus | 'todos'>('todos');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [showAlerts, setShowAlerts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(() => new Date());

  const loadData = useCallback(async () => {
    if (!userId) {
      setWorkers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setWorkers(list.map(normalizeWorker));
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const data = useMemo(() => buildDashboardData(workers), [workers]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const filteredWorkers = useMemo(() => {
    return data.workers.filter(w => {
      if (search) {
        const q = search.toLowerCase();
        if (!w.nombre.toLowerCase().includes(q) && !w.rol.toLowerCase().includes(q) && !w.zona.toLowerCase().includes(q)) return false;
      }
      if (filterTurno !== 'todos' && w.turno !== filterTurno) return false;
      if (filterEstado !== 'todos' && w.estado !== filterEstado) return false;
      if (filterZona !== 'todas' && !w.zona.toLowerCase().includes(filterZona.toLowerCase())) return false;
      return true;
    });
  }, [data.workers, search, filterTurno, filterEstado, filterZona]);

  const filteredTasks = useMemo(() => {
    return data.tasks.filter(t => {
      if (filterTaskType !== 'todos' && t.taskType !== filterTaskType) return false;
      if (filterTaskStatus !== 'todos' && t.status !== filterTaskStatus) return false;
      return true;
    });
  }, [data.tasks, filterTaskType, filterTaskStatus]);

  const taskSummary: TaskTypeSummary[] = useMemo(() => {
    return (['recepcion', 'desmontaje', 'catalogacion', 'almacen', 'venta', 'expedicion'] as TaskType[]).map(tipo => ({
      tipo,
      label: TASK_TYPE_CONFIG[tipo].label,
      pendientes: data.tasks.filter(t => t.taskType === tipo && (t.status === 'pending' || t.status === 'assigned')).length,
      enCurso: data.tasks.filter(t => t.taskType === tipo && (t.status === 'in_progress' || t.status === 'paused')).length,
      completadas: data.tasks.filter(t => t.taskType === tipo && t.status === 'completed').length,
    }));
  }, [data.tasks]);

  const criticalAlerts = data.alerts.filter(a => a.severity === 'critical').length;
  const isManager = role === 'gerente';

  const connections = [
    { label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" />, route: '/saas/dashboard', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Despiece', icon: <Wrench className="w-4 h-4" />, route: '/saas/scrapyard-parts', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    { label: 'Stock', icon: <Boxes className="w-4 h-4" />, route: '/saas/scrapyard-inventory', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Ventas', icon: <Receipt className="w-4 h-4" />, route: '/saas/scrapyard-sales', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Expedición', icon: <PackageCheck className="w-4 h-4" />, route: '/saas/scrapyard-expedition', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    { label: 'Equipo', icon: <Users className="w-4 h-4" />, route: '/saas/team', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
    { label: 'Fichajes', icon: <Clock className="w-4 h-4" />, route: '/saas/clockins', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Informes', icon: <BarChart3 className="w-4 h-4" />, route: '/saas/vertical/desguaces/informes', color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800' },
  ];

  return (
    <Layout title="Trabajadores y Operativa" subtitle="Desguace — Rendimiento del equipo">
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Cargando datos del equipo…</p>
          </div>
        ) : (
          <>
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
                <AlertCircle className="w-3.5 h-3.5" /> {criticalAlerts} alerta{criticalAlerts > 1 ? 's' : ''} crítica{criticalAlerts > 1 ? 's' : ''}
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
            <button onClick={handleRefresh} disabled={refreshing} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
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
              {tab.id === 'tareas' && data.tasks.filter(t => t.status === 'in_progress').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded-full min-w-[16px] text-center">
                  {data.tasks.filter(t => t.status === 'in_progress').length}
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
            {isManager ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard title="Piezas procesadas" value={String(data.totalPiezas)} sub="Desmontadas + catalogadas"
                  icon={<Package className="w-4 h-4" />} iconBg="bg-blue-100 dark:bg-blue-900/40" iconColor="text-blue-600"
                  trend={{ value: '+18% vs ayer', up: true }} />
                <KPICard title="Ventas equipo" value={formatEur(data.totalVentas)} sub={`${data.totalTickets} tickets`}
                  icon={<DollarSign className="w-4 h-4" />} iconBg="bg-emerald-100 dark:bg-emerald-900/40" iconColor="text-emerald-600"
                  trend={{ value: '+12% vs ayer', up: true }} onClick={() => navigate('/saas/scrapyard-sales')} />
                <KPICard title="Productividad/h" value={formatNum(data.productividadMedia, 2)} sub="Piezas/hora media"
                  icon={<TrendingUp className="w-4 h-4" />} iconBg="bg-violet-100 dark:bg-violet-900/40" iconColor="text-violet-600"
                  trend={{ value: '+5.3% vs semana ant.', up: true }} />
                <KPICard title="Equipo fichado" value={`${data.trabajadoresFichados}/${data.workers.length}`} sub="Trabajadores activos"
                  icon={<UserCheck className="w-4 h-4" />} iconBg="bg-indigo-100 dark:bg-indigo-900/40" iconColor="text-indigo-600"
                  onClick={() => navigate('/saas/clockins')} />
                <KPICard title="Horas trabajadas" value={`${formatNum(data.horasTotales, 1)}h`} sub="Total equipo hoy"
                  icon={<Clock className="w-4 h-4" />} iconBg="bg-cyan-100 dark:bg-cyan-900/40" iconColor="text-cyan-600" />
                <KPICard title="Coste laboral" value={formatEur(data.costeLaboralEstimado)} sub="Estimado hoy"
                  icon={<Euro className="w-4 h-4" />} iconBg="bg-amber-100 dark:bg-amber-900/40" iconColor="text-amber-600"
                  trend={{ value: `${data.totalVentas > 0 ? formatNum((data.costeLaboralEstimado / data.totalVentas) * 100, 1) : '0'}% sobre ventas`, up: null }} />
                <KPICard title="Tareas pendientes" value={String(data.tareasPendientesTotal)} sub="Sin iniciar hoy"
                  icon={<ClipboardList className="w-4 h-4" />} iconBg="bg-orange-100 dark:bg-orange-900/40" iconColor="text-orange-600"
                  onClick={() => setActiveTab('tareas')} />
                <KPICard title="Alertas activas" value={String(data.alerts.length)} sub={`${criticalAlerts} críticas`}
                  icon={<Bell className="w-4 h-4" />} iconBg={criticalAlerts > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-800'}
                  iconColor={criticalAlerts > 0 ? 'text-red-600' : 'text-gray-400'}
                  onClick={() => setActiveTab('alertas')} />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard title="Mis piezas" value={String((sampleWorker?.piezasDesmontadas ?? 0) + (sampleWorker?.piezasCatalogadas ?? 0))} sub="Hoy"
                  icon={<Package className="w-4 h-4" />} iconBg="bg-blue-100 dark:bg-blue-900/40" iconColor="text-blue-600" />
                <KPICard title="Tareas hechas" value={String(sampleWorker?.tareasCompletadas ?? 0)} sub={`${sampleWorker?.tareasPendientes ?? 0} pendientes`}
                  icon={<CheckCircle className="w-4 h-4" />} iconBg="bg-emerald-100 dark:bg-emerald-900/40" iconColor="text-emerald-600" />
                <KPICard title="Horas" value={`${formatNum(sampleWorker?.horasTrabajadas ?? 0, 1)}h`} sub="Trabajadas hoy"
                  icon={<Clock className="w-4 h-4" />} iconBg="bg-indigo-100 dark:bg-indigo-900/40" iconColor="text-indigo-600" />
                <KPICard title="Entrada" value={sampleWorker?.horaEntrada ?? '–'} sub="Hora de fichaje"
                  icon={<Timer className="w-4 h-4" />} iconBg="bg-amber-100 dark:bg-amber-900/40" iconColor="text-amber-600" />
              </div>
            )}

            {isManager && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Productividad por hora</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">Hoy</span>
                  </div>
                  <div className="p-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.hourlyProductivity} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <defs>
                          <linearGradient id="scrapWorkerProdGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                        <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const pt = payload[0].payload as HourlyProductivity;
                          return (
                            <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                              <span className="opacity-60 mr-1">{pt.hora}</span>
                              {pt.piezas} piezas · {pt.tareas} tareas · {pt.trabajadores} trab.
                            </div>
                          );
                        }} />
                        <Area type="monotone" dataKey="piezas" stroke="#4f46e5" strokeWidth={2} fill="url(#scrapWorkerProdGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Tareas por tipo</p>
                    </div>
                    <button onClick={() => setActiveTab('tareas')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                      Ver todas <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={taskSummary} layout="vertical" margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="label" type="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={85} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const pt = payload[0].payload as TaskTypeSummary;
                          return (
                            <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                              {pt.label}: {pt.completadas} completadas · {pt.enCurso} en curso · {pt.pendientes} pendientes
                            </div>
                          );
                        }} />
                        <Bar dataKey="completadas" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={16} name="Completadas" />
                        <Bar dataKey="enCurso" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} maxBarSize={16} name="En curso" />
                        <Bar dataKey="pendientes" stackId="a" fill="#9ca3af" radius={[0, 4, 4, 0]} maxBarSize={16} name="Pendientes" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {isManager && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Ranking productividad</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full">Hoy</span>
                  </div>
                  <button onClick={() => setActiveTab('rendimiento')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
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
                        <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Piezas</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ventas</th>
                        <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Piez/h</th>
                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tendencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {[...data.workers]
                        .sort((a, b) => b.productividadHora - a.productividadHora)
                        .map((w, idx) => {
                          const est = ESTADO_CONFIG[w.estado];
                          const medal = idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-orange-400' : 'text-gray-300';
                          const totalP = w.piezasDesmontadas + w.piezasCatalogadas;
                          return (
                            <tr key={w._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => setSelectedWorker(w)}>
                              <td className="px-3 py-3 text-center">
                                {idx < 3 ? <Star className={`w-4 h-4 mx-auto ${medal}`} fill="currentColor" /> : <span className="text-xs text-gray-400">{idx + 1}</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">{w.avatar}</div>
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100">{w.nombre}</span>
                                    <p className="text-[10px] text-gray-400">{w.rol} · {w.zona}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${est.bg} ${est.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} />{est.label}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{totalP}</td>
                              <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{w.ingresosHoy > 0 ? formatEur(w.ingresosHoy) : `${w.ventasAtendidas}`}</td>
                              <td className="px-3 py-3 text-right text-xs font-bold text-gray-900 dark:text-gray-100">{formatNum(w.productividadHora, 2)}</td>
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

            {!isManager && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-gray-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Mis tareas de hoy</p></div>
                  </div>
                  <div className="p-5 space-y-3">
                    {data.tasks.filter(t => sampleWorker && t.assignedWorkerId === sampleWorker._id).slice(0, 4).map(t => {
                      const tcfg = TASK_TYPE_CONFIG[t.taskType];
                      const scfg = TASK_STATUS_CONFIG[t.status];
                      const TIcon = tcfg.icon;
                      return (
                        <div key={t.id} className="flex items-center justify-between p-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 ${tcfg.bg} rounded-lg flex items-center justify-center`}>
                              <TIcon className={`w-4 h-4 ${tcfg.color}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{t.title}</p>
                              <p className="text-[10px] text-gray-400">{tcfg.label} · {t.estimatedMinutes}min est.</p>
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${scfg.bg} ${scfg.text} flex-shrink-0 ml-2`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${scfg.dot}`} />{scfg.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /><p className="text-sm font-bold text-gray-900 dark:text-gray-100">Mi horario</p></div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-4 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                      <HardHat className="w-8 h-8 text-indigo-500" />
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{sampleWorker?.horario ?? '–'}</p>
                        <p className="text-xs text-gray-500">{sampleWorker ? `${TURNO_LABEL[sampleWorker.turno]} · ${sampleWorker.rol} · ${sampleWorker.zona}` : 'Sin datos de trabajador'}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => navigate('/saas/worker/clock')} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors">
                        <Clock className="w-3.5 h-3.5" /> Fichar
                      </button>
                      <button onClick={() => setActiveTab('tareas')} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <ClipboardList className="w-3.5 h-3.5" /> Tareas
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Conexiones rápidas</p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {connections.map(c => (
                    <button key={c.route} onClick={() => navigate(c.route)} className={`${c.bg} rounded-xl p-3 flex flex-col items-center gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-all`}>
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
        {/* TAB: TAREAS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'tareas' && (
          <>
            {isManager && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {taskSummary.map(ts => {
                  const cfg = TASK_TYPE_CONFIG[ts.tipo];
                  const TIcon = cfg.icon;
                  return (
                    <div key={ts.tipo} className={`${cfg.bg} rounded-xl p-3 text-center`}>
                      <TIcon className={`w-5 h-5 mx-auto mb-1 ${cfg.color}`} />
                      <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{ts.label}</p>
                      <div className="flex items-center justify-center gap-2 text-[10px] font-bold">
                        <span className="text-emerald-600">{ts.completadas}</span>
                        <span className="text-amber-600">{ts.enCurso}</span>
                        <span className="text-gray-400">{ts.pendientes}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select value={filterTaskType} onChange={e => setFilterTaskType(e.target.value as TaskType | 'todos')} className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none">
                    <option value="todos">Todos los tipos</option>
                    {Object.entries(TASK_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select value={filterTaskStatus} onChange={e => setFilterTaskStatus(e.target.value as TaskStatus | 'todos')} className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none">
                    <option value="todos">Todos los estados</option>
                    {Object.entries(TASK_STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tipo</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarea</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Vehículo/Pieza</th>
                      <th className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Asignado a</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Prioridad</th>
                      <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tiempo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {filteredTasks.map(t => {
                      const tcfg = TASK_TYPE_CONFIG[t.taskType];
                      const scfg = TASK_STATUS_CONFIG[t.status];
                      const pcfg = PRIORITY_CONFIG[t.priority];
                      const TIcon = tcfg.icon;
                      return (
                        <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold ${tcfg.bg} ${tcfg.color}`}>
                              <TIcon className="w-3 h-3" /> {tcfg.label}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{t.title}</p>
                            <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{t.description}</p>
                          </td>
                          <td className="px-3 py-3">
                            {t.vehiclePlate ? (
                              <div>
                                <p className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">{t.vehiclePlate}</p>
                                <p className="text-[10px] text-gray-400">{t.vehicleModel}</p>
                              </div>
                            ) : t.partCount ? (
                              <span className="text-xs text-gray-500">{t.partCount} piezas</span>
                            ) : (
                              <span className="text-[10px] text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-700 dark:text-gray-300">
                            {t.assignedWorkerName || <span className="text-amber-500 font-bold">Sin asignar</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${scfg.bg} ${scfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${scfg.dot}`} />{scfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-[10px] font-bold ${pcfg.color}`}>{pcfg.label}</span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-xs text-gray-600 dark:text-gray-400">{t.totalMinutes > 0 ? `${t.totalMinutes}min` : '—'}</span>
                            <span className="text-[10px] text-gray-400 ml-1">/ {t.estimatedMinutes}min</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredTasks.length === 0 && (
                <div className="p-12 text-center">
                  <ClipboardList className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">No hay tareas con esos filtros</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: EQUIPO */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'equipo' && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="relative flex-1 w-full sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm"
                    placeholder="Buscar por nombre, rol o zona..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select value={filterTurno} onChange={e => setFilterTurno(e.target.value as ShiftType | 'todos')} className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none">
                    <option value="todos">Todos los turnos</option>
                    <option value="manana">Mañana</option><option value="tarde">Tarde</option><option value="completa">Jornada completa</option><option value="rotativo">Rotativo</option>
                  </select>
                  <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as Worker['estado'] | 'todos')} className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none">
                    <option value="todos">Todos los estados</option>
                    <option value="fichado">Fichados</option><option value="descanso">En descanso</option><option value="sin_fichar">Sin fichar</option><option value="libre">Libres</option>
                  </select>
                  <select value={filterZona} onChange={e => setFilterZona(e.target.value)} className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none">
                    <option value="todas">Todas las zonas</option>
                    <option value="Zona A">Zona A</option><option value="Zona B">Zona B</option><option value="Zona C">Zona C</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['fichado', 'descanso', 'sin_fichar', 'libre'] as const).map(est => {
                const cfg = ESTADO_CONFIG[est];
                const count = data.workers.filter(w => w.estado === est).length;
                return (
                  <div key={est} className={`${cfg.bg} rounded-xl p-3 flex items-center gap-3`}>
                    <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                    <div>
                      <p className={`text-lg font-black ${cfg.text}`}>{count}</p>
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">{cfg.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredWorkers.map(w => (
                <WorkerCard key={w._id} worker={w} isManager={isManager} onSelect={setSelectedWorker} />
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
        {activeTab === 'rendimiento' && !loading && isManager && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Rendimiento detallado</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Trabajador</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Zona</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Horas</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Desmont.</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Catalog.</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ventas</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">€ Ventas</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Exped.</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Piez/h</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Coste</th>
                      <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tareas</th>
                      <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tend.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {data.workers.map(w => {
                      const coste = w.costeHora * w.horasTrabajadas;
                      return (
                        <tr key={w._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => setSelectedWorker(w)}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">{w.avatar}</div>
                              <div>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{w.nombre}</span>
                                <p className="text-[10px] text-gray-400">{w.rol}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center"><span className="text-[10px] font-semibold text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">{w.zona.split(' – ')[0]}</span></td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{formatNum(w.horasTrabajadas, 1)}h</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-orange-600">{w.piezasDesmontadas}</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-blue-600">{w.piezasCatalogadas}</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{w.ventasAtendidas}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-emerald-600">{w.ingresosHoy > 0 ? formatEur(w.ingresosHoy) : '—'}</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-cyan-600">{w.expedicionesHoy}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-violet-600">{formatNum(w.productividadHora, 2)}</td>
                          <td className="px-3 py-3 text-right text-xs font-bold text-gray-600 dark:text-gray-400">{formatEur(coste)}</td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-gray-900 dark:text-gray-100">{w.tareasCompletadas}/{w.tareasCompletadas + w.tareasPendientes + w.tareasEnCurso}</td>
                          <td className="px-5 py-3 text-right">
                            {w.tendencia !== 0 ? (
                              <span className={`flex items-center justify-end gap-0.5 text-[11px] font-bold ${w.tendencia > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {w.tendencia > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {w.tendencia > 0 ? '+' : ''}{w.tendencia}%
                              </span>
                            ) : <span className="text-[11px] text-gray-400">–</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <td className="px-5 py-3 text-xs font-bold text-gray-500 uppercase" colSpan={2}>Totales</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-gray-900 dark:text-gray-100">{formatNum(data.horasTotales, 1)}h</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-orange-600">{data.workers.reduce((a, w) => a + w.piezasDesmontadas, 0)}</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-blue-600">{data.workers.reduce((a, w) => a + w.piezasCatalogadas, 0)}</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-gray-900 dark:text-gray-100">{data.totalTickets}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-emerald-600">{formatEur(data.totalVentas)}</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-cyan-600">{data.workers.reduce((a, w) => a + w.expedicionesHoy, 0)}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-violet-600">{formatNum(data.productividadMedia, 2)}</td>
                      <td className="px-3 py-3 text-right text-xs font-black text-gray-600">{formatEur(data.costeLaboralEstimado)}</td>
                      <td className="px-3 py-3 text-center text-xs font-black text-gray-900 dark:text-gray-100">
                        {data.workers.reduce((a, w) => a + w.tareasCompletadas, 0)}/{data.workers.reduce((a, w) => a + w.tareasCompletadas + w.tareasPendientes + w.tareasEnCurso, 0)}
                      </td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Piezas por hora del equipo</p>
                </div>
              </div>
              <div className="p-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourlyProductivity} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as HourlyProductivity;
                      return (
                        <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                          <span className="opacity-60 mr-1">{pt.hora}</span>{pt.piezas} piezas · {pt.tareas} tareas
                        </div>
                      );
                    }} />
                    <Bar dataKey="piezas" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {data.hourlyProductivity.map((d, idx) => (
                        <Cell key={idx} fill={d.piezas > 8 ? '#4f46e5' : d.piezas > 5 ? '#f59e0b' : '#6b7280'} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {activeTab === 'rendimiento' && !loading && !isManager && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 text-center">
            <Eye className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Vista restringida</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">El detalle de rendimiento del equipo solo está disponible para gerentes. Puedes consultar tu operativa en la pestaña Resumen.</p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB: ALERTAS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'alertas' && !loading && (
          <>
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

            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
              <button onClick={() => setShowAlerts(!showAlerts)} className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas de trabajadores</p>
                  <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-full">{data.alerts.length}</span>
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

          </>
        )}
      </div>

      {selectedWorker && (
        <WorkerDetailModal worker={selectedWorker} isManager={isManager} onClose={() => setSelectedWorker(null)} />
      )}
    </Layout>
  );
}
