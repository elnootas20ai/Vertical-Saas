import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Bell, CheckCircle, AlertCircle, Info, Clock,
  ArrowRight, RefreshCw, Bike, DollarSign, Users, Activity,
  Eye, Settings2, Building2, Layers, Sparkles, Shield,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { useAuthOptional, type AuthContextType } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { isWorkerAccount } from '../../lib/authApi';
import { useModalClose } from '../../hooks/useModalClose';
import { useAlertCenterBusinessId } from '../../hooks/useAlertCenterBusinessId';
import { useAlertCenterSummary } from '../../hooks/useAlertCenterSummary';
import { useAlertDepartments } from '../../hooks/useAlertDepartments';
import {
  AlertProShell,
  AlertProKpiStrip,
  AlertProDeptTabs,
  AlertProRow,
  AlertProEmpty,
  AlertProIconButton,
} from '../saas/alertCenterProUi';
import {
  fetchAlerts,
  bulkUpdateAlertStatus,
  updateAlertStatus,
  triggerAlertEngineCheck,
  type AlertRecord,
} from '../../lib/alertCenterApi';
import {
  fetchDocumentAlertsAsRecords,
  mergeAlertLists,
  shouldIncludeDocumentAlerts,
  isSyntheticDocumentAlert,
  dismissDocumentAlert,
  dismissDocumentAlerts,
} from '../../lib/documentAlertsApi';
import { getAlertResolveLabel, alertHasNavigateTarget } from '../../lib/alertActions';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const DEPT_ICONS: Record<string, typeof Bell> = {
  all: Bell,
  pdvs: Building2,
  delivery: Bike,
  finanzas: DollarSign,
  rrhh: Users,
  catalogProviders: Layers,
  documentacion: Shield,
  operaciones: Activity,
  limpieza: Sparkles,
  construccion: Building2,
  verticales: Layers,
  sistema: Shield,
};

function LegacyNotificationsDrawer({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useApp();
  useModalClose(isOpen, onClose);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (level: 'success' | 'warning' | 'info' | 'alert') => {
    switch (level) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-amber-600" />;
      case 'info': return <Info className="w-5 h-5 text-blue-600" />;
      case 'alert': return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const resolveRoute = (n: { route?: string; entityType?: string; entityId?: string }): string => {
    if (n.route?.startsWith('/saas/')) return n.route;
    if (!n.entityType || !n.entityId) return '';
    const id = encodeURIComponent(n.entityId);
    const routeMap: Record<string, string> = {
      sale: `/saas/sales/${id}`,
      vehicle: `/saas/vehicles/${id}`,
      lead: `/saas/clients?tab=leads&leadId=${id}`,
      client: `/saas/clients/${id}`,
    };
    return routeMap[n.entityType] || '';
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55]" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 w-full sm:max-w-md bg-white dark:bg-gray-800 shadow-2xl z-[60] flex flex-col pt-[env(safe-area-inset-top,0px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Notificaciones</h2>
              {unreadCount > 0 && <p className="text-xs text-gray-600 dark:text-gray-400">{unreadCount} sin leer</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 border-2 rounded-xl cursor-pointer ${n.read ? 'opacity-70' : ''}`}
                  onClick={async () => {
                    await markNotificationAsRead(n.id, true);
                    const route = resolveRoute(n);
                    if (route) { navigate(route); onClose(); }
                  }}
                >
                  <div className="flex gap-3">
                    {getIcon(n.level)}
                    <div>
                      <h3 className="font-semibold text-sm">{n.title}</h3>
                      <p className="text-sm text-gray-600">{n.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <Bell className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-gray-600">Sin notificaciones</p>
            </div>
          )}
        </div>
        {notifications.length > 0 && (
          <div className="border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button onClick={() => void markAllNotificationsAsRead()} className="w-full text-sm font-medium text-blue-600">
              Marcar todas como leídas
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function AlertCenterDrawer({
  isOpen,
  onClose,
  user,
}: Props & { user: NonNullable<AuthContextType['user']> }) {
  const navigate = useNavigate();
  const currentBusiness = useBusinessOptional()?.currentBusiness;
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = useAlertCenterBusinessId();
  const { departments, departmentSourceFilter, vertical } = useAlertDepartments();
  const { summary, reload: reloadSummary } = useAlertCenterSummary(businessId, {
    pollMs: isOpen ? 30_000 : 60_000,
  });

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [activeDept, setActiveDept] = useState('all');
  const busyAlertIds = useRef(new Set<string>());
  const loadInflightRef = useRef<Promise<void> | null>(null);
  const loadSeqRef = useRef(0);
  useModalClose(isOpen, onClose);

  const loadAlerts = useCallback(async (deptId = activeDept, options?: { silent?: boolean }) => {
    if (!businessId) return;

    if (loadInflightRef.current) {
      return loadInflightRef.current;
    }

    const silent = options?.silent === true;
    const seq = ++loadSeqRef.current;
    if (!silent) setLoading(true);

    const run = async () => {
      try {
        const sourceFilter = departmentSourceFilter(deptId);
        const includeDocs = shouldIncludeDocumentAlerts(sourceFilter);
        const res = await fetchAlerts(businessId, {
          status: 'new,seen',
          order: 'desc',
          page: 1,
          limit: 20,
          ...(sourceFilter ? { source: sourceFilter } : {}),
        });
        if (seq !== loadSeqRef.current) return;

        const serverAlerts = res.alerts || [];
        setAlerts(serverAlerts);

        if (includeDocs && dataUserId) {
          const docAlerts = await fetchDocumentAlertsAsRecords(dataUserId, businessId);
          if (seq !== loadSeqRef.current) return;
          setAlerts(mergeAlertLists(serverAlerts, docAlerts, 20));
        }
      } catch {
        if (seq === loadSeqRef.current) {
          toast.error('No se pudieron cargar las alertas');
        }
      } finally {
        if (seq === loadSeqRef.current && !silent) setLoading(false);
      }
    };

    const promise = run().finally(() => {
      if (loadInflightRef.current === promise) {
        loadInflightRef.current = null;
      }
    });
    loadInflightRef.current = promise;
    return promise;
  }, [businessId, activeDept, dataUserId, departmentSourceFilter]);

  const syncAndReload = useCallback(async () => {
    if (!businessId || syncing) return;
    setSyncing(true);
    try {
      const accountUserId = user?.user_id || user?.id || '';
      if (accountUserId) {
        await triggerAlertEngineCheck(accountUserId).catch(() => null);
      }
      await Promise.all([reloadSummary(), loadAlerts(activeDept, { silent: true })]);
    } finally {
      setSyncing(false);
    }
  }, [businessId, user?.user_id, user?.id, reloadSummary, loadAlerts, activeDept, syncing]);

  useEffect(() => {
    if (!isOpen || !businessId) return;
    void loadAlerts(activeDept, { silent: alerts.length > 0 });
  }, [isOpen, businessId, activeDept, loadAlerts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) {
      loadSeqRef.current += 1;
      setLoading(false);
    }
  }, [isOpen]);

  const handleNavigate = useCallback(
    (route: string) => {
      if (route.startsWith('/')) {
        navigate(route);
      } else {
        navigate(`/saas/${route.replace(/^\//, '')}`);
      }
      onClose();
    },
    [navigate, onClose],
  );

  const applyLocalStatus = useCallback(
    (alertId: string, status: 'seen' | 'resolved') => {
      setAlerts((prev) =>
        status === 'resolved'
          ? prev.filter((a) => a.id !== alertId)
          : prev.map((a) => (a.id === alertId ? { ...a, status } : a)),
      );
    },
    [],
  );

  const handleMarkSeen = useCallback(
    async (alertId: string) => {
      if (busyAlertIds.current.has(alertId)) return;
      busyAlertIds.current.add(alertId);
      try {
        if (isSyntheticDocumentAlert(alertId)) {
          if (dataUserId) dismissDocumentAlert(dataUserId, businessId, alertId);
          applyLocalStatus(alertId, 'seen');
          await reloadSummary();
          return;
        }
        await updateAlertStatus(businessId, alertId, 'seen');
        applyLocalStatus(alertId, 'seen');
        await reloadSummary();
      } catch {
        toast.error('No se pudo marcar como vista');
      } finally {
        busyAlertIds.current.delete(alertId);
      }
    },
    [businessId, dataUserId, applyLocalStatus, reloadSummary],
  );

  const handleResolve = useCallback(
    async (alertId: string) => {
      if (busyAlertIds.current.has(alertId)) return;
      busyAlertIds.current.add(alertId);
      try {
        if (isSyntheticDocumentAlert(alertId)) {
          if (dataUserId) dismissDocumentAlert(dataUserId, businessId, alertId);
          applyLocalStatus(alertId, 'resolved');
          toast.success('Alerta archivada');
          await reloadSummary();
          return;
        }
        await updateAlertStatus(businessId, alertId, 'resolved');
        applyLocalStatus(alertId, 'resolved');
        toast.success('Alerta resuelta');
        await reloadSummary();
      } catch {
        toast.error('No se pudo resolver la alerta');
      } finally {
        busyAlertIds.current.delete(alertId);
      }
    },
    [businessId, dataUserId, applyLocalStatus, reloadSummary],
  );

  const markAllSeen = async () => {
    if (bulkBusy) return;
    const newIds = alerts.filter((a) => a.status === 'new' && !isSyntheticDocumentAlert(a.id)).map((a) => a.id);
    const syntheticIds = alerts.filter((a) => a.status === 'new' && isSyntheticDocumentAlert(a.id)).map((a) => a.id);
    if (newIds.length === 0 && syntheticIds.length === 0) return;
    setBulkBusy(true);
    try {
      if (syntheticIds.length && dataUserId) {
        dismissDocumentAlerts(dataUserId, businessId, syntheticIds);
        setAlerts((prev) => prev.map((a) => (syntheticIds.includes(a.id) ? { ...a, status: 'seen' as const } : a)));
      }
      if (newIds.length) {
        await bulkUpdateAlertStatus(businessId, newIds, 'seen');
      }
      await Promise.all([reloadSummary(), loadAlerts(activeDept, { silent: true })]);
    } catch {
      toast.error('No se pudieron marcar como vistas');
    } finally {
      setBulkBusy(false);
    }
  };

  const resolveAllVisible = useCallback(async () => {
    if (!businessId || bulkBusy) return;
    const pending = alerts.filter((a) => a.status !== 'resolved');
    if (pending.length === 0) return;

    const syntheticIds = pending.filter((a) => isSyntheticDocumentAlert(a.id)).map((a) => a.id);
    const realIds = pending.filter((a) => !isSyntheticDocumentAlert(a.id)).map((a) => a.id);

    setBulkBusy(true);
    try {
      if (syntheticIds.length && dataUserId) {
        dismissDocumentAlerts(dataUserId, businessId, syntheticIds);
      }

      setAlerts([]);

      let updated = 0;
      let errors = 0;
      if (realIds.length) {
        const result = await bulkUpdateAlertStatus(businessId, realIds, 'resolved');
        updated = result.updated ?? 0;
        errors = result.errors ?? 0;
      }

      const totalOk = updated + syntheticIds.length;
      if (errors > 0) {
        toast.warning(`${totalOk} resueltas · ${errors} no se pudieron guardar`);
      } else {
        toast.success(`${totalOk} alerta${totalOk !== 1 ? 's' : ''} resuelta${totalOk !== 1 ? 's' : ''}`);
      }

      await Promise.all([reloadSummary(), loadAlerts(activeDept, { silent: true })]);
    } catch {
      toast.error('Error al resolver alertas');
      await loadAlerts(activeDept, { silent: true });
    } finally {
      setBulkBusy(false);
    }
  }, [alerts, bulkBusy, businessId, dataUserId, activeDept, reloadSummary, loadAlerts]);

  const goFullCenter = () => {
    navigate('/saas/alerts');
    onClose();
  };

  const goAjustes = () => {
    navigate('/saas/alerts?tab=ajustes');
    onClose();
  };

  if (!isOpen) return null;

  const highCount = summary?.byPriority?.high ?? 0;
  const unresolved = summary?.unresolved ?? 0;
  const newCount = summary?.byStatus?.new ?? 0;
  const visiblePending = alerts.filter((a) => a.status !== 'resolved').length;
  const listNote =
    unresolved > visiblePending && visiblePending > 0
      ? `Mostrando ${visiblePending} de ${unresolved} pendientes`
      : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55]" onClick={onClose} />

      <div
        className="fixed inset-y-0 right-0 w-full sm:max-w-md bg-zinc-50 dark:bg-zinc-950 shadow-2xl z-[60] flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 pt-[env(safe-area-inset-top,0px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <AlertProShell
          compact
          title="Centro de alertas"
          subtitle="Stock · Finanzas · RRHH · Documentación"
          badge={unresolved > 0 ? (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900/50">
              {unresolved > 99 ? '99+' : unresolved} activas
            </span>
          ) : undefined}
          actions={(
            <>
              <AlertProIconButton title="Ajustes de alertas" onClick={goAjustes}>
                <Settings2 className="w-4 h-4" />
              </AlertProIconButton>
              <AlertProIconButton title="Actualizar" onClick={() => void syncAndReload()} disabled={syncing}>
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              </AlertProIconButton>
              <AlertProIconButton title="Cerrar" onClick={onClose}>
                <X className="w-4 h-4" />
              </AlertProIconButton>
            </>
          )}
          kpis={(
            <AlertProKpiStrip
              compact
              unresolved={unresolved}
              high={highCount}
              newCount={newCount}
            />
          )}
        />

        <AlertProDeptTabs
          compact
          summary={summary}
          activeId={activeDept}
          onChange={setActiveDept}
          icons={DEPT_ICONS}
          departments={departments}
          vertical={vertical}
        />

        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-zinc-50 dark:bg-zinc-950">
          {listNote && (
            <p className="px-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {listNote}
            </p>
          )}
          {bulkBusy ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Resolviendo alertas…
            </div>
          ) : loading && alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
              Cargando alertas…
            </div>
          ) : alerts.length === 0 ? (
            <AlertProEmpty label={`Sin alertas en ${departments.find((d) => d.id === activeDept)?.label || 'esta área'}`} />
          ) : (
            alerts.map((alert) => (
              <AlertProRow
                key={alert.id}
                alert={alert}
                showActions
                showArrow={false}
                onNavigate={handleNavigate}
                onMarkSeen={(id) => void handleMarkSeen(id)}
                onResolve={(id) => void handleResolve(id)}
              />
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {newCount > 0 && (
            <button
              type="button"
              disabled={bulkBusy || syncing}
              onClick={() => void markAllSeen()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              <Eye className="w-4 h-4" />
              Marcar todas como vistas
            </button>
          )}
          {alerts.some((a) => a.status !== 'resolved') && (
            <button
              type="button"
              disabled={bulkBusy || syncing}
              onClick={() => void resolveAllVisible()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 py-2.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition disabled:opacity-50"
            >
              {bulkBusy ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {bulkBusy ? 'Resolviendo…' : 'Resolver todas visibles'}
            </button>
          )}
          <button
            type="button"
            onClick={goAjustes}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-md shadow-violet-500/20 transition hover:from-violet-500 hover:to-indigo-500"
          >
            <Settings2 className="w-4 h-4" />
            Ajustes de alertas
          </button>
          <button
            type="button"
            onClick={goFullCenter}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200 transition hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Abrir centro completo
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { navigate('/saas/alerts?tab=historial'); onClose(); }}
            className="w-full text-center text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 py-1"
          >
            Ver historial de alertas
          </button>
        </div>
      </div>
    </>
  );
}

export function SAAS__NotificationsDrawer({ isOpen, onClose }: Props) {
  const auth = useAuthOptional();
  if (!auth?.user) return null;

  if (isWorkerAccount(auth.user)) {
    return <LegacyNotificationsDrawer isOpen={isOpen} onClose={onClose} />;
  }

  if (!isOpen) return null;

  return <AlertCenterDrawer isOpen={isOpen} onClose={onClose} user={auth.user} />;
}
