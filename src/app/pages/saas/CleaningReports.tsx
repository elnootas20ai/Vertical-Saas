import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  fetchCleaningOverview,
  fetchClientProfitability,
  fetchWorkerProfitability,
  fetchServicesSummary,
  fetchAbsenteeism,
  fetchIncidentsSummary,
  fetchMaterialsCost,
  fetchBilling,
  fetchComparatives,
} from '../../lib/cleaningReportsApi';
import type {
  ReportFilters,
  CleaningOverview,
  ClientProfitabilityItem,
  WorkerProfitabilityItem,
  ServicesSummaryResponse,
  AbsenteeismResponse,
  IncidentsSummaryResponse,
  MaterialsCostResponse,
  BillingResponse,
  ComparativesResponse,
} from '../../lib/cleaningReportsApi';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Area,
} from 'recharts';
import {
  Download, TrendingUp, TrendingDown, Users, Euro, Filter, RefreshCw,
  Clock, AlertTriangle, ArrowUpRight, ArrowDownRight, BarChart2,
  Target, Activity, Layers, ChevronDown, ChevronUp, Percent, MapPin,
  Briefcase, CalendarDays, Package, FileText, Zap, Star, ExternalLink,
} from 'lucide-react';
import { format, subMonths, subDays, subWeeks } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────────────────

type ReportTab = 'resumen' | 'clientes' | 'servicios' | 'trabajadores' | 'absentismo' | 'incidencias' | 'materiales' | 'facturacion' | 'comparativas';
type DatePreset = '7d' | '30d' | '90d' | '6m' | '1y' | 'custom';

const ADMIN_ROLES = ['Admin', 'Gerente', 'admin', 'gerente', 'owner'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatEur(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

function pctStr(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`; }

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const SEV_COLORS: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6' };
const STATUS_COLORS: Record<string, string> = { completed: '#10b981', cancelled: '#ef4444', pending: '#f59e0b', assigned: '#3b82f6', in_progress: '#8b5cf6' };

// ─── Sub-components ─────────────────────────────────────────────────────────

function KPICard({ title, value, sub, icon, color, trend }: {
  title: string; value: string; sub: string; icon: React.ReactNode; color: string;
  trend?: { value: string; up: boolean } | null;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</span>
        <span className={`p-2 rounded-xl ${color}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend.up ? 'text-green-600' : 'text-red-500'}`}>
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function DataTable({ columns, rows, onRowClick }: {
  columns: { key: string; label: string; align?: 'left' | 'right' | 'center'; format?: (v: any, row: any) => React.ReactNode }[];
  rows: Record<string, any>[];
  onRowClick?: (row: Record<string, any>) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {columns.map(c => (
              <th key={c.key} className={`py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} onClick={() => onRowClick?.(row)} className={`border-b border-gray-100 dark:border-gray-700/50 ${onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30' : ''}`}>
              {columns.map(c => (
                <td key={c.key} className={`py-2.5 px-3 text-gray-700 dark:text-gray-300 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                  {c.format ? c.format(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="py-8 text-center text-gray-400 dark:text-gray-500">Sin datos para el período seleccionado</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MarginBadge({ value }: { value: number }) {
  const color = value >= 30 ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : value >= 15 ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' : 'text-red-600 bg-red-50 dark:bg-red-900/20';
  return <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{value.toFixed(1)}%</span>;
}

function TrendBadge({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <span className="text-green-600"><TrendingUp className="w-4 h-4" /></span>;
  if (trend === 'down') return <span className="text-red-500"><TrendingDown className="w-4 h-4" /></span>;
  return <span className="text-gray-400">—</span>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { completed: 'Completado', cancelled: 'Cancelado', pending: 'Pendiente', assigned: 'Asignado', in_progress: 'En curso' };
  const colors: Record<string, string> = {
    completed: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    cancelled: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    assigned: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
    in_progress: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>{labels[status] || status}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const labels: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[severity] || 'bg-gray-100 text-gray-700'}`}>{labels[severity] || severity}</span>;
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const nav = useNavigate();
  return (
    <button onClick={() => nav(to)} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium">
      {children}<ExternalLink className="w-3 h-3" />
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CleaningReports() {
  const { t } = useTranslation();
  const { authUser } = useAuth();
  const userId = authUser?.userId || authUser?._id || '';

  const isManager = useMemo(() => {
    if (!authUser) return false;
    if (ADMIN_ROLES.includes(authUser.role)) return true;
    const perms = authUser.teamPermissions || authUser.permissions || {};
    return perms.cleaning_reports === true || perms.cleaning_reports === 'full';
  }, [authUser]);

  const canViewFinancials = isManager;

  // ─── State ──────────────────────────────────────────────────────────────────

  const [tab, setTab] = useState<ReportTab>('resumen');
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [dateFrom, setDateFrom] = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [filterClient, setFilterClient] = useState('all');
  const [filterWorker, setFilterWorker] = useState('all');
  const [filterZone, setFilterZone] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [overview, setOverview] = useState<CleaningOverview | null>(null);
  const [clientProfit, setClientProfit] = useState<ClientProfitabilityItem[]>([]);
  const [workerProfit, setWorkerProfit] = useState<WorkerProfitabilityItem[]>([]);
  const [servicesSummary, setServicesSummary] = useState<ServicesSummaryResponse | null>(null);
  const [absenteeism, setAbsenteeism] = useState<AbsenteeismResponse | null>(null);
  const [incidents, setIncidents] = useState<IncidentsSummaryResponse | null>(null);
  const [materials, setMaterials] = useState<MaterialsCostResponse | null>(null);
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [comparatives, setComparatives] = useState<ComparativesResponse | null>(null);

  const filters: ReportFilters = useMemo(() => ({
    from: dateFrom, to: dateTo,
    clientId: filterClient !== 'all' ? filterClient : undefined,
    workerId: filterWorker !== 'all' ? filterWorker : undefined,
    zone: filterZone !== 'all' ? filterZone : undefined,
    cleaningType: filterType !== 'all' ? filterType : undefined,
  }), [dateFrom, dateTo, filterClient, filterWorker, filterZone, filterType]);

  const applyPreset = useCallback((p: DatePreset) => {
    setPreset(p);
    const now = new Date();
    switch (p) {
      case '7d': setDateFrom(format(subDays(now, 7), 'yyyy-MM-dd')); break;
      case '30d': setDateFrom(format(subMonths(now, 1), 'yyyy-MM-dd')); break;
      case '90d': setDateFrom(format(subMonths(now, 3), 'yyyy-MM-dd')); break;
      case '6m': setDateFrom(format(subMonths(now, 6), 'yyyy-MM-dd')); break;
      case '1y': setDateFrom(format(subMonths(now, 12), 'yyyy-MM-dd')); break;
      default: return;
    }
    setDateTo(format(now, 'yyyy-MM-dd'));
  }, []);

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const promises: Promise<void>[] = [];

      if (tab === 'resumen' || tab === 'clientes' || tab === 'trabajadores' || tab === 'facturacion') {
        promises.push(fetchCleaningOverview(userId, filters).then(d => setOverview(d)));
      }
      if (tab === 'resumen' || tab === 'clientes') {
        promises.push(fetchClientProfitability(userId, filters).then(d => setClientProfit(d.clients)));
      }
      if (tab === 'resumen' || tab === 'trabajadores') {
        promises.push(fetchWorkerProfitability(userId, filters).then(d => setWorkerProfit(d.workers)));
      }
      if (tab === 'resumen' || tab === 'servicios') {
        promises.push(fetchServicesSummary(userId, filters).then(d => setServicesSummary(d)));
      }
      if (tab === 'resumen' || tab === 'absentismo') {
        promises.push(fetchAbsenteeism(userId, filters).then(d => setAbsenteeism(d)));
      }
      if (tab === 'resumen' || tab === 'incidencias') {
        promises.push(fetchIncidentsSummary(userId, filters).then(d => setIncidents(d)));
      }
      if (tab === 'resumen' || tab === 'materiales') {
        promises.push(fetchMaterialsCost(userId, filters).then(d => setMaterials(d)));
      }
      if (tab === 'facturacion') {
        promises.push(fetchBilling(userId, filters).then(d => setBilling(d)));
      }
      if (tab === 'comparativas') {
        promises.push(fetchComparatives(userId, filters).then(d => setComparatives(d)));
      }

      await Promise.all(promises);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading cleaning reports:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, tab, filters]);

  useEffect(() => { loadData(); }, [loadData]);

  // SSE real-time refresh
  useEffect(() => {
    if (!userId) return;
    const base = (import.meta as any).env?.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
    const es = new EventSource(`${base}/api/events?userId=${encodeURIComponent(userId)}`);
    let debounceTimer: ReturnType<typeof setTimeout>;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (['cleaning_service', 'cleaning_incident', 'cleaning_worker', 'service_contract', 'clockin'].includes(data?.type)) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => loadData(), 3000);
        }
      } catch { /* ignore */ }
    };
    return () => { es.close(); clearTimeout(debounceTimer); };
  }, [userId, loadData]);

  // ─── Unique values for filters ────────────────────────────────────────────

  const clientOptions = useMemo(() => {
    const names = new Set<string>();
    clientProfit.forEach(c => names.add(c.clientName));
    return Array.from(names).sort();
  }, [clientProfit]);

  const workerOptions = useMemo(() => {
    const names = new Set<string>();
    workerProfit.forEach(w => names.add(w.workerName));
    return Array.from(names).sort();
  }, [workerProfit]);

  const zoneOptions = useMemo(() => {
    const zones = new Set<string>();
    clientProfit.forEach(c => { if (c.zone) zones.add(c.zone); });
    return Array.from(zones).sort();
  }, [clientProfit]);

  // ─── Tabs definition ─────────────────────────────────────────────────────

  const TABS: { id: ReportTab; label: string; icon: React.ReactNode; financial?: boolean }[] = [
    { id: 'resumen', label: 'Resumen', icon: <Activity className="w-4 h-4" /> },
    { id: 'clientes', label: 'Clientes', icon: <Users className="w-4 h-4" />, financial: true },
    { id: 'servicios', label: 'Servicios', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'trabajadores', label: 'Trabajadores', icon: <Users className="w-4 h-4" />, financial: true },
    { id: 'absentismo', label: 'Absentismo', icon: <Clock className="w-4 h-4" /> },
    { id: 'incidencias', label: 'Incidencias', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'materiales', label: 'Materiales', icon: <Package className="w-4 h-4" />, financial: true },
    { id: 'facturacion', label: 'Facturación', icon: <Euro className="w-4 h-4" />, financial: true },
    { id: 'comparativas', label: 'Comparativas', icon: <BarChart2 className="w-4 h-4" /> },
  ];

  const visibleTabs = TABS.filter(t => !t.financial || canViewFinancials);

  const PRESETS: { id: DatePreset; label: string }[] = [
    { id: '7d', label: '7d' }, { id: '30d', label: '30d' }, { id: '90d', label: '90d' },
    { id: '6m', label: '6m' }, { id: '1y', label: '1y' },
  ];

  // ─── Export ───────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    try {
      const { utils, writeFile } = await import('xlsx');
      const wb = utils.book_new();
      if (overview) {
        const sheet = utils.json_to_sheet([{
          'Clientes activos': overview.clients.activeCount,
          'Servicios completados': overview.services.completed,
          'Horas planificadas': overview.hours.planned,
          'Horas reales': overview.hours.real,
          'Ingresos': overview.financial.revenue,
          'Coste total': overview.financial.totalCost,
          'Margen bruto': overview.financial.grossMargin,
          'Margen %': overview.financial.grossMarginPercent,
        }]);
        utils.book_append_sheet(wb, sheet, 'Resumen');
      }
      if (clientProfit.length > 0) {
        utils.book_append_sheet(wb, utils.json_to_sheet(clientProfit), 'Clientes');
      }
      if (workerProfit.length > 0) {
        utils.book_append_sheet(wb, utils.json_to_sheet(workerProfit), 'Trabajadores');
      }
      writeFile(wb, `informes-limpieza-${dateFrom}-${dateTo}.xlsx`);
    } catch { /* xlsx not available */ }
  }, [overview, clientProfit, workerProfit, dateFrom, dateTo]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Layout title="Informes y Rentabilidad" subtitle="Análisis integral del negocio de limpieza">
      <div className="space-y-4">
        {/* Header: Period + Filters + Export */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => applyPreset(p.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${preset === p.id ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('custom'); }}
                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs" />
              <span className="text-gray-400">—</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('custom'); }}
                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs" />
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
              <Filter className="w-3.5 h-3.5" /> Filtros {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <div className="flex-1" />
            <button onClick={() => loadData()} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Actualizar">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canViewFinancials && (
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>
            )}
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                <option value="all">Todos los clientes</option>
                {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterWorker} onChange={e => setFilterWorker(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                <option value="all">Todos los trabajadores</option>
                {workerOptions.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                <option value="all">Todas las zonas</option>
                {zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                <option value="all">Todos los tipos</option>
                <option value="general">General</option>
                <option value="deep">Profunda</option>
                <option value="office">Oficina</option>
                <option value="industrial">Industrial</option>
                <option value="cristales">Cristales</option>
              </select>
              {(filterClient !== 'all' || filterWorker !== 'all' || filterZone !== 'all' || filterType !== 'all') && (
                <button onClick={() => { setFilterClient('all'); setFilterWorker('all'); setFilterZone('all'); setFilterType('all'); }}
                  className="text-xs text-red-500 hover:text-red-600 font-medium">Limpiar filtros</button>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {visibleTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Last updated */}
        {lastUpdated && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Actualizado: {format(lastUpdated, 'HH:mm:ss')}
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        )}

        {/* ─── Tab: Resumen ──────────────────────────────────────── */}
        {!loading && tab === 'resumen' && overview && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KPICard title="Clientes activos" value={String(overview.clients.activeCount)} sub={`${overview.clients.totalContracts} contratos`} icon={<Users className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/20" />
              <KPICard title="Servicios" value={String(overview.services.completed)} sub={`${overview.services.completionRate}% completados`} icon={<Briefcase className="w-4 h-4 text-green-600" />} color="bg-green-50 dark:bg-green-900/20" />
              <KPICard title="Horas reales" value={`${overview.hours.real}h`} sub={`${overview.hours.deviation >= 0 ? '+' : ''}${overview.hours.deviation}h desv.`} icon={<Clock className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/20"
                trend={overview.hours.deviationPercent !== 0 ? { value: `${Math.abs(overview.hours.deviationPercent)}%`, up: overview.hours.deviationPercent < 0 } : null} />
              {canViewFinancials && (
                <>
                  <KPICard title="Ingresos" value={formatEur(overview.financial.revenue)} sub={`${formatEur(overview.financial.totalCost)} costes`} icon={<Euro className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/20" />
                  <KPICard title="Margen bruto" value={formatEur(overview.financial.grossMargin)} sub={`${overview.financial.grossMarginPercent}%`} icon={<Target className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/20"
                    trend={{ value: `${overview.financial.grossMarginPercent}%`, up: overview.financial.grossMarginPercent > 20 }} />
                </>
              )}
              <KPICard title="Incidencias" value={String(overview.operational.incidentCount)} sub={`${overview.operational.incidentRate}% tasa`} icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/20" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {servicesSummary && servicesSummary.byDate.length > 0 && (
                <ChartCard title="Servicios por día">
                  <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={servicesSummary.byDate}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="count" name="Servicios" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Line dataKey="real" name="Horas reales" stroke="#10b981" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {canViewFinancials && clientProfit.length > 0 && (
                <ChartCard title="Top clientes por rentabilidad">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={clientProfit.slice(0, 8)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                      <YAxis dataKey="clientName" type="category" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => formatEur(v)} />
                      <Bar dataKey="revenue" name="Ingresos" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="totalCost" name="Costes" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {workerProfit.length > 0 && (
                <ChartCard title="Ranking trabajadores">
                  <div className="space-y-2">
                    {workerProfit.slice(0, 5).map((w, i) => (
                      <div key={w.workerName} className="flex items-center gap-3">
                        <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{w.workerName}</p>
                          <p className="text-xs text-gray-500">{w.servicesCompleted} servicios · {w.hoursReal}h</p>
                        </div>
                        {canViewFinancials && <MarginBadge value={w.profitabilityPercent} />}
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )}

              {absenteeism && (
                <ChartCard title="Absentismo">
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-gray-900 dark:text-white">{absenteeism.absenteeismRate}%</span>
                      <span className="text-xs text-gray-500">tasa de ausencias</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-red-600">{absenteeism.totalAbsences}</p>
                        <p className="text-xs text-red-500">Ausencias</p>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-yellow-600">{absenteeism.totalLateArrivals}</p>
                        <p className="text-xs text-yellow-500">Retrasos</p>
                      </div>
                    </div>
                  </div>
                </ChartCard>
              )}

              {incidents && (
                <ChartCard title="Incidencias">
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-gray-900 dark:text-white">{incidents.totalIncidents}</span>
                      <span className="text-xs text-gray-500">total</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-green-600">{incidents.resolved}</p>
                        <p className="text-xs text-green-500">Resueltas</p>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-red-600">{incidents.unresolved}</p>
                        <p className="text-xs text-red-500">Pendientes</p>
                      </div>
                    </div>
                    {incidents.avgResolutionMinutes > 0 && (
                      <p className="text-xs text-gray-500">Resolución media: {incidents.avgResolutionMinutes} min</p>
                    )}
                  </div>
                </ChartCard>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <NavLink to="/saas/cleaning-services">Ver todos los servicios</NavLink>
                <NavLink to="/saas/cleaning-workers">Ver trabajadores</NavLink>
                <NavLink to="/saas/cleaning-incidents">Ver incidencias</NavLink>
                <NavLink to="/saas/cleaning-materials">Ver materiales</NavLink>
              </div>
            </div>
          </div>
        )}

        {/* ─── Tab: Clientes ─────────────────────────────────────── */}
        {!loading && tab === 'clientes' && (
          <div className="space-y-5">
            {overview && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard title="Clientes activos" value={String(overview.clients.activeCount)} sub={`${overview.clients.totalContracts} contratos`} icon={<Users className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/20" />
                <KPICard title="Ingresos totales" value={formatEur(overview.financial.revenue)} sub={`${overview.services.completed} servicios`} icon={<Euro className="w-4 h-4 text-green-600" />} color="bg-green-50 dark:bg-green-900/20" />
                <KPICard title="Margen medio" value={`${overview.financial.grossMarginPercent}%`} sub={formatEur(overview.financial.grossMargin)} icon={<Target className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/20" />
                <KPICard title="€/servicio medio" value={formatEur(overview.operational.avgRevenuePerService)} sub={`${formatEur(overview.operational.avgCostPerService)} coste`} icon={<Zap className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/20" />
              </div>
            )}

            {clientProfit.length > 0 && (
              <ChartCard title="Rentabilidad por cliente">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={clientProfit.slice(0, 12)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                    <YAxis dataKey="clientName" type="category" tick={{ fontSize: 10 }} width={110} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => formatEur(v)} />
                    <Bar dataKey="revenue" name="Ingresos" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="laborCost" name="Mano de obra" fill="#f59e0b" stackId="b" />
                    <Bar dataKey="materialCost" name="Materiales" fill="#ef4444" stackId="b" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            <ChartCard title="Detalle por cliente">
              <DataTable
                columns={[
                  { key: 'clientName', label: 'Cliente' },
                  { key: 'servicesCompleted', label: 'Servicios', align: 'right' },
                  { key: 'hoursReal', label: 'Horas', align: 'right', format: v => `${v}h` },
                  { key: 'revenue', label: 'Ingresos', align: 'right', format: v => formatEur(v) },
                  { key: 'totalCost', label: 'Coste', align: 'right', format: v => formatEur(v) },
                  { key: 'grossMarginPercent', label: 'Margen', align: 'right', format: v => <MarginBadge value={v} /> },
                  { key: 'incidentCount', label: 'Incid.', align: 'right' },
                  { key: 'avgQualityRating', label: 'Calidad', align: 'center', format: (v: number) => v > 0 ? <span className="flex items-center gap-0.5"><Star className="w-3 h-3 text-yellow-500" />{v}</span> : '—' },
                  { key: 'trend', label: 'Tendencia', align: 'center', format: (v: string) => <TrendBadge trend={v as any} /> },
                ]}
                rows={clientProfit}
              />
            </ChartCard>
          </div>
        )}

        {/* ─── Tab: Servicios ────────────────────────────────────── */}
        {!loading && tab === 'servicios' && servicesSummary && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Total servicios" value={String(servicesSummary.totals.total)} sub={`${servicesSummary.totals.completed} completados`} icon={<Briefcase className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/20" />
              <KPICard title="Horas planificadas" value={`${servicesSummary.totals.totalPlannedHours}h`} sub="total acumulado" icon={<CalendarDays className="w-4 h-4 text-green-600" />} color="bg-green-50 dark:bg-green-900/20" />
              <KPICard title="Horas reales" value={`${servicesSummary.totals.totalRealHours}h`} sub={`${(servicesSummary.totals.totalRealHours - servicesSummary.totals.totalPlannedHours).toFixed(1)}h desv.`} icon={<Clock className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/20" />
              <KPICard title="Cancelados" value={String(servicesSummary.totals.cancelled)} sub={`${servicesSummary.totals.total > 0 ? ((servicesSummary.totals.cancelled / servicesSummary.totals.total) * 100).toFixed(1) : 0}%`} icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/20" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Servicios por día">
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={servicesSummary.byDate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="count" name="Servicios" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Line dataKey="real" name="Horas reales" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line dataKey="planned" name="Horas plan." stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Estado de servicios">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={Object.entries(servicesSummary.totals).filter(([k]) => ['completed', 'cancelled', 'pending', 'assigned', 'in_progress'].includes(k)).map(([name, value]) => ({ name: { completed: 'Completado', cancelled: 'Cancelado', pending: 'Pendiente', assigned: 'Asignado', in_progress: 'En curso' }[name] || name, value }))}
                      cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                      {Object.entries(servicesSummary.totals).filter(([k]) => ['completed', 'cancelled', 'pending', 'assigned', 'in_progress'].includes(k)).map(([k], i) => (
                        <Cell key={k} fill={STATUS_COLORS[k] || COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Servicios por trabajador">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={servicesSummary.byWorker.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="count" name="Servicios" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Servicios por cliente">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={servicesSummary.byClient.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="count" name="Servicios" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Últimos servicios">
              <DataTable
                columns={[
                  { key: 'date', label: 'Fecha' },
                  { key: 'clientName', label: 'Cliente' },
                  { key: 'workerName', label: 'Trabajador' },
                  { key: 'cleaningType', label: 'Tipo' },
                  { key: 'hoursPlanned', label: 'H. Plan.', align: 'right', format: v => `${v}h` },
                  { key: 'hoursReal', label: 'H. Real', align: 'right', format: v => `${v}h` },
                  { key: 'deviation', label: 'Desv.', align: 'right', format: (v: number) => <span className={v > 0 ? 'text-red-500' : v < 0 ? 'text-green-600' : ''}>{v > 0 ? '+' : ''}{v}h</span> },
                  { key: 'status', label: 'Estado', align: 'center', format: (v: string) => <StatusBadge status={v} /> },
                  { key: 'qualityRating', label: 'Calidad', align: 'center', format: (v: number) => v > 0 ? <span className="flex items-center gap-0.5 justify-center"><Star className="w-3 h-3 text-yellow-500" />{v}</span> : '—' },
                ]}
                rows={servicesSummary.recent}
              />
            </ChartCard>
          </div>
        )}

        {/* ─── Tab: Trabajadores ──────────────────────────────────── */}
        {!loading && tab === 'trabajadores' && (
          <div className="space-y-5">
            {overview && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard title="Trabajadores activos" value={String(workerProfit.length)} sub={`${overview.services.completed} servicios`} icon={<Users className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/20" />
                <KPICard title="Horas totales" value={`${overview.hours.real}h`} sub={`${overview.hours.planned}h planificadas`} icon={<Clock className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/20" />
                {canViewFinancials && (
                  <>
                    <KPICard title="Coste laboral" value={formatEur(overview.financial.laborCost)} sub={`${overview.operational.avgCostPerService > 0 ? formatEur(overview.operational.avgCostPerService) : '—'}/servicio`} icon={<Euro className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/20" />
                    <KPICard title="€/hora media" value={formatEur(overview.operational.avgRevenuePerHour)} sub="ingresos por hora" icon={<Zap className="w-4 h-4 text-green-600" />} color="bg-green-50 dark:bg-green-900/20" />
                  </>
                )}
              </div>
            )}

            {workerProfit.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Horas reales vs planificadas por trabajador">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={workerProfit.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="workerName" type="category" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="hoursPlanned" name="Planificadas" fill="#3b82f6" />
                      <Bar dataKey="hoursReal" name="Reales" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                {canViewFinancials && (
                  <ChartCard title="Rentabilidad por trabajador">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={workerProfit.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="workerName" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => formatEur(v)} />
                        <Bar dataKey="revenue" name="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="laborCost" name="Coste" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </div>
            )}

            <ChartCard title="Detalle por trabajador">
              <DataTable
                columns={[
                  { key: 'workerName', label: 'Trabajador' },
                  { key: 'servicesCompleted', label: 'Servicios', align: 'right' },
                  { key: 'hoursReal', label: 'H. Reales', align: 'right', format: v => `${v}h` },
                  { key: 'efficiency', label: 'Eficiencia', align: 'right', format: v => `${v}%` },
                  ...(canViewFinancials ? [
                    { key: 'revenue', label: 'Ingresos', align: 'right' as const, format: (v: number) => formatEur(v) },
                    { key: 'profitabilityPercent', label: 'Rentab.', align: 'right' as const, format: (v: number) => <MarginBadge value={v} /> },
                    { key: 'revenuePerHour', label: '€/h', align: 'right' as const, format: (v: number) => formatEur(v) },
                  ] : []),
                  { key: 'lateArrivals', label: 'Retrasos', align: 'right' },
                  { key: 'absences', label: 'Ausencias', align: 'right' },
                  { key: 'incidentCount', label: 'Incid.', align: 'right' },
                  { key: 'avgQualityRating', label: 'Calidad', align: 'center', format: (v: number) => v > 0 ? <span className="flex items-center gap-0.5 justify-center"><Star className="w-3 h-3 text-yellow-500" />{v}</span> : '—' },
                ]}
                rows={workerProfit}
              />
            </ChartCard>
          </div>
        )}

        {/* ─── Tab: Absentismo ───────────────────────────────────── */}
        {!loading && tab === 'absentismo' && absenteeism && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Tasa absentismo" value={`${absenteeism.absenteeismRate}%`} sub={`${absenteeism.totalAbsences} ausencias`} icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/20" />
              <KPICard title="Retrasos" value={String(absenteeism.totalLateArrivals)} sub={`${absenteeism.avgDelayMinutes} min media`} icon={<Clock className="w-4 h-4 text-yellow-600" />} color="bg-yellow-50 dark:bg-yellow-900/20" />
              <KPICard title="Servicios asignados" value={String(absenteeism.totalAssigned)} sub="en período" icon={<Briefcase className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/20" />
              <KPICard title="Sin incidencia" value={`${(100 - absenteeism.absenteeismRate).toFixed(1)}%`} sub="puntualidad" icon={<Target className="w-4 h-4 text-green-600" />} color="bg-green-50 dark:bg-green-900/20" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Ausencias y retrasos por día">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={absenteeism.byDate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="absences" name="Ausencias" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lateArrivals" name="Retrasos" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Por trabajador">
                <DataTable
                  columns={[
                    { key: 'workerName', label: 'Trabajador' },
                    { key: 'assigned', label: 'Asignados', align: 'right' },
                    { key: 'absences', label: 'Ausencias', align: 'right', format: (v: number) => v > 0 ? <span className="text-red-600 font-semibold">{v}</span> : '0' },
                    { key: 'lateArrivals', label: 'Retrasos', align: 'right', format: (v: number) => v > 0 ? <span className="text-yellow-600 font-semibold">{v}</span> : '0' },
                    { key: 'rate', label: 'Tasa', align: 'right', format: (v: number) => <span className={v > 10 ? 'text-red-600 font-semibold' : ''}>{v}%</span> },
                    { key: 'avgDelayMinutes', label: 'Retraso med.', align: 'right', format: v => v > 0 ? `${v} min` : '—' },
                  ]}
                  rows={absenteeism.byWorker}
                />
              </ChartCard>
            </div>

            <ChartCard title="Detalle de eventos">
              <DataTable
                columns={[
                  { key: 'date', label: 'Fecha' },
                  { key: 'workerName', label: 'Trabajador' },
                  { key: 'clientName', label: 'Cliente' },
                  { key: 'scheduledTime', label: 'Hora prog.' },
                  { key: 'type', label: 'Tipo', align: 'center', format: (v: string) => v === 'absence' ? <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">Ausencia</span> : <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">Retraso</span> },
                  { key: 'delayMinutes', label: 'Retraso', align: 'right', format: v => v !== null ? `${v} min` : '—' },
                ]}
                rows={absenteeism.details.slice(0, 50)}
              />
            </ChartCard>
          </div>
        )}

        {/* ─── Tab: Incidencias ──────────────────────────────────── */}
        {!loading && tab === 'incidencias' && incidents && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Total incidencias" value={String(incidents.totalIncidents)} sub="en período" icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/20" />
              <KPICard title="Resueltas" value={String(incidents.resolved)} sub={incidents.totalIncidents > 0 ? `${((incidents.resolved / incidents.totalIncidents) * 100).toFixed(0)}%` : '0%'} icon={<Target className="w-4 h-4 text-green-600" />} color="bg-green-50 dark:bg-green-900/20" />
              <KPICard title="Pendientes" value={String(incidents.unresolved)} sub="sin resolver" icon={<Clock className="w-4 h-4 text-yellow-600" />} color="bg-yellow-50 dark:bg-yellow-900/20" />
              <KPICard title="Resolución media" value={`${incidents.avgResolutionMinutes} min`} sub="tiempo medio" icon={<Zap className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/20" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Tendencia diaria">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={incidents.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Line dataKey="count" name="Incidencias" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Por severidad">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={incidents.bySeverity.map(s => ({ name: { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' }[s.severity] || s.severity, value: s.count }))}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {incidents.bySeverity.map((s, i) => <Cell key={s.severity} fill={SEV_COLORS[s.severity] || COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Por tipo">
                <DataTable
                  columns={[
                    { key: 'type', label: 'Tipo' },
                    { key: 'count', label: 'Total', align: 'right' },
                    { key: 'avgResolutionMinutes', label: 'Resolución media', align: 'right', format: v => v > 0 ? `${v} min` : '—' },
                  ]}
                  rows={incidents.byType}
                />
              </ChartCard>
              <ChartCard title="Por trabajador">
                <DataTable
                  columns={[
                    { key: 'workerName', label: 'Trabajador' },
                    { key: 'count', label: 'Total', align: 'right' },
                    { key: 'resolvedCount', label: 'Resueltas', align: 'right' },
                  ]}
                  rows={incidents.byWorker}
                />
              </ChartCard>
            </div>
          </div>
        )}

        {/* ─── Tab: Materiales ───────────────────────────────────── */}
        {!loading && tab === 'materiales' && materials && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Coste total materiales" value={formatEur(materials.totalCost)} sub={`${materials.totalDeliveries} entregas`} icon={<Package className="w-4 h-4 text-orange-600" />} color="bg-orange-50 dark:bg-orange-900/20" />
              <KPICard title="Coste medio / servicio" value={formatEur(materials.avgCostPerService)} sub="todos los servicios" icon={<Target className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/20" />
              <KPICard title="Materiales distintos" value={String(materials.byMaterial.length)} sub="tipos usados" icon={<Layers className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/20" />
              <KPICard title="Clientes con coste" value={String(materials.byClient.length)} sub="clientes" icon={<Users className="w-4 h-4 text-green-600" />} color="bg-green-50 dark:bg-green-900/20" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {materials.trend.length > 0 && (
                <ChartCard title="Evolución mensual de costes">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={materials.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => formatEur(v)} />
                      <Bar dataKey="cost" name="Coste" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              <ChartCard title="Top materiales por coste">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={materials.byMaterial.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                    <YAxis dataKey="materialName" type="category" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => formatEur(v)} />
                    <Bar dataKey="cost" name="Coste" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Coste por cliente">
                <DataTable
                  columns={[
                    { key: 'clientName', label: 'Cliente' },
                    { key: 'cost', label: 'Coste total', align: 'right', format: (v: number) => formatEur(v) },
                    { key: 'servicesCount', label: 'Servicios', align: 'right' },
                    { key: 'avgPerService', label: '€/servicio', align: 'right', format: (v: number) => formatEur(v) },
                  ]}
                  rows={materials.byClient}
                />
              </ChartCard>
              <ChartCard title="Coste por trabajador">
                <DataTable
                  columns={[
                    { key: 'workerName', label: 'Trabajador' },
                    { key: 'cost', label: 'Coste total', align: 'right', format: (v: number) => formatEur(v) },
                    { key: 'servicesCount', label: 'Servicios', align: 'right' },
                  ]}
                  rows={materials.byWorker}
                />
              </ChartCard>
            </div>
          </div>
        )}

        {/* ─── Tab: Facturación ──────────────────────────────────── */}
        {!loading && tab === 'facturacion' && billing && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Total facturado" value={formatEur(billing.totalBilled)} sub="en período" icon={<Euro className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/20" />
              <KPICard title="Cobrado" value={formatEur(billing.totalCollected)} sub={`${billing.collectionRate}% tasa cobro`} icon={<Target className="w-4 h-4 text-green-600" />} color="bg-green-50 dark:bg-green-900/20" />
              <KPICard title="Pendiente de cobro" value={formatEur(billing.totalPending)} sub="por cobrar" icon={<Clock className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/20" />
              {overview && (
                <KPICard title="Margen operativo" value={`${overview.financial.grossMarginPercent}%`} sub={formatEur(overview.financial.grossMargin)} icon={<Percent className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/20" />
              )}
            </div>

            <ChartCard title="Facturación mensual">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={billing.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => formatEur(v)} />
                  <Bar dataKey="billed" name="Facturado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Cobrado" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Line dataKey="pending" name="Pendiente" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Facturación por cliente">
              <DataTable
                columns={[
                  { key: 'clientName', label: 'Cliente' },
                  { key: 'billed', label: 'Facturado', align: 'right', format: (v: number) => formatEur(v) },
                  { key: 'collected', label: 'Cobrado', align: 'right', format: (v: number) => formatEur(v) },
                  { key: 'pending', label: 'Pendiente', align: 'right', format: (v: number) => v > 0 ? <span className="text-red-600 font-semibold">{formatEur(v)}</span> : formatEur(0) },
                  { key: 'servicesCount', label: 'Servicios', align: 'right' },
                ]}
                rows={billing.byClient}
              />
            </ChartCard>
          </div>
        )}

        {/* ─── Tab: Comparativas ─────────────────────────────────── */}
        {!loading && tab === 'comparativas' && comparatives && (
          <div className="space-y-5">
            <ChartCard title="Comparativa por zona">
              {comparatives.byZone.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={comparatives.byZone}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="zone" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => formatEur(v)} />
                      <Bar dataKey="revenue" name="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="laborCost" name="Mano de obra" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="materialCost" name="Materiales" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4">
                    <DataTable
                      columns={[
                        { key: 'zone', label: 'Zona' },
                        { key: 'servicesCount', label: 'Servicios', align: 'right' },
                        { key: 'revenue', label: 'Ingresos', align: 'right', format: (v: number) => formatEur(v) },
                        { key: 'grossMarginPercent', label: 'Margen', align: 'right', format: (v: number) => <MarginBadge value={v} /> },
                        { key: 'avgQualityRating', label: 'Calidad', align: 'center', format: (v: number) => v > 0 ? `${v}/5` : '—' },
                        { key: 'incidentCount', label: 'Incid.', align: 'right' },
                        { key: 'workersCount', label: 'Trab.', align: 'right' },
                        { key: 'clientsCount', label: 'Clientes', align: 'right' },
                      ]}
                      rows={comparatives.byZone}
                    />
                  </div>
                </>
              ) : (
                <p className="text-gray-400 text-sm py-4 text-center">No hay datos de zonas para este período</p>
              )}
            </ChartCard>

            <ChartCard title="Comparativa por tipo de servicio">
              {comparatives.byCleaningType.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={comparatives.byCleaningType}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="cleaningType" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatEur(v)} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => formatEur(v)} />
                      <Bar dataKey="revenue" name="Ingresos" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="laborCost" name="Mano de obra" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="materialCost" name="Materiales" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4">
                    <DataTable
                      columns={[
                        { key: 'cleaningType', label: 'Tipo' },
                        { key: 'servicesCount', label: 'Servicios', align: 'right' },
                        { key: 'revenue', label: 'Ingresos', align: 'right', format: (v: number) => formatEur(v) },
                        { key: 'grossMarginPercent', label: 'Margen', align: 'right', format: (v: number) => <MarginBadge value={v} /> },
                        { key: 'avgDurationMinutes', label: 'Duración med.', align: 'right', format: v => `${v} min` },
                        { key: 'avgRevenuePerHour', label: '€/h', align: 'right', format: (v: number) => formatEur(v) },
                        { key: 'incidentCount', label: 'Incid.', align: 'right' },
                      ]}
                      rows={comparatives.byCleaningType}
                    />
                  </div>
                </>
              ) : (
                <p className="text-gray-400 text-sm py-4 text-center">No hay datos de tipos para este período</p>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </Layout>
  );
}
