import { useCallback, useEffect, useState } from 'react';
import {
  X, Bell, CheckCircle, AlertCircle, Info, Clock,
  ArrowRight, RefreshCw, Bike, DollarSign, Users, Activity,
  Eye, Settings2, Building2, Layers, Sparkles, Shield,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
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
} from '../../lib/documentAlertsApi';

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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col" onClick={(e) => e.stopPropagation()}>
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
          <div className="border-t px-6 py-4">
            <button onClick={() => void markAllNotificationsAsRead()} className="w-full text-sm font-medium text-blue-600">
              Marcar todas como leídas
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function AlertCenterDrawer({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = useAlertCenterBusinessId();
  const { departments, departmentSourceFilter, vertical } = useAlertDepartments();
  const { summary, reload: reloadSummary } = useAlertCenterSummary(businessId, {
    pollMs: isOpen ? 30_000 : 60_000,
    dataUserId,
  });

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeDept, setActiveDept] = useState('all');
  useModalClose(isOpen, onClose);

  const loadAlerts = useCallback(async (deptId = activeDept) => {
    if (!businessId) return;
    setLoading(true);
    try {
      const sourceFilter = departmentSourceFilter(deptId);
      const includeDocs = shouldIncludeDocumentAlerts(sourceFilter);
      const [res, docAlerts] = await Promise.all([
        fetchAlerts(businessId, {
          status: 'new,seen',
          order: 'desc',
          page: 1,
          limit: 20,
          ...(sourceFilter ? { source: sourceFilter } : {}),
        }),
        includeDocs && dataUserId
          ? fetchDocumentAlertsAsRecords(dataUserId, businessId)
          : Promise.resolve([]),
      ]);
      setAlerts(mergeAlertLists(res.alerts || [], docAlerts, 20));
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [businessId, activeDept, dataUserId, departmentSourceFilter]);

  const syncAndReload = useCallback(async () => {
    if (!businessId) return;
    setSyncing(true);
    try {
      const accountUserId = user?.user_id || user?.id || '';
      if (accountUserId) {
        await triggerAlertEngineCheck(accountUserId).catch(() => null);
      }
      await Promise.all([reloadSummary(), loadAlerts(activeDept)]);
    } finally {
      setSyncing(false);
    }
  }, [businessId, user?.user_id, user?.id, reloadSummary, loadAlerts, activeDept]);

  useEffect(() => {
    if (!isOpen || !businessId) return;
    void syncAndReload();
  }, [isOpen, businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen && businessId) void loadAlerts(activeDept);
  }, [activeDept, isOpen, businessId, loadAlerts]);

  const handleAlertClick = async (alert: AlertRecord) => {
    if (alert.status === 'new' && !isSyntheticDocumentAlert(alert.id)) {
      try {
        await updateAlertStatus(businessId, alert.id, 'seen');
      } catch { /* silent */ }
    }
    if (alert.route) {
      navigate(alert.route);
      onClose();
    } else {
      navigate('/saas/alerts');
      onClose();
    }
  };

  const markAllSeen = async () => {
    const newIds = alerts.filter((a) => a.status === 'new' && !isSyntheticDocumentAlert(a.id)).map((a) => a.id);
    if (newIds.length === 0) return;
    try {
      await bulkUpdateAlertStatus(businessId, newIds, 'seen');
      await Promise.all([reloadSummary(), loadAlerts(activeDept)]);
    } catch { /* silent */ }
  };

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

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />

      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-zinc-50 dark:bg-zinc-950 shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
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
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : alerts.length === 0 ? (
            <AlertProEmpty label={`Sin alertas en ${departments.find((d) => d.id === activeDept)?.label || 'esta área'}`} />
          ) : (
            alerts.map((alert) => (
              <AlertProRow key={alert.id} alert={alert} onClick={() => void handleAlertClick(alert)} />
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2">
          {newCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllSeen()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              <Eye className="w-4 h-4" />
              Marcar visibles como leídas
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
  const { user } = useAuth();
  const isWorker = isWorkerAccount(user);

  if (isWorker) {
    return <LegacyNotificationsDrawer isOpen={isOpen} onClose={onClose} />;
  }

  return <AlertCenterDrawer isOpen={isOpen} onClose={onClose} />;
}
