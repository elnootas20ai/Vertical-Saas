import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { getAuthHeaders } from '../../lib/authApi';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { useAlertCenterBusinessId, useAlertSettingsBusinessId } from '../../hooks/useAlertCenterBusinessId';
import { useAlertDepartments } from '../../hooks/useAlertDepartments';
import { AlertCenterAjustesView } from '../../components/saas/AlertCenterAjustesView';
import {
  AlertHistoryTimeline,
  PRIORITY_ACCENT,
  type AlertCenterPageTab,
} from '../../components/saas/alertCenterProUi';
import {
  fetchAlerts,
  fetchAlertHistory,
  fetchAlertSummary,
  updateAlertStatus,
  bulkUpdateAlertStatus,
  resolveAllUnresolvedAlerts,
  deleteAlert as deleteAlertRequest,
  triggerAlertEngineCheck,
  normalizeAlertSummary,
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
import { resetAlertsToManagerFocus } from '../../lib/settingsApi';
import {
  fetchDocumentAlertsAsRecords,
  mergeAlertLists,
  mergeDocumentAlertsIntoSummary,
  shouldIncludeDocumentAlerts,
  isSyntheticDocumentAlert,
  dismissDocumentAlert,
  dismissDocumentAlerts,
} from '../../lib/documentAlertsApi';
import {
  Bell, CheckCircle, Eye, Filter, Search, RefreshCw,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trash2, Check,
  Clock, X, Shield, TrendingUp, AlertTriangle,
  DollarSign, Package, Users, FileText, Wrench,
  ScanLine, Building2, Monitor, Bike, Activity,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAlertResolveLabel, alertHasNavigateTarget, mapAlertsForBusinessVertical } from '../../lib/alertActions';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDeliveryAlertsReviewPrompt } from '../../hooks/useDeliveryAlertsReviewPrompt';

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

function tabFromSearch(tab: string | null): AlertCenterPageTab {
  if (tab === 'historial' || tab === 'history') return 'history';
  if (tab === 'ajustes' || tab === 'settings') return 'settings';
  return 'inbox';
}

export default function AlertCenterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = useAlertCenterBusinessId();
  const settingsBusinessId = useAlertSettingsBusinessId();
  const { departments: alertDepartments, departmentSourceFilter } = useAlertDepartments();
  const {
    pending: deliveryReviewPending,
    pendingCount: deliveryPendingCount,
    markReviewed: markDeliveryReviewed,
  } = useDeliveryAlertsReviewPrompt();

  const [pageTab, setPageTab] = useState<AlertCenterPageTab>(() => tabFromSearch(searchParams.get('tab')));

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 0 });

  const [filters, setFilters] = useState<ListAlertsFilters>({ status: 'new,seen', order: 'desc', page: 1, limit: 25 });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [managerResetBusy, setManagerResetBusy] = useState(false);
  const [activeDepartment, setActiveDepartment] = useState('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  const isHistory = pageTab === 'history';
  const isSettings = pageTab === 'settings';

  const accountUserId = user?.user_id || user?.id || '';

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const sourceFilter = departmentSourceFilter(activeDepartment);
      const includeDocs = !isHistory && shouldIncludeDocumentAlerts(sourceFilter);

      // Paralelo: resumen + listado (antes era secuencial × 2 escaneos de toda notifications).
      const [summaryRes, alertsRes, docAlerts] = await Promise.all([
        fetchAlertSummary(businessId),
        isSettings
          ? Promise.resolve(null)
          : isHistory
            ? fetchAlertHistory(businessId, {
                ...filters,
                search: searchTerm || undefined,
                includeDeleted,
                from: historyFrom || undefined,
                to: historyTo || undefined,
              })
            : fetchAlerts(businessId, {
                ...filters,
                search: searchTerm || undefined,
                ...(sourceFilter ? { source: sourceFilter } : {}),
              }),
        includeDocs && dataUserId
          ? fetchDocumentAlertsAsRecords(dataUserId, businessId).catch(() => [])
          : Promise.resolve([] as AlertRecord[]),
      ]);

      setSummary(mergeDocumentAlertsIntoSummary(normalizeAlertSummary(summaryRes.summary), docAlerts));

      if (isSettings || !alertsRes) {
        return;
      }

      if (isHistory) {
        setAlerts(mapAlertsForBusinessVertical(alertsRes.alerts, currentBusiness?.businessType));
        setPagination(alertsRes.pagination);
      } else {
        const merged = mergeAlertLists(
          mapAlertsForBusinessVertical(alertsRes.alerts || [], currentBusiness?.businessType),
          docAlerts,
        );
        const search = searchTerm.trim().toLowerCase();
        const filtered = search
          ? merged.filter((a) =>
            a.title.toLowerCase().includes(search) || a.message.toLowerCase().includes(search))
          : merged;
        setAlerts(filtered);
        setPagination({
          ...alertsRes.pagination,
          total: filtered.length,
          pages: Math.max(1, Math.ceil(filtered.length / (filters.limit || 25))),
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando alertas');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [businessId, dataUserId, filters, searchTerm, isHistory, isSettings, includeDeleted, historyFrom, historyTo, activeDepartment, departmentSourceFilter, currentBusiness?.businessType]);

  const sseToken = useMemo(() => {
    const headers = getAuthHeaders();
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
  }, [user?.user_id]);

  useSSE({
    userId: accountUserId || null,
    token: sseToken,
    businessId: businessId || null,
    enabled: !!accountUserId && !!sseToken && !!businessId && !isSettings,
    handlers: {
      notification: () => { void loadData({ silent: true }); },
      'delivery:alert_triggered': () => { void loadData({ silent: true }); },
    },
  });

  useEffect(() => { void loadData(); }, [loadData]);

  const handleStatusChange = useCallback(async (alertId: string, status: AlertStatus) => {
    if (isSyntheticDocumentAlert(alertId)) {
      if (status === 'seen' || status === 'resolved') {
        if (dataUserId) dismissDocumentAlert(dataUserId, businessId, alertId);
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        setSummary((prev) => {
          if (!prev) return prev;
          const next = { ...prev, unresolved: Math.max(0, prev.unresolved - 1) };
          next.byStatus = { ...next.byStatus, new: Math.max(0, (next.byStatus.new || 0) - 1) };
          next.bySource = { ...next.bySource, documentacion: Math.max(0, (next.bySource.documentacion || 0) - 1) };
          return next;
        });
      }
      return;
    }
    try {
      await updateAlertStatus(businessId, alertId, status);
      toast.success(`Alerta marcada como ${STATUS_LABELS[status].toLowerCase()}`);
      await loadData({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error actualizando alerta');
    }
  }, [businessId, dataUserId, loadData]);

  const handleBulkStatus = useCallback(async (status: AlertStatus) => {
    if (selectedIds.size === 0 || bulkBusy) return;
    const realIds = [...selectedIds].filter((id) => !isSyntheticDocumentAlert(id));
    const syntheticIds = [...selectedIds].filter((id) => isSyntheticDocumentAlert(id));
    setBulkBusy(true);
    try {
      if (syntheticIds.length > 0 && (status === 'seen' || status === 'resolved')) {
        if (dataUserId) dismissDocumentAlerts(dataUserId, businessId, syntheticIds);
        setAlerts((prev) => prev.filter((a) => !syntheticIds.includes(a.id)));
        setSummary((prev) => {
          if (!prev) return prev;
          const n = syntheticIds.length;
          return {
            ...prev,
            unresolved: Math.max(0, prev.unresolved - n),
            byStatus: { ...prev.byStatus, new: Math.max(0, (prev.byStatus.new || 0) - n) },
            bySource: { ...prev.bySource, documentacion: Math.max(0, (prev.bySource.documentacion || 0) - n) },
          };
        });
      }
      if (realIds.length === 0) {
        setSelectedIds(new Set());
        return;
      }
      const result = await bulkUpdateAlertStatus(businessId, realIds, status);
      if (result.errors > 0) {
        toast.warning(`${result.updated} actualizadas · ${result.errors} con error`);
      } else {
        toast.success(`${result.updated} alertas actualizadas`);
      }
      setSelectedIds(new Set());
      await loadData({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error en actualización masiva');
    } finally {
      setBulkBusy(false);
    }
  }, [businessId, dataUserId, selectedIds, bulkBusy, loadData]);

  const handleClearPending = useCallback(async () => {
    if (!businessId || managerResetBusy) return;
    setManagerResetBusy(true);
    try {
      const result = await resolveAllUnresolvedAlerts(businessId);
      if (dataUserId) {
        const docs = await fetchDocumentAlertsAsRecords(dataUserId, businessId).catch(() => []);
        if (docs.length > 0) {
          dismissDocumentAlerts(dataUserId, businessId, docs.map((d) => d.id));
        }
      }
      toast.success(
        result.updated > 0
          ? `Bandeja limpia: ${result.updated} alertas resueltas`
          : result.message || 'No había pendientes',
      );
      setSelectedIds(new Set());
      await loadData({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo limpiar la bandeja');
    } finally {
      setManagerResetBusy(false);
    }
  }, [businessId, dataUserId, managerResetBusy, loadData]);

  const handleManagerFocus = useCallback(async () => {
    if (!settingsBusinessId || managerResetBusy) return;
    const ok = window.confirm(
      '¿Poner alertas en modo gerente?\n\n' +
        '• Apaga el ruido (~200 reglas)\n' +
        '• Deja solo caja, fichaje y lo esencial del negocio\n' +
        '• También limpia la bandeja de pendientes\n\n' +
        'Las solicitudes de RRHH (campanita personal) no se tocan.',
    );
    if (!ok) return;
    setManagerResetBusy(true);
    try {
      const focus = await resetAlertsToManagerFocus(settingsBusinessId);
      const cleared = await resolveAllUnresolvedAlerts(businessId);
      if (dataUserId) {
        const docs = await fetchDocumentAlertsAsRecords(dataUserId, businessId).catch(() => []);
        if (docs.length > 0) {
          dismissDocumentAlerts(dataUserId, businessId, docs.map((d) => d.id));
        }
      }
      toast.success(
        `${focus.message || 'Modo gerente activo'} · ${cleared.updated} pendientes cerrados`,
      );
      setSelectedIds(new Set());
      await loadData({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aplicar el modo gerente');
    } finally {
      setManagerResetBusy(false);
    }
  }, [settingsBusinessId, businessId, dataUserId, managerResetBusy, loadData]);

  const handleDelete = useCallback(async (alertId: string) => {
    if (isSyntheticDocumentAlert(alertId)) {
      if (dataUserId) dismissDocumentAlert(dataUserId, businessId, alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      return;
    }
    try {
      await deleteAlertRequest(businessId, alertId);
      toast.success('Alerta eliminada');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error eliminando alerta');
    }
  }, [businessId, dataUserId, loadData]);

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

  const switchPageTab = useCallback((tab: AlertCenterPageTab) => {
    setPageTab(tab);
    setExpandedAlertId(null);
    setSelectedIds(new Set());
    setShowFilters(false);

    if (tab === 'history') {
      setFilters({ order: 'desc', page: 1, limit: 25 });
    } else if (tab === 'inbox') {
      setFilters({ status: 'new,seen', order: 'desc', page: 1, limit: 25 });
    }

    const next = new URLSearchParams(searchParams);
    if (tab === 'inbox') next.delete('tab');
    else if (tab === 'history') next.set('tab', 'historial');
    else next.set('tab', 'ajustes');
    navigate({ pathname: '/saas/alerts', search: next.toString() ? `?${next.toString()}` : '' }, { replace: true });
  }, [navigate, searchParams]);

  const syncAlerts = useCallback(async () => {
    if (!businessId) return;
    setSyncing(true);
    try {
      if (accountUserId) {
        await triggerAlertEngineCheck(accountUserId).catch(() => null);
      }
      await loadData();
      toast.success('Alertas actualizadas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error sincronizando alertas');
    } finally {
      setSyncing(false);
    }
  }, [businessId, accountUserId, loadData]);

  // Init department from ?department=
  useEffect(() => {
    const dept = searchParams.get('department');
    if (dept) setActiveDepartment(dept);
  }, [searchParams]);

  useEffect(() => {
    setPageTab(tabFromSearch(searchParams.get('tab')));
  }, [searchParams]);

  const layoutSubtitle = isSettings
    ? 'Solo avisos importantes: caja, equipo y operación'
    : isHistory
      ? 'Alertas ya resueltas'
      : 'Lo que necesita tu atención';

  const deptLabel = alertDepartments.find((d) => d.id === activeDepartment)?.label || 'Todas';

  return (
    <Layout title="Centro de alertas" subtitle={layoutSubtitle} noPadding>
      <div className="flex flex-col gap-2 px-2 pb-3 pt-1 md:gap-5 md:px-0 md:pb-0 md:pt-0">
        {/* Navegación principal — una sola fila */}
        <div className="flex items-center gap-2">
          <Tabs
            tabs={[
              { id: 'inbox', label: 'Bandeja', count: summary?.unresolved || undefined },
              { id: 'history', label: 'Historial', count: summary?.historyTotal || undefined },
              {
                id: 'settings',
                label: deliveryReviewPending ? 'Ajustes · Por revisar' : 'Ajustes',
                count: deliveryReviewPending ? (deliveryPendingCount || 1) : undefined,
              },
            ]}
            activeTab={pageTab}
            onChange={(id) => switchPageTab(id as AlertCenterPageTab)}
          />
          {!isSettings && (
            <button
              type="button"
              onClick={() => void syncAlerts()}
              disabled={loading || syncing}
              title="Actualizar"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 md:px-4 md:py-2.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading || syncing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Actualizar</span>
            </button>
          )}
        </div>

        {!isSettings && !isHistory && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/80 px-3 py-3 dark:border-blue-800 dark:bg-blue-950/30 md:px-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-blue-950 dark:text-blue-100">
                  ¿Demasiadas alertas?
                </p>
                <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-300">
                  Un clic: solo caja y lo esencial. Limpia la bandeja. RRHH no se toca.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  disabled={managerResetBusy || !businessId}
                  onClick={() => void handleClearPending()}
                  className="rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100"
                >
                  {managerResetBusy ? <RefreshCw className="inline h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Limpiar bandeja
                </button>
                <button
                  type="button"
                  disabled={managerResetBusy || !settingsBusinessId}
                  onClick={() => void handleManagerFocus()}
                  className="rounded-xl bg-[var(--v-blue,#2563eb)] px-3 py-2 text-xs font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                >
                  Solo importantes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Una sola cifra — sin panel de 4 KPIs de colores */}
        {!isSettings && summary && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-950">
            <Bell className="h-4 w-4 text-stone-400 shrink-0" />
            <p className="text-sm text-stone-700 dark:text-stone-200">
              <span className="font-black tabular-nums text-stone-900 dark:text-stone-50">
                {isHistory ? (summary.historyTotal ?? 0) : (summary.unresolved ?? 0)}
              </span>
              <span className="ml-1.5 text-stone-500">
                {isHistory ? 'en historial' : 'pendientes'}
              </span>
            </p>
            {!isHistory && (summary.byPriority?.high ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="h-3 w-3" />
                {summary.byPriority.high} urgentes
              </span>
            ) : null}
          </div>
        )}

        {/* Ajustes */}
        {isSettings ? (
          <AlertCenterAjustesView
            businessId={settingsBusinessId}
            onSaved={() => void loadData()}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:rounded-2xl">
            {/* Barra de herramientas */}
            <div className="space-y-2 border-b border-gray-100 p-3 dark:border-gray-700 md:space-y-3 md:p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
                {!isHistory && (
                  <div className="flex items-center gap-2 lg:w-56 shrink-0">
                    <label htmlFor="alert-dept" className="sr-only">Área</label>
                    <select
                      id="alert-dept"
                      value={activeDepartment}
                      onChange={(e) => selectDepartment(e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-800 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 md:rounded-xl md:px-3 md:py-2.5 md:text-sm"
                    >
                      {alertDepartments.map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 md:left-3 md:h-4 md:w-4" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={isHistory ? 'Buscar historial…' : 'Buscar alertas…'}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-white md:rounded-xl md:py-2.5 md:pl-10 md:pr-4 md:text-sm"
                    />
                  </div>

                  {!isHistory && (
                    <button
                      type="button"
                      onClick={() => setShowFilters(!showFilters)}
                      title="Filtros"
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition md:rounded-xl md:px-4 md:py-2.5 md:text-sm ${
                        showFilters
                          ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300'
                      }`}
                    >
                      <Filter className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      <span className="hidden sm:inline">Filtros</span>
                    </button>
                  )}
                </div>
              </div>

              {isHistory && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Desde</span>
                  <input
                    type="date"
                    value={historyFrom}
                    onChange={(e) => { setHistoryFrom(e.target.value); setFilters((p) => ({ ...p, page: 1 })); }}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                  />
                  <span className="text-xs font-medium text-gray-500">hasta</span>
                  <input
                    type="date"
                    value={historyTo}
                    onChange={(e) => { setHistoryTo(e.target.value); setFilters((p) => ({ ...p, page: 1 })); }}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                  />
                  <label className="ml-2 inline-flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={includeDeleted}
                      onChange={(e) => {
                        setIncludeDeleted(e.target.checked);
                        setFilters((p) => ({ ...p, page: 1 }));
                      }}
                      className="rounded border-gray-300"
                    />
                    Incluir eliminadas
                  </label>
                </div>
              )}

              {showFilters && !isHistory && (
                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(['new', 'seen', 'resolved'] as AlertStatus[]).map((s) => (
                        <Chip key={s} active={activeStatusFilters.includes(s)} onClick={() => toggleChipFilter('status', s)} label={STATUS_LABELS[s]} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Prioridad</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(['high', 'medium', 'low'] as AlertPriority[]).map((p) => (
                        <Chip key={p} active={activePriorityFilters.includes(p)} onClick={() => toggleChipFilter('priority', p)} label={PRIORITY_LABELS[p]} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lista */}
            <div className="space-y-2 p-3 md:space-y-3 md:p-4">
              {!isHistory && (
                <p className="hidden text-xs text-gray-500 dark:text-gray-400 sm:block">
                  Mostrando alertas de <span className="font-semibold text-gray-700 dark:text-gray-300">{deptLabel}</span>
                  {pagination.total > 0 && ` · ${pagination.total} en total`}
                </p>
              )}

              {!isHistory && selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900/80">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedIds.size} seleccionada{selectedIds.size > 1 ? 's' : ''}
                  </span>
                  <button type="button" disabled={bulkBusy} onClick={() => handleBulkStatus('seen')} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50">
                    <Eye className="h-3.5 w-3.5" /> Marcar vistas
                  </button>
                  <button type="button" disabled={bulkBusy} onClick={() => handleBulkStatus('resolved')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {bulkBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Resolver
                  </button>
                  <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {loading && alerts.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800">
                    <CheckCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Todo bajo control</p>
                  <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                    {isHistory
                      ? 'No hay alertas en el historial con estos filtros'
                      : `No hay alertas pendientes en ${deptLabel.toLowerCase()}`}
                  </p>
                  {!isHistory && (
                    <button
                      type="button"
                      onClick={() => switchPageTab('settings')}
                      className="mt-4 text-sm font-semibold text-gray-900 underline underline-offset-2 hover:no-underline dark:text-gray-100"
                    >
                      Configurar qué avisos recibir →
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {!isHistory && (
                    <div className="flex items-center gap-2 px-0.5 text-[11px] text-gray-500 md:px-1 md:text-xs">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === alerts.length && alerts.length > 0}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                      <span>Seleccionar todo</span>
                    </div>
                  )}

                  {alerts.map((alert) => (
                    <AlertPageRow
                      key={alert.id}
                      alert={alert}
                      historyMode={isHistory}
                      expanded={expandedAlertId === alert.id}
                      onToggleExpand={() => setExpandedAlertId((id) => (id === alert.id ? null : alert.id))}
                      selected={selectedIds.has(alert.id)}
                      onToggleSelect={() => toggleSelect(alert.id)}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                      onNavigate={(route) => navigate(route)}
                      compactMobile
                    />
                  ))}
                </>
              )}

              {pagination.pages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-700">
                  <span className="text-sm text-gray-500">
                    {pagination.total} alerta{pagination.total !== 1 ? 's' : ''} · Página {pagination.page} de {pagination.pages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pagination.page <= 1}
                      onClick={() => setFilters((p) => ({ ...p, page: (p.page || 1) - 1 }))}
                      className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-400"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={pagination.page >= pagination.pages}
                      onClick={() => setFilters((p) => ({ ...p, page: (p.page || 1) + 1 }))}
                      className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-400"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
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
  compactMobile = false,
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
  compactMobile?: boolean;
}) {
  const pColors = PRIORITY_COLORS[alert.priority] || PRIORITY_COLORS.medium;
  const sStyles = STATUS_STYLES[alert.status] || STATUS_STYLES.new;
  const SourceIcon = SOURCE_ICONS[alert.source] || Bell;
  const sourceColor = SOURCE_COLORS[alert.source as AlertSource] || '#71717a';
  const accent = PRIORITY_ACCENT[alert.priority] || PRIORITY_ACCENT.medium;
  const isDeleted = Boolean(alert.deletedAt);
  const mobileCompact = compactMobile && !historyMode;
  const isOpen = mobileCompact ? expanded : true;

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
      className={`rounded-lg border border-gray-200 bg-white transition-all dark:border-gray-700 dark:bg-gray-900/60 border-l-[3px] md:rounded-xl ${accent} ${
        historyMode ? '' : 'hover:border-gray-300 hover:shadow-sm dark:hover:border-gray-600'
      } ${alert.status === 'new' && !historyMode ? 'ring-1 ring-amber-500/20' : ''} ${
        isDeleted ? 'opacity-70' : ''
      }`}
    >
      <div
        className={`group flex items-start gap-2 p-2.5 pl-2 md:gap-3 md:p-4 md:pl-3.5 ${mobileCompact ? 'cursor-pointer' : ''}`}
        onClick={mobileCompact ? onToggleExpand : undefined}
        onKeyDown={mobileCompact ? (e) => { if (e.key === 'Enter' || e.key === ' ') onToggleExpand?.(); } : undefined}
        role={mobileCompact ? 'button' : undefined}
        tabIndex={mobileCompact ? 0 : undefined}
      >
        {!historyMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 md:mt-1 md:h-4 md:w-4"
          />
        )}

        <div className="flex-shrink-0 rounded-md p-1.5 md:rounded-lg md:p-2" style={{ backgroundColor: `${sourceColor}14` }}>
          <SourceIcon className="h-3.5 w-3.5 md:h-4 md:w-4" style={{ color: sourceColor }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                <h3 className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100 md:text-sm">
                  {alert.title}
                </h3>
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold md:px-2 md:text-[10px] ${pColors.bg} ${pColors.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${pColors.dot}`} />
                  {PRIORITY_LABELS[alert.priority]}
                </span>
                <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex ${sStyles.bg} ${sStyles.text}`}>
                  {alert.status === 'resolved' && <Check className="h-2.5 w-2.5" />}
                  {isDeleted ? 'Eliminada' : STATUS_LABELS[alert.status]}
                </span>
                <span className="hidden text-[10px] font-medium text-gray-400 md:inline">
                  {SOURCE_LABELS[alert.source as AlertSource] || alert.source}
                </span>
              </div>
              {isOpen && (
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400 md:text-sm">
                  {alert.message}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-400 md:mt-1.5 md:gap-3 md:text-xs">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo}
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
              {mobileCompact && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 md:hidden"
                  title={isOpen ? 'Contraer' : 'Expandir'}
                >
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
              {historyMode ? (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                  title="Ver historial"
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {!historyMode && alert.status !== 'resolved' && isOpen && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-2.5 py-2 dark:border-gray-700 md:gap-2 md:px-4 md:py-3">
          {alertHasNavigateTarget(alert) && alert.route && (
            <button
              type="button"
              onClick={() => onNavigate(alert.route!)}
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 dark:bg-gray-100 dark:text-gray-900 touch-manipulation md:min-w-[140px] md:flex-none md:px-3 md:py-2.5 md:text-xs"
            >
              <Eye className="h-3 w-3 md:h-3.5 md:w-3.5" />
              <span className="truncate">{getAlertResolveLabel(alert)}</span>
            </button>
          )}
          {alert.status === 'new' && (
            <button
              type="button"
              onClick={() => onStatusChange(alert.id, 'seen')}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 touch-manipulation md:px-3 md:py-2.5 md:text-xs"
            >
              <Eye className="h-3 w-3 md:h-3.5 md:w-3.5" />
              <span className="hidden sm:inline">Marcar vista</span>
              <span className="sm:hidden">Vista</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onStatusChange(alert.id, 'resolved')}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 touch-manipulation md:px-3 md:py-2.5 md:text-xs"
          >
            <CheckCircle className="h-3 w-3 md:h-3.5 md:w-3.5" />
            Resolver
          </button>
          <button
            type="button"
            onClick={() => onDelete(alert.id)}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 md:px-3 md:py-2"
            title="Eliminar del listado"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {historyMode && expanded && (
        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Línea temporal</p>
          <AlertHistoryTimeline entries={alert.statusHistory || []} compact />
        </div>
      )}
    </div>
  );
}
