import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useAlertCenterBusinessId, useAlertSettingsBusinessId } from '../../hooks/useAlertCenterBusinessId';
import { AlertCenterSettingsSlide, VertialSecondaryButton } from '../../components/saas/AlertCenterSettingsSlide';
import {
  AlertProShell,
  AlertProKpiStrip,
  AlertProDeptTabs,
  AlertProEmpty,
  AlertProIconButton,
  AlertProViewTabs,
  AlertHistoryTimeline,
  PRIORITY_ACCENT,
} from '../../components/saas/alertCenterProUi';
import {
  fetchAlerts,
  fetchAlertHistory,
  fetchAlertSummary,
  updateAlertStatus,
  bulkUpdateAlertStatus,
  deleteAlert as deleteAlertRequest,
  triggerAlertEngineCheck,
  normalizeAlertSummary,
  departmentSourceFilter,
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
  Bell, CheckCircle, Eye, Filter, Search, RefreshCw,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trash2, Check,
  Clock, X, Shield, TrendingUp,
  DollarSign, Package, Users, FileText, Wrench,
  ScanLine, Building2, Monitor, Bike, Activity, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';

const SOURCE_ICONS: Record<string, React.ElementType> = {
  finanzas: DollarSign,
  stock: Package,
  equipo: Users,
  documentacion: FileText,
  verticales: TrendingUp,
  delivery: Bike,
  construccion: Building2,
  limpieza: Activity,
  ocr: ScanLine,
  conciliacion: Building2,
  crm: Shield,
  taller: Wrench,
  sistema: Monitor,
};

const DEPT_TAB_ICONS: Record<string, React.ElementType> = {
  all: Bell,
  delivery: Bike,
  finanzas: DollarSign,
  rrhh: Users,
  operaciones: Activity,
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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const businessId = useAlertCenterBusinessId();
  const settingsBusinessId = useAlertSettingsBusinessId();

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 0 });

  const [filters, setFilters] = useState<ListAlertsFilters>({ status: 'new,seen', order: 'desc', page: 1, limit: 25 });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [activeDepartment, setActiveDepartment] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const summaryRes = await fetchAlertSummary(businessId);
      setSummary(normalizeAlertSummary(summaryRes.summary));

      if (viewMode === 'history') {
        const alertsRes = await fetchAlertHistory(businessId, {
          ...filters,
          search: searchTerm || undefined,
          includeDeleted,
          from: historyFrom || undefined,
          to: historyTo || undefined,
        });
        setAlerts(alertsRes.alerts);
        setPagination(alertsRes.pagination);
      } else {
        const alertsRes = await fetchAlerts(businessId, { ...filters, search: searchTerm || undefined });
        setAlerts(alertsRes.alerts);
        setPagination(alertsRes.pagination);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando alertas');
    } finally {
      setLoading(false);
    }
  }, [businessId, filters, searchTerm, viewMode, includeDeleted, historyFrom, historyTo]);

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

  const selectDepartment = (deptId: string) => {
    setActiveDepartment(deptId);
    const sourceFilter = departmentSourceFilter(deptId);
    setFilters((prev) => ({
      ...prev,
      source: sourceFilter,
      page: 1,
    }));
  };

  const switchViewMode = (mode: 'active' | 'history') => {
    setViewMode(mode);
    setExpandedAlertId(null);
    setSelectedIds(new Set());
    setShowFilters(false);
    if (mode === 'history') {
      setFilters({ order: 'desc', page: 1, limit: 25 });
    } else {
      setFilters({ status: 'new,seen', order: 'desc', page: 1, limit: 25 });
    }
  };

  const syncAlerts = useCallback(async () => {
    if (!businessId) return;
    setSyncing(true);
    try {
      if (user?.userId) {
        await triggerAlertEngineCheck(user.userId).catch(() => null);
      }
      await loadData();
      toast.success('Alertas actualizadas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error sincronizando alertas');
    } finally {
      setSyncing(false);
    }
  }, [businessId, user?.userId, loadData]);

  useEffect(() => {
    if (searchParams.get('tab') === 'history') {
      switchViewMode('history');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!businessId || !user?.userId) return;
    void triggerAlertEngineCheck(user.userId).catch(() => null);
  }, [businessId, user?.userId]);


  return (
    <Layout>
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="overflow-hidden rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <AlertProShell
            title="Centro de Alertas"
            subtitle={
              viewMode === 'history'
                ? 'Registro de alertas resueltas y cerradas — trazabilidad completa'
                : 'Delivery · Finanzas · RRHH · Operaciones — visión ejecutiva de tu negocio'
            }
            badge={
              (summary?.unresolved ?? 0) > 0 ? (
                <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-bold text-red-300 ring-1 ring-red-500/30">
                  {summary!.unresolved > 99 ? '99+' : summary!.unresolved} activas
                </span>
              ) : undefined
            }
            actions={(
              <>
                <AlertProIconButton title="Personalizar alertas" onClick={() => setShowSettings(true)}>
                  <Settings2 className="h-4 w-4" />
                </AlertProIconButton>
                <AlertProIconButton title="Actualizar" onClick={() => void syncAlerts()} disabled={loading || syncing}>
                  <RefreshCw className={`h-4 w-4 ${loading || syncing ? 'animate-spin' : ''}`} />
                </AlertProIconButton>
              </>
            )}
            kpis={summary ? (
              <AlertProKpiStrip
                unresolved={summary.unresolved ?? 0}
                high={summary.byPriority?.high ?? 0}
                medium={summary.byPriority?.medium ?? 0}
                newCount={summary.byStatus?.new ?? 0}
              />
            ) : undefined}
          />

          <AlertProViewTabs
            activeId={viewMode}
            onChange={switchViewMode}
            activeCount={summary?.unresolved ?? 0}
            historyCount={summary?.historyTotal ?? summary?.byStatus?.resolved ?? 0}
          />

          <AlertProDeptTabs
            summary={summary}
            activeId={activeDepartment}
            onChange={selectDepartment}
            icons={DEPT_TAB_ICONS}
          />

          <div className="space-y-4 p-4 sm:p-6">
            {/* Filters bar */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar alertas..."
                    className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </div>
                <VertialSecondaryButton active={showFilters} onClick={() => setShowFilters(!showFilters)}>
                  <Filter className="h-4 w-4" />
                  Filtros
                </VertialSecondaryButton>
                {viewMode === 'history' && (
                  <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={includeDeleted}
                      onChange={(e) => {
                        setIncludeDeleted(e.target.checked);
                        setFilters((p) => ({ ...p, page: 1 }));
                      }}
                      className="rounded border-zinc-300"
                    />
                    Incluir eliminadas
                  </label>
                )}
              </div>

              {viewMode === 'history' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={historyFrom}
                    onChange={(e) => { setHistoryFrom(e.target.value); setFilters((p) => ({ ...p, page: 1 })); }}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <span className="text-xs text-zinc-400">hasta</span>
                  <input
                    type="date"
                    value={historyTo}
                    onChange={(e) => { setHistoryTo(e.target.value); setFilters((p) => ({ ...p, page: 1 })); }}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
              )}

              {showFilters && viewMode === 'active' && (
                <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Estado</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(['new', 'seen', 'resolved'] as AlertStatus[]).map((s) => (
                        <Chip key={s} active={activeStatusFilters.includes(s)} onClick={() => toggleChipFilter('status', s)} label={STATUS_LABELS[s]} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Prioridad</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(['high', 'medium', 'low'] as AlertPriority[]).map((p) => (
                        <Chip key={p} active={activePriorityFilters.includes(p)} onClick={() => toggleChipFilter('priority', p)} label={PRIORITY_LABELS[p]} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Fuente</span>
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
            {viewMode === 'active' && selectedIds.size > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/80">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {selectedIds.size} seleccionada{selectedIds.size > 1 ? 's' : ''}
                </span>
                <button onClick={() => handleBulkStatus('seen')} className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  <Eye className="h-3.5 w-3.5" /> Marcar vistas
                </button>
                <button onClick={() => handleBulkStatus('resolved')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                  <Check className="h-3.5 w-3.5" /> Resolver
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-zinc-400 hover:text-zinc-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Alert list */}
            <div className="space-y-2">
              {loading && alerts.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              ) : alerts.length === 0 ? (
                <AlertProEmpty label={viewMode === 'history' ? 'No hay alertas en el historial con estos filtros' : undefined} />
              ) : (
                <>
                  {viewMode === 'active' && (
                  <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === alerts.length && alerts.length > 0}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-zinc-300"
                    />
                    <span>Seleccionar todo</span>
                  </div>
                  )}

                  {alerts.map((alert) => (
                    <AlertPageRow
                      key={alert.id}
                      alert={alert}
                      historyMode={viewMode === 'history'}
                      expanded={expandedAlertId === alert.id}
                      onToggleExpand={() => setExpandedAlertId((id) => (id === alert.id ? null : alert.id))}
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
              <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <span className="text-sm text-zinc-500">
                  {pagination.total} alerta{pagination.total !== 1 ? 's' : ''} · Página {pagination.page} de {pagination.pages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setFilters((p) => ({ ...p, page: (p.page || 1) - 1 }))}
                    className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setFilters((p) => ({ ...p, page: (p.page || 1) + 1 }))}
                    className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <AlertCenterSettingsSlide
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          businessId={settingsBusinessId}
          onSaved={() => void loadData()}
        />
      </div>
    </Layout>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
      }`}
    >
      {label}
    </button>
  );
}

function AlertPageRow({
  alert,
  historyMode = false,
  expanded = false,
  onToggleExpand,
  selected,
  onToggleSelect,
  onStatusChange,
  onDelete,
  onNavigate,
}: {
  alert: AlertRecord;
  historyMode?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (id: string, status: AlertStatus) => void;
  onDelete: (id: string) => void;
  onNavigate: (route: string) => void;
}) {
  const pColors = PRIORITY_COLORS[alert.priority] || PRIORITY_COLORS.medium;
  const sStyles = STATUS_STYLES[alert.status] || STATUS_STYLES.new;
  const SourceIcon = SOURCE_ICONS[alert.source] || Bell;
  const sourceColor = SOURCE_COLORS[alert.source as AlertSource] || '#71717a';
  const accent = PRIORITY_ACCENT[alert.priority] || PRIORITY_ACCENT.medium;
  const isDeleted = Boolean(alert.deletedAt);

  const closedAt = alert.resolvedAt || alert.deletedAt || alert.updatedAt;
  const closedLabel = (() => {
    try {
      return format(new Date(closedAt), 'dd MMM yyyy · HH:mm', { locale: es });
    } catch {
      return closedAt;
    }
  })();

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true, locale: es });
    } catch {
      return alert.createdAt;
    }
  })();

  return (
    <div
      className={`rounded-xl border border-zinc-200/90 bg-white transition-all dark:border-zinc-800 dark:bg-zinc-900/80 border-l-[3px] ${accent} ${
        historyMode ? '' : 'hover:border-zinc-300 hover:shadow-md dark:hover:border-zinc-700'
      } ${alert.status === 'new' && !historyMode ? 'ring-1 ring-amber-500/20' : ''} ${
        isDeleted ? 'opacity-70' : ''
      }`}
    >
      <div className="group flex items-start gap-3 p-4 pl-3.5">
        {!historyMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 h-4 w-4 rounded border-zinc-300"
          />
        )}

        <div className="flex-shrink-0 rounded-lg p-2" style={{ backgroundColor: `${sourceColor}14` }}>
          <SourceIcon className="h-4 w-4" style={{ color: sourceColor }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {alert.title}
                </h3>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pColors.bg} ${pColors.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${pColors.dot}`} />
                  {PRIORITY_LABELS[alert.priority]}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${sStyles.bg} ${sStyles.text}`}>
                  {alert.status === 'resolved' && <Check className="h-2.5 w-2.5" />}
                  {isDeleted ? 'Eliminada' : STATUS_LABELS[alert.status]}
                </span>
                <span className="text-[10px] font-medium text-zinc-400">
                  {SOURCE_LABELS[alert.source as AlertSource] || alert.source}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                {alert.message}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Creada {timeAgo}
                </span>
                {historyMode && closedAt && (
                  <span>
                    {isDeleted ? 'Eliminada' : 'Resuelta'} · {closedLabel}
                    {(alert.resolvedBy || alert.deletedBy) && ` · ${alert.resolvedBy || alert.deletedBy}`}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-1">
              {historyMode ? (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                  title="Ver historial"
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              ) : (
                <div className="opacity-0 transition group-hover:opacity-100 flex items-center gap-1">
                  {alert.route && (
                    <button
                      onClick={() => onNavigate(alert.route!)}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                      title="Ir al detalle"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  {alert.status === 'new' && (
                    <button
                      onClick={() => onStatusChange(alert.id, 'seen')}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
                      title="Marcar como vista"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  {alert.status !== 'resolved' && (
                    <button
                      onClick={() => onStatusChange(alert.id, 'resolved')}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                      title="Resolver"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(alert.id)}
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {historyMode && expanded && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Línea temporal</p>
          <AlertHistoryTimeline entries={alert.statusHistory || []} compact />
        </div>
      )}
    </div>
  );
}
