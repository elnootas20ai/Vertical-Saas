import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  fetchAlerts,
  fetchAlertSummary,
  updateAlertStatus,
  bulkUpdateAlertStatus,
  deleteAlert as deleteAlertRequest,
  SOURCE_LABELS,
  SOURCE_COLORS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type AlertRecord,
  type AlertSummary,
  type AlertStatus,
  type AlertPriority,
  type AlertSource,
  type ListAlertsFilters,
} from '../../lib/alertCenterApi';
import {
  Bell, AlertTriangle, AlertCircle, Info,
  CheckCircle, Eye, Filter, Search, RefreshCw,
  ChevronLeft, ChevronRight, Trash2, Check,
  Clock, X, Shield, TrendingUp,
  DollarSign, Package, Users, FileText, Wrench,
  ScanLine, Building2, Monitor,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const SOURCE_ICONS: Record<string, React.ElementType> = {
  finanzas: DollarSign,
  stock: Package,
  equipo: Users,
  documentacion: FileText,
  verticales: TrendingUp,
  ocr: ScanLine,
  conciliacion: Building2,
  crm: Shield,
  taller: Wrench,
  sistema: Monitor,
};

const PRIORITY_COLORS: Record<AlertPriority, { bg: string; text: string; dot: string }> = {
  high: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  medium: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  low: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
};

const STATUS_STYLES: Record<AlertStatus, { bg: string; text: string }> = {
  new: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  seen: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
  resolved: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400' },
};

export default function AlertCenterPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?._id?.replace('business:', '') || currentBusiness?.id || user?.userId || '';

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 0 });

  const [filters, setFilters] = useState<ListAlertsFilters>({ status: 'new,seen', order: 'desc', page: 1, limit: 25 });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [alertsRes, summaryRes] = await Promise.all([
        fetchAlerts(businessId, { ...filters, search: searchTerm || undefined }),
        fetchAlertSummary(businessId),
      ]);
      setAlerts(alertsRes.alerts);
      setPagination(alertsRes.pagination);
      setSummary(summaryRes.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando alertas');
    } finally {
      setLoading(false);
    }
  }, [businessId, filters, searchTerm]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStatusChange = useCallback(async (alertId: string, status: AlertStatus) => {
    try {
      await updateAlertStatus(businessId, alertId, status);
      toast.success(`Alerta marcada como ${STATUS_LABELS[status].toLowerCase()}`);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error actualizando alerta');
    }
  }, [businessId, loadData]);

  const handleBulkStatus = useCallback(async (status: AlertStatus) => {
    if (selectedIds.size === 0) return;
    try {
      const result = await bulkUpdateAlertStatus(businessId, [...selectedIds], status);
      toast.success(`${result.updated} alertas actualizadas`);
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error en actualización masiva');
    }
  }, [businessId, selectedIds, loadData]);

  const handleDelete = useCallback(async (alertId: string) => {
    try {
      await deleteAlertRequest(businessId, alertId);
      toast.success('Alerta eliminada');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error eliminando alerta');
    }
  }, [businessId, loadData]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === alerts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(alerts.map((a) => a.id)));
    }
  };

  const setFilterValue = (key: keyof ListAlertsFilters, value: string | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const activeSourceFilters = useMemo(() => (filters.source || '').split(',').filter(Boolean), [filters.source]);
  const activePriorityFilters = useMemo(() => (filters.priority || '').split(',').filter(Boolean), [filters.priority]);
  const activeStatusFilters = useMemo(() => (filters.status || '').split(',').filter(Boolean), [filters.status]);

  const toggleChipFilter = (key: 'source' | 'priority' | 'status', value: string) => {
    const current = (filters[key] || '').split(',').filter(Boolean);
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setFilterValue(key, next.length > 0 ? next.join(',') : undefined);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Bell className="h-6 w-6 text-indigo-600" />
              Centro de Alertas
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Todas las alertas del sistema en un solo lugar
            </p>
          </div>
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total" value={summary.total} icon={Bell} color="text-gray-700 dark:text-gray-300" bg="bg-gray-50 dark:bg-gray-800/60" />
            <SummaryCard label="Alta prioridad" value={summary.byPriority.high} icon={AlertCircle} color="text-red-700 dark:text-red-400" bg="bg-red-50 dark:bg-red-950/30" />
            <SummaryCard label="Sin resolver" value={summary.unresolved} icon={AlertTriangle} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/30" />
            <SummaryCard label="Resueltas" value={summary.byStatus.resolved} icon={CheckCircle} color="text-emerald-700 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-950/30" />
          </div>
        )}

        {/* Filters bar */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar alertas..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                showFilters
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filtros
            </button>
          </div>

          {showFilters && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              {/* Status chips */}
              <div>
                <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Estado</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(['new', 'seen', 'resolved'] as AlertStatus[]).map((s) => (
                    <Chip key={s} active={activeStatusFilters.includes(s)} onClick={() => toggleChipFilter('status', s)} label={STATUS_LABELS[s]} />
                  ))}
                </div>
              </div>
              {/* Priority chips */}
              <div>
                <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Prioridad</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(['high', 'medium', 'low'] as AlertPriority[]).map((p) => (
                    <Chip key={p} active={activePriorityFilters.includes(p)} onClick={() => toggleChipFilter('priority', p)} label={PRIORITY_LABELS[p]} />
                  ))}
                </div>
              </div>
              {/* Source chips */}
              <div>
                <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Fuente</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(Object.keys(SOURCE_LABELS) as AlertSource[]).map((src) => (
                    <Chip key={src} active={activeSourceFilters.includes(src)} onClick={() => toggleChipFilter('source', src)} label={SOURCE_LABELS[src]} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 dark:border-indigo-800 dark:bg-indigo-950/30">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              {selectedIds.size} seleccionada{selectedIds.size > 1 ? 's' : ''}
            </span>
            <button onClick={() => handleBulkStatus('seen')} className="flex items-center gap-1 rounded-md bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300">
              <Eye className="h-3.5 w-3.5" /> Marcar vistas
            </button>
            <button onClick={() => handleBulkStatus('resolved')} className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-700">
              <Check className="h-3.5 w-3.5" /> Resolver
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Alert list */}
        <div className="space-y-2">
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 dark:border-gray-700">
              <CheckCircle className="h-12 w-12 text-emerald-400" />
              <p className="mt-3 text-lg font-medium text-gray-700 dark:text-gray-300">Todo en orden</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No hay alertas que requieran atención</p>
            </div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={selectedIds.size === alerts.length && alerts.length > 0}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <span>Seleccionar todo</span>
              </div>

              {alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  selected={selectedIds.has(alert.id)}
                  onToggleSelect={() => toggleSelect(alert.id)}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onNavigate={(route) => navigate(route)}
                />
              ))}
            </>
          )}
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {pagination.total} alerta{pagination.total !== 1 ? 's' : ''} · Página {pagination.page} de {pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setFilters((p) => ({ ...p, page: (p.page || 1) - 1 }))}
                className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => setFilters((p) => ({ ...p, page: (p.page || 1) + 1 }))}
                className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color, bg }: { label: string; value: number; icon: React.ElementType; color: string; bg: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-gray-200/60 p-4 ${bg} dark:border-gray-700/40`}>
      <div className={`rounded-lg p-2 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

function AlertRow({
  alert,
  selected,
  onToggleSelect,
  onStatusChange,
  onDelete,
  onNavigate,
}: {
  alert: AlertRecord;
  selected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (id: string, status: AlertStatus) => void;
  onDelete: (id: string) => void;
  onNavigate: (route: string) => void;
}) {
  const pColors = PRIORITY_COLORS[alert.priority] || PRIORITY_COLORS.medium;
  const sStyles = STATUS_STYLES[alert.status] || STATUS_STYLES.new;
  const SourceIcon = SOURCE_ICONS[alert.source] || Bell;
  const sourceColor = SOURCE_COLORS[alert.source as AlertSource] || '#6B7280';

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true, locale: es });
    } catch {
      return alert.createdAt;
    }
  })();

  return (
    <div
      className={`group flex items-start gap-3 rounded-xl border p-4 transition-all ${
        alert.status === 'new'
          ? 'border-l-4 border-l-indigo-500 border-t-gray-200 border-r-gray-200 border-b-gray-200 bg-white dark:border-t-gray-700 dark:border-r-gray-700 dark:border-b-gray-700 dark:border-l-indigo-500 dark:bg-gray-800/80'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/40'
      } ${alert.status === 'resolved' ? 'opacity-60' : ''}`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600"
      />

      {/* Source icon */}
      <div className="flex-shrink-0 rounded-lg p-2" style={{ backgroundColor: `${sourceColor}15` }}>
        <SourceIcon className="h-4 w-4" style={{ color: sourceColor }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {alert.title}
              </h3>
              {/* Priority badge */}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pColors.bg} ${pColors.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${pColors.dot} ${alert.status === 'new' ? 'animate-pulse' : ''}`} />
                {PRIORITY_LABELS[alert.priority]}
              </span>
              {/* Status badge */}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${sStyles.bg} ${sStyles.text}`}>
                {alert.status === 'new' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                {alert.status === 'resolved' && <Check className="h-2.5 w-2.5" />}
                {STATUS_LABELS[alert.status]}
              </span>
              {/* Source label */}
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                {SOURCE_LABELS[alert.source as AlertSource] || alert.source}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {alert.message}
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {alert.route && (
              <button
                onClick={() => onNavigate(alert.route!)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                title="Ir al detalle"
              >
                <Eye className="h-4 w-4" />
              </button>
            )}
            {alert.status === 'new' && (
              <button
                onClick={() => onStatusChange(alert.id, 'seen')}
                className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
                title="Marcar como vista"
              >
                <Eye className="h-4 w-4" />
              </button>
            )}
            {alert.status !== 'resolved' && (
              <button
                onClick={() => onStatusChange(alert.id, 'resolved')}
                className="rounded-md p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                title="Resolver"
              >
                <CheckCircle className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => onDelete(alert.id)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              title="Eliminar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
