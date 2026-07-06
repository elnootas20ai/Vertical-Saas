import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  fetchWorkerPerformance,
  type WorkerPerformanceData,
  type TeamSummaryData,
  type WorkerAlert,
} from '../../lib/workerPerformanceApi';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie,
} from 'recharts';
import {
  Users, UserCheck, Clock, TrendingUp, TrendingDown,
  DollarSign, AlertTriangle, Shield, Zap,
  ArrowUpRight, ArrowDownRight, Minus,
  Bell, RefreshCw, Search, Filter,
  CalendarDays, Euro, Briefcase,
  Eye, Phone, Mail,
  ClipboardList, BarChart3, Target,
  CheckCircle, XCircle, AlertCircle, Info,
  ChevronRight, Award, Car, FileText,
  X, ExternalLink, Truck, UserPlus,
  Activity, Kanban, CircleAlert, Receipt,
} from 'lucide-react';

const COMPRAVENTA_VENTAS_PATH = '/saas/vertical/compraventa/ventas';
const COMPRAVENTA_ENTREGAS_PATH = '/saas/vertical/compraventa/entregas';
import { format, subDays, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'resumen' | 'equipo' | 'rendimiento' | 'alertas';
type PeriodPreset = '7d' | '30d' | '90d' | 'year' | 'custom';

const ADMIN_ROLES = new Set(['Admin', 'Gerente']);
const PERIOD_LABELS: Record<PeriodPreset, string> = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  year: 'Este año',
  custom: 'Custom',
};

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-300', icon: <XCircle className="w-4 h-4 text-red-500" />, badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' },
  warning: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' },
  info: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', icon: <Info className="w-4 h-4 text-blue-500" />, badge: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' },
};

const ESTADO_BADGE: Record<string, { dot: string; bg: string; text: string }> = {
  fichado: { dot: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-300' },
  activo: { dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300' },
  descanso: { dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300' },
  inactivo: { dot: 'bg-gray-400', bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
};

const CHART_COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtEur(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('es-ES').format(n);
}

function fmtPct(n: number) {
  return `${n}%`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400"><Minus className="w-3 h-3" /> 0%</span>;
  const positive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {positive ? '+' : ''}{value}%
    </span>
  );
}

function KPICard({ icon, label, value, sub, trend, accent = 'indigo' }: { icon: React.ReactNode; label: string; value: string; sub?: string; trend?: number; accent?: string }) {
  const accentMap: Record<string, string> = {
    indigo: 'from-indigo-500 to-indigo-600',
    cyan: 'from-cyan-500 to-cyan-600',
    emerald: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    red: 'from-red-500 to-red-600',
    violet: 'from-violet-500 to-violet-600',
  };
  return (
    <div className="relative overflow-hidden bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md transition-shadow">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accentMap[accent] || accentMap.indigo}`} />
      <div className="flex items-start justify-between mb-2">
        <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800">{icon}</div>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{value}</div>
      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_BADGE[estado] || ESTADO_BADGE.inactivo;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {estado.charAt(0).toUpperCase() + estado.slice(1).replace('_', ' ')}
    </span>
  );
}

function SkeletonPulse() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
      </div>
    </div>
  );
}

// ─── Worker Detail Modal ─────────────────────────────────────────────────────

function WorkerDetailModal({
  worker,
  teamAvg,
  onClose,
  navigate,
}: {
  worker: WorkerPerformanceData;
  teamAvg: TeamSummaryData;
  onClose: () => void;
  navigate: (path: string) => void;
}) {
  const [tab, setTab] = useState<'kpis' | 'cartera' | 'radar'>('kpis');

  const radarData = [
    { metric: 'Ventas', value: worker.ventasCerradas, avg: teamAvg.ventasEquipo / Math.max(teamAvg.totalComerciales, 1) },
    { metric: 'Conversión', value: worker.ratioConversion, avg: teamAvg.ratioConversionEquipo },
    { metric: 'Ticket medio', value: worker.ticketMedio / 1000, avg: teamAvg.ticketMedioEquipo / 1000 },
    { metric: 'Comisiones', value: worker.comisionesGeneradas / 1000, avg: teamAvg.comisionesTotales / Math.max(teamAvg.totalComerciales, 1) / 1000 },
    { metric: 'Velocidad', value: worker.tiempoMedioCierreDias > 0 ? Math.max(0, 30 - worker.tiempoMedioCierreDias) : 0, avg: teamAvg.tiempoMedioCierreEquipo > 0 ? Math.max(0, 30 - teamAvg.tiempoMedioCierreEquipo) : 0 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="relative p-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              {worker.avatar}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{worker.nombre}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">{worker.rol}</span>
                <EstadoBadge estado={worker.estado} />
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                {worker.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{worker.email}</span>}
                {worker.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{worker.telefono}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 px-6">
          {([
            { id: 'kpis' as const, label: 'KPIs' },
            { id: 'cartera' as const, label: 'Cartera' },
            { id: 'radar' as const, label: 'Comparativa' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {tab === 'kpis' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <KPICard icon={<TrendingUp className="w-4 h-4 text-indigo-500" />} label="Ventas cerradas" value={fmtNum(worker.ventasCerradas)} trend={worker.tendenciaVentas} />
              <KPICard icon={<Euro className="w-4 h-4 text-emerald-500" />} label="Ingresos" value={fmtEur(worker.ingresosTotales)} trend={worker.tendenciaIngresos} accent="emerald" />
              <KPICard icon={<Target className="w-4 h-4 text-cyan-500" />} label="Conversión" value={fmtPct(worker.ratioConversion)} trend={worker.tendenciaConversion} accent="cyan" />
              <KPICard icon={<Award className="w-4 h-4 text-amber-500" />} label="Comisiones" value={fmtEur(worker.comisionesGeneradas)} sub={`${fmtEur(worker.comisionesPendientes)} pendientes`} accent="amber" />
              <KPICard icon={<Clock className="w-4 h-4 text-violet-500" />} label="T. medio cierre" value={`${worker.tiempoMedioCierreDias}d`} accent="violet" />
              <KPICard icon={<ClipboardList className="w-4 h-4 text-red-500" />} label="Tareas pend." value={fmtNum(worker.tareasPendientes)} sub={`${worker.leadsSinGestionar} leads sin gestionar`} accent="red" />
            </div>
          )}

          {tab === 'cartera' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Leads asignados</h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30">
                    <div className="text-lg font-bold text-blue-600">{worker.leadsAsignados}</div>
                    <div className="text-[10px] text-blue-500">Total</div>
                  </div>
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30">
                    <div className="text-lg font-bold text-red-600">{worker.leadsSinGestionar}</div>
                    <div className="text-[10px] text-red-500">Sin gestionar</div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                    <div className="text-lg font-bold text-emerald-600">{worker.leadsConvertidos}</div>
                    <div className="text-[10px] text-emerald-500">Convertidos</div>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Operaciones</h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30">
                    <div className="text-lg font-bold text-indigo-600">{worker.reservasActivas}</div>
                    <div className="text-[10px] text-indigo-500">Reservas</div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30">
                    <div className="text-lg font-bold text-amber-600">{worker.entregasPendientes}</div>
                    <div className="text-[10px] text-amber-500">Entregas pend.</div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                    <div className="text-lg font-bold text-emerald-600">{worker.entregasRealizadas}</div>
                    <div className="text-[10px] text-emerald-500">Entregados</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'radar' && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 text-center">Comparativa vs media del equipo</p>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar name={worker.nombre} dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                  <Radar name="Media equipo" dataKey="avg" stroke="#d1d5db" fill="#d1d5db" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 4" />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="px-6 pb-6 flex flex-wrap gap-2">
          <button onClick={() => navigate('/saas/crm/clientes?tab=leads')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
            <UserPlus className="w-3.5 h-3.5" /> CRM
          </button>
          <button onClick={() => navigate(COMPRAVENTA_VENTAS_PATH)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
            <Receipt className="w-3.5 h-3.5" /> Ventas
          </button>
          <button onClick={() => navigate(COMPRAVENTA_ENTREGAS_PATH)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
            <Truck className="w-3.5 h-3.5" /> Entregas
          </button>
          <button onClick={() => navigate('/saas/commissions')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
            <Award className="w-3.5 h-3.5" /> Comisiones
          </button>
          <button onClick={() => navigate(`/saas/team/${worker.workerId}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Perfil equipo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Resumen (Manager) ──────────────────────────────────────────────────

function ManagerResumen({
  workers,
  summary,
  alerts,
  onSelectWorker,
}: {
  workers: WorkerPerformanceData[];
  summary: TeamSummaryData;
  alerts: WorkerAlert[];
  onSelectWorker: (w: WorkerPerformanceData) => void;
}) {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon={<TrendingUp className="w-4 h-4 text-indigo-500" />} label="Ventas equipo" value={fmtEur(summary.ingresosTotales)} sub={`${summary.ventasEquipo} operaciones`} />
        <KPICard icon={<UserPlus className="w-4 h-4 text-cyan-500" />} label="Leads activos" value={fmtNum(summary.leadsTotal)} sub={summary.leadsSinGestionar > 0 ? `${summary.leadsSinGestionar} sin gestionar` : 'Todos gestionados'} accent="cyan" />
        <KPICard icon={<Target className="w-4 h-4 text-emerald-500" />} label="Conversión equipo" value={fmtPct(summary.ratioConversionEquipo)} accent="emerald" />
        <KPICard icon={<Receipt className="w-4 h-4 text-amber-500" />} label="Ticket medio" value={fmtEur(summary.ticketMedioEquipo)} accent="amber" />
        <KPICard icon={<Clock className="w-4 h-4 text-violet-500" />} label="T. medio cierre" value={`${summary.tiempoMedioCierreEquipo}d`} accent="violet" />
        <KPICard icon={<Euro className="w-4 h-4 text-red-500" />} label="Comisiones" value={fmtEur(summary.comisionesTotales)} accent="red" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking by revenue */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Ranking por ingresos</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, workers.length * 48)}>
            <BarChart data={workers.slice(0, 8)} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtEur(v)} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11, fill: '#6b7280' }} width={95} />
              <Tooltip formatter={(v: number) => fmtEur(v)} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="ingresosTotales" name="Ingresos" radius={[0, 6, 6, 0]} barSize={24}>
                {workers.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Team radar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Comparativa del equipo</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart
              data={[
                { metric: 'Ventas', ...Object.fromEntries(workers.slice(0, 5).map((w) => [w.nombre, w.ventasCerradas])) },
                { metric: 'Conversión', ...Object.fromEntries(workers.slice(0, 5).map((w) => [w.nombre, w.ratioConversion])) },
                { metric: 'Ticket (k€)', ...Object.fromEntries(workers.slice(0, 5).map((w) => [w.nombre, w.ticketMedio / 1000])) },
                { metric: 'Comisiones (k€)', ...Object.fromEntries(workers.slice(0, 5).map((w) => [w.nombre, w.comisionesGeneradas / 1000])) },
                { metric: 'Velocidad', ...Object.fromEntries(workers.slice(0, 5).map((w) => [w.nombre, Math.max(0, 30 - w.tiempoMedioCierreDias)])) },
              ]}
            >
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <PolarRadiusAxis tick={false} axisLine={false} />
              {workers.slice(0, 5).map((w, i) => (
                <Radar key={w.workerId} name={w.nombre} dataKey={w.nombre} stroke={CHART_COLORS[i]} fill={CHART_COLORS[i]} fillOpacity={0.1} strokeWidth={2} />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ranking table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Detalle por comercial</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Comercial</th>
                <th className="text-right px-4 py-3">Ventas</th>
                <th className="text-right px-4 py-3">Ingresos</th>
                <th className="text-right px-4 py-3">Leads</th>
                <th className="text-right px-4 py-3">Conversión</th>
                <th className="text-right px-4 py-3">T. cierre</th>
                <th className="text-right px-4 py-3">Comisiones</th>
                <th className="text-right px-4 py-3">Entregas pend.</th>
                <th className="text-center px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w, i) => (
                <tr
                  key={w.workerId}
                  className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                  onClick={() => onSelectWorker(w)}
                >
                  <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                        {w.avatar}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{w.nombre}</div>
                        <div className="text-[10px] text-gray-400">{w.rol}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-white">{w.ventasCerradas}</td>
                  <td className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-white">{fmtEur(w.ingresosTotales)}</td>
                  <td className="text-right px-4 py-3">
                    <span className="text-gray-900 dark:text-white">{w.leadsAsignados}</span>
                    {w.leadsSinGestionar > 0 && (
                      <span className="ml-1 text-red-500 font-semibold">({w.leadsSinGestionar})</span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-12 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(100, w.ratioConversion)}%` }}
                        />
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">{fmtPct(w.ratioConversion)}</span>
                    </div>
                  </td>
                  <td className="text-right px-4 py-3 text-gray-600 dark:text-gray-300">{w.tiempoMedioCierreDias}d</td>
                  <td className="text-right px-4 py-3 font-semibold text-gray-900 dark:text-white">{fmtEur(w.comisionesGeneradas)}</td>
                  <td className="text-right px-4 py-3">
                    {w.entregasPendientes > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold text-[10px]">
                        {w.entregasPendientes}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-3"><EstadoBadge estado={w.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Resumen (Worker) ───────────────────────────────────────────────────

function WorkerResumen({
  worker,
  navigate,
}: {
  worker: WorkerPerformanceData | null;
  navigate: (path: string) => void;
}) {
  if (!worker) return <div className="text-center py-12 text-gray-400">No se encontraron tus datos de rendimiento.</div>;

  const connections = [
    { label: 'Mi CRM', icon: <UserPlus className="w-4 h-4" />, route: '/saas/crm/clientes?tab=leads', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
    { label: 'Mis ventas', icon: <Receipt className="w-4 h-4" />, route: COMPRAVENTA_VENTAS_PATH, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Mis entregas', icon: <Truck className="w-4 h-4" />, route: COMPRAVENTA_ENTREGAS_PATH, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Comisiones', icon: <Award className="w-4 h-4" />, route: '/saas/commissions', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Vehículos', icon: <Car className="w-4 h-4" />, route: '/saas/vehicles', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" />, route: '/saas/dashboard', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Fichar', icon: <Clock className="w-4 h-4" />, route: '/saas/worker/clock', color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/40' },
  ];

  return (
    <div className="space-y-6">
      {/* Personal header */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnYtMmg0djJoLTJ2NGgtMnptMC0xNGgydi0yaDR2MmgtMnY0aC0ydi00em0tMTQgMGgydi0yaDR2MmgtMnY0aC0ydi00em0wIDE0aDJ2LTRoMnYtMmg0djJoLTJ2NGgtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
        <div className="relative flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-2xl font-bold shadow-lg">
            {worker.avatar}
          </div>
          <div>
            <h2 className="text-xl font-bold">Hola, {worker.nombre.split(' ')[0]}</h2>
            <p className="text-white/70 text-sm">{worker.rol}</p>
            <EstadoBadge estado={worker.estado} />
          </div>
        </div>
      </div>

      {/* Personal KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard icon={<TrendingUp className="w-4 h-4 text-indigo-500" />} label="Mis ventas" value={fmtNum(worker.ventasCerradas)} trend={worker.tendenciaVentas} sub={fmtEur(worker.ingresosTotales)} />
        <KPICard icon={<Target className="w-4 h-4 text-emerald-500" />} label="Mi conversión" value={fmtPct(worker.ratioConversion)} trend={worker.tendenciaConversion} accent="emerald" />
        <KPICard icon={<Award className="w-4 h-4 text-amber-500" />} label="Mis comisiones" value={fmtEur(worker.comisionesGeneradas)} sub={`${fmtEur(worker.comisionesPendientes)} pendientes`} accent="amber" />
        <KPICard icon={<Clock className="w-4 h-4 text-violet-500" />} label="Horas trabajadas" value={`${worker.horasTrabajadas}h`} sub={`${worker.diasTrabajados} días`} accent="violet" />
      </div>

      {/* My portfolio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leads */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-500" /> Mis leads
            </h3>
            <button onClick={() => navigate('/saas/crm/clientes?tab=leads')} className="text-[11px] text-indigo-500 font-semibold hover:underline flex items-center gap-1">
              Ver todos <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30">
              <div className="text-xl font-bold text-blue-600">{worker.leadsAsignados}</div>
              <div className="text-[10px] text-blue-500 font-medium">Asignados</div>
            </div>
            <div className={`p-3 rounded-xl ${worker.leadsSinGestionar > 0 ? 'bg-red-50 dark:bg-red-950/30 ring-1 ring-red-200 dark:ring-red-800' : 'bg-gray-50 dark:bg-gray-800'}`}>
              <div className={`text-xl font-bold ${worker.leadsSinGestionar > 0 ? 'text-red-600' : 'text-gray-400'}`}>{worker.leadsSinGestionar}</div>
              <div className={`text-[10px] font-medium ${worker.leadsSinGestionar > 0 ? 'text-red-500' : 'text-gray-400'}`}>Sin gestionar</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
              <div className="text-xl font-bold text-emerald-600">{worker.leadsConvertidos}</div>
              <div className="text-[10px] text-emerald-500 font-medium">Convertidos</div>
            </div>
          </div>
        </div>

        {/* Operations */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Car className="w-4 h-4 text-emerald-500" /> Mis operaciones
            </h3>
            <button onClick={() => navigate(COMPRAVENTA_VENTAS_PATH)} className="text-[11px] text-indigo-500 font-semibold hover:underline flex items-center gap-1">
              Ver todas <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30">
              <div className="text-xl font-bold text-indigo-600">{worker.reservasActivas}</div>
              <div className="text-[10px] text-indigo-500 font-medium">Reservas</div>
            </div>
            <div className={`p-3 rounded-xl ${worker.entregasPendientes > 0 ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800' : 'bg-gray-50 dark:bg-gray-800'}`}>
              <div className={`text-xl font-bold ${worker.entregasPendientes > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{worker.entregasPendientes}</div>
              <div className={`text-[10px] font-medium ${worker.entregasPendientes > 0 ? 'text-amber-500' : 'text-gray-400'}`}>Entregas pend.</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
              <div className="text-xl font-bold text-emerald-600">{worker.entregasRealizadas}</div>
              <div className="text-[10px] text-emerald-500 font-medium">Entregados</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending tasks */}
      {worker.tareasPendientes > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" /> Actividad pendiente
          </h3>
          <div className="flex flex-wrap gap-3 text-xs">
            {worker.leadsSinGestionar > 0 && (
              <button onClick={() => navigate('/saas/crm/clientes?tab=leads')} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-900 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-50 transition-colors">
                <UserPlus className="w-3.5 h-3.5" /> {worker.leadsSinGestionar} leads sin contactar
              </button>
            )}
            {worker.entregasPendientes > 0 && (
              <button onClick={() => navigate(COMPRAVENTA_ENTREGAS_PATH)} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-900 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-50 transition-colors">
                <Truck className="w-3.5 h-3.5" /> {worker.entregasPendientes} entregas por realizar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick connections */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {connections.map((c) => (
          <button
            key={c.label}
            onClick={() => navigate(c.route)}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl ${c.bg} ${c.color} hover:scale-[1.02] active:scale-[0.98] transition-all`}
          >
            {c.icon}
            <span className="text-[10px] font-semibold">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Equipo (Manager only) ──────────────────────────────────────────────

function EquipoTab({
  workers,
  search,
  setSearch,
  filterEstado,
  setFilterEstado,
  onSelectWorker,
}: {
  workers: WorkerPerformanceData[];
  search: string;
  setSearch: (s: string) => void;
  filterEstado: string;
  setFilterEstado: (s: string) => void;
  onSelectWorker: (w: WorkerPerformanceData) => void;
}) {
  const filtered = useMemo(() => {
    return workers.filter((w) => {
      if (search) {
        const q = search.toLowerCase();
        if (!w.nombre.toLowerCase().includes(q) && !w.rol.toLowerCase().includes(q) && !w.email.toLowerCase().includes(q)) return false;
      }
      if (filterEstado !== 'todos' && w.estado !== filterEstado) return false;
      return true;
    });
  }, [workers, search, filterEstado]);

  const counts = useMemo(() => {
    const c = { fichado: 0, activo: 0, descanso: 0, inactivo: 0 };
    workers.forEach((w) => { if (c[w.estado as keyof typeof c] !== undefined) c[w.estado as keyof typeof c]++; });
    return c;
  }, [workers]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar comercial..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {['todos', 'fichado', 'activo', 'descanso', 'inactivo'].map((e) => (
            <button
              key={e}
              onClick={() => setFilterEstado(e)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                filterEstado === e
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {e === 'todos' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([estado, count]) => {
          const cfg = ESTADO_BADGE[estado];
          return (
            <span key={estado} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {count} {estado}
            </span>
          );
        })}
      </div>

      {/* Worker grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((w) => {
          const maxIngresos = Math.max(...workers.map((x) => x.ingresosTotales), 1);
          const progressPct = Math.round((w.ingresosTotales / maxIngresos) * 100);
          const hasAlerts = w.leadsSinGestionar > 0 || w.entregasPendientes > 3;

          return (
            <div
              key={w.workerId}
              onClick={() => onSelectWorker(w)}
              className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer transition-all group"
            >
              {hasAlerts && (
                <div className="absolute top-3 right-3">
                  <span className="flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {w.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">{w.nombre}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{w.rol}</span>
                    <EstadoBadge estado={w.estado} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">{w.ventasCerradas}</div>
                  <div className="text-[9px] text-gray-400">Ventas</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">{fmtPct(w.ratioConversion)}</div>
                  <div className="text-[9px] text-gray-400">Conv.</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">{w.leadsAsignados}</div>
                  <div className="text-[9px] text-gray-400">Leads</div>
                </div>
                <div>
                  <div className={`text-sm font-bold ${w.leadsSinGestionar > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                    {w.leadsSinGestionar}
                  </div>
                  <div className="text-[9px] text-gray-400">Pend.</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-gray-500">{fmtEur(w.ingresosTotales)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No se encontraron comerciales</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Rendimiento ────────────────────────────────────────────────────────

function RendimientoTab({
  workers,
  summary,
  isManager,
  currentWorker,
}: {
  workers: WorkerPerformanceData[];
  summary: TeamSummaryData;
  isManager: boolean;
  currentWorker: WorkerPerformanceData | null;
}) {
  const displayWorkers = isManager ? workers : currentWorker ? [currentWorker] : [];

  const funnelData = useMemo(() => {
    return displayWorkers.map((w) => ({
      nombre: w.nombre,
      nuevos: w.leadsAsignados - w.leadsConvertidos - w.leadsSinGestionar,
      sinGestionar: w.leadsSinGestionar,
      convertidos: w.leadsConvertidos,
    }));
  }, [displayWorkers]);

  const ratioData = useMemo(() => {
    return displayWorkers.map((w) => ({
      nombre: w.nombre,
      ventasPorHora: w.ventasPorHora,
      comisionPorVenta: w.ventasCerradas > 0 ? Math.round(w.comisionesGeneradas / w.ventasCerradas) : 0,
      leadsNecesarios: w.leadsConvertidos > 0 ? Math.round(w.leadsAsignados / w.leadsConvertidos * 10) / 10 : 0,
    }));
  }, [displayWorkers]);

  return (
    <div className="space-y-6">
      {/* Funnel by commercial */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
          {isManager ? 'Embudo por comercial' : 'Mi embudo de leads'}
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(200, displayWorkers.length * 48)}>
          <BarChart data={funnelData} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11, fill: '#6b7280' }} width={95} />
            <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #e5e7eb' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="convertidos" name="Convertidos" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} barSize={20} />
            <Bar dataKey="nuevos" name="En gestión" stackId="a" fill="#6366f1" barSize={20} />
            <Bar dataKey="sinGestionar" name="Sin gestionar" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Operative ratios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Ratios operativos</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <th className="text-left py-2 px-3">Comercial</th>
                  <th className="text-right py-2 px-3">Ventas/h</th>
                  <th className="text-right py-2 px-3">€ comisión/venta</th>
                  <th className="text-right py-2 px-3">Leads/venta</th>
                </tr>
              </thead>
              <tbody>
                {ratioData.map((r) => (
                  <tr key={r.nombre} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white">{r.nombre}</td>
                    <td className="text-right py-2 px-3 text-gray-600 dark:text-gray-300">{r.ventasPorHora}</td>
                    <td className="text-right py-2 px-3 text-gray-600 dark:text-gray-300">{fmtEur(r.comisionPorVenta)}</td>
                    <td className="text-right py-2 px-3 text-gray-600 dark:text-gray-300">{r.leadsNecesarios}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Conversion comparison */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Conversión por comercial</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={displayWorkers.slice(0, 8).map((w) => ({ nombre: w.nombre, actual: w.ratioConversion }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="nombre" tick={{ fontSize: 9, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="actual" name="Conversión" radius={[6, 6, 0, 0]} barSize={28}>
                {displayWorkers.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed metrics table (manager) */}
      {isManager && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Métricas completas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <th className="text-left px-4 py-3">Comercial</th>
                  <th className="text-right px-3 py-3">Ventas</th>
                  <th className="text-right px-3 py-3">Ingresos</th>
                  <th className="text-right px-3 py-3">Margen</th>
                  <th className="text-right px-3 py-3">Ticket</th>
                  <th className="text-right px-3 py-3">Leads</th>
                  <th className="text-right px-3 py-3">Conv.</th>
                  <th className="text-right px-3 py-3">T. cierre</th>
                  <th className="text-right px-3 py-3">Comisiones</th>
                  <th className="text-right px-3 py-3">Horas</th>
                  <th className="text-right px-3 py-3">Ventas/h</th>
                  <th className="text-right px-3 py-3">Reservas</th>
                  <th className="text-right px-3 py-3">Entregas</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.workerId} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{w.nombre}</td>
                    <td className="text-right px-3 py-2.5">{w.ventasCerradas}</td>
                    <td className="text-right px-3 py-2.5 font-semibold">{fmtEur(w.ingresosTotales)}</td>
                    <td className="text-right px-3 py-2.5">{fmtEur(w.margenTotal)}</td>
                    <td className="text-right px-3 py-2.5">{fmtEur(w.ticketMedio)}</td>
                    <td className="text-right px-3 py-2.5">{w.leadsAsignados}</td>
                    <td className="text-right px-3 py-2.5">{fmtPct(w.ratioConversion)}</td>
                    <td className="text-right px-3 py-2.5">{w.tiempoMedioCierreDias}d</td>
                    <td className="text-right px-3 py-2.5">{fmtEur(w.comisionesGeneradas)}</td>
                    <td className="text-right px-3 py-2.5">{w.horasTrabajadas}h</td>
                    <td className="text-right px-3 py-2.5">{w.ventasPorHora}</td>
                    <td className="text-right px-3 py-2.5">{w.reservasActivas}</td>
                    <td className="text-right px-3 py-2.5">{w.entregasPendientes + w.entregasRealizadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Alertas ────────────────────────────────────────────────────────────

function AlertasTab({
  alerts,
  navigate,
  isManager,
  currentWorkerId,
}: {
  alerts: WorkerAlert[];
  navigate: (path: string) => void;
  isManager: boolean;
  currentWorkerId: string;
}) {
  const visibleAlerts = isManager
    ? alerts
    : alerts.filter((a) => a.workerId === currentWorkerId);

  const groupedBySeverity = useMemo(() => {
    const groups: Record<string, WorkerAlert[]> = { critical: [], warning: [], info: [] };
    visibleAlerts.forEach((a) => {
      (groups[a.severity] || groups.info).push(a);
    });
    return groups;
  }, [visibleAlerts]);

  const severityLabels = { critical: 'Críticas', warning: 'Advertencias', info: 'Informativas' };

  if (visibleAlerts.length === 0) {
    return (
      <div className="text-center py-16">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Sin alertas</h3>
        <p className="text-xs text-gray-400">Todo en orden con {isManager ? 'el equipo' : 'tu actividad'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Severity counters */}
      <div className="flex gap-3">
        {(['critical', 'warning', 'info'] as const).map((sev) => {
          const count = groupedBySeverity[sev]?.length || 0;
          if (count === 0) return null;
          const cfg = SEVERITY_CONFIG[sev];
          return (
            <span key={sev} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cfg.badge}`}>
              {cfg.icon} {count} {severityLabels[sev].toLowerCase()}
            </span>
          );
        })}
      </div>

      {/* Alert cards grouped */}
      {(['critical', 'warning', 'info'] as const).map((sev) => {
        const items = groupedBySeverity[sev];
        if (!items?.length) return null;
        const cfg = SEVERITY_CONFIG[sev];

        return (
          <div key={sev}>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${cfg.text}`}>
              {severityLabels[sev]}
            </h3>
            <div className="space-y-2">
              {items.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg} ${cfg.border}`}
                >
                  <div className="mt-0.5">{cfg.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold ${cfg.text}`}>{alert.workerName}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{alert.mensaje}</div>
                  </div>
                  {alert.ruta && (
                    <button
                      onClick={() => navigate(alert.ruta)}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Ver <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export function DealershipWorkers() {
  const navigate = useNavigate();
  const { authUser } = useAuth();
  const { currentBusiness } = useBusiness();

  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const [period, setPeriod] = useState<PeriodPreset>('30d');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [selectedWorker, setSelectedWorker] = useState<WorkerPerformanceData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [workers, setWorkers] = useState<WorkerPerformanceData[]>([]);
  const [summary, setSummary] = useState<TeamSummaryData | null>(null);
  const [alerts, setAlerts] = useState<WorkerAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = authUser?.user_id;
  const userRole = authUser?.role || '';
  const isManager = ADMIN_ROLES.has(userRole);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case '7d': return { from: format(subDays(now, 7), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
      case '30d': return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
      case '90d': return { from: format(subDays(now, 90), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
      case 'year': return { from: `${now.getFullYear()}-01-01`, to: format(now, 'yyyy-MM-dd') };
      default: return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
    }
  }, [period]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWorkerPerformance(userId, {
        from: dateRange.from,
        to: dateRange.to,
        businessId: currentBusiness?.business_id,
      });
      setWorkers(data.workers);
      setSummary(data.teamSummary);
      setAlerts(data.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [userId, dateRange, currentBusiness?.business_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(loadData, 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => setTimeout(() => setRefreshing(false), 500));
  }, [loadData]);

  const currentWorker = useMemo(() => {
    return workers.find((w) => w.workerId === userId) || null;
  }, [workers, userId]);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

  const TABS: { id: TabId; label: string; badge?: number; managerOnly?: boolean }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'equipo', label: 'Equipo', badge: workers.length, managerOnly: true },
    { id: 'rendimiento', label: 'Rendimiento' },
    { id: 'alertas', label: 'Alertas', badge: alerts.length },
  ];

  return (
    <Layout title="Rendimiento comercial" subtitle="Compraventa — Equipo y operativa">
      <div className="flex flex-col gap-4">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Period selector */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              {(['7d', '30d', '90d', 'year'] as PeriodPreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    period === p
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>

            {/* Role badge */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
              isManager ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
            }`}>
              {isManager ? <Shield className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
              {isManager ? 'Gerente' : 'Comercial'}
            </span>

            {criticalCount > 0 && (
              <button
                onClick={() => setActiveTab('alertas')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 dark:bg-red-950/40 rounded-lg text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors animate-pulse"
              >
                <CircleAlert className="w-3.5 h-3.5" /> {criticalCount} alerta{criticalCount > 1 ? 's' : ''}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className="flex h-2 w-2"><span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
              En vivo
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 -mx-1">
          {TABS.filter((t) => !t.managerOnly || isManager).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors mx-1 ${
                activeTab === t.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                  t.id === 'alertas' && criticalCount > 0
                    ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {loading ? (
          <SkeletonPulse />
        ) : error ? (
          <div className="text-center py-12">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Error cargando datos</h3>
            <p className="text-xs text-gray-400 mb-4">{error}</p>
            <button onClick={handleRefresh} className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-xs font-semibold hover:bg-indigo-600 transition-colors">
              Reintentar
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'resumen' && (
              isManager ? (
                <ManagerResumen workers={workers} summary={summary!} alerts={alerts} onSelectWorker={setSelectedWorker} />
              ) : (
                <WorkerResumen worker={currentWorker} navigate={navigate} />
              )
            )}
            {activeTab === 'equipo' && isManager && (
              <EquipoTab
                workers={workers}
                search={search}
                setSearch={setSearch}
                filterEstado={filterEstado}
                setFilterEstado={setFilterEstado}
                onSelectWorker={setSelectedWorker}
              />
            )}
            {activeTab === 'rendimiento' && (
              <RendimientoTab workers={workers} summary={summary!} isManager={isManager} currentWorker={currentWorker} />
            )}
            {activeTab === 'alertas' && (
              <AlertasTab alerts={alerts} navigate={navigate} isManager={isManager} currentWorkerId={userId || ''} />
            )}
          </>
        )}

        {/* ── Worker detail modal ── */}
        {selectedWorker && summary && (
          <WorkerDetailModal
            worker={selectedWorker}
            teamAvg={summary}
            onClose={() => setSelectedWorker(null)}
            navigate={navigate}
          />
        )}
      </div>
    </Layout>
  );
}
