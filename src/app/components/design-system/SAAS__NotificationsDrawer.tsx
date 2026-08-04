import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  X, Bell, CheckCircle, Clock, RefreshCw, ArrowRight,
  CalendarDays, AlertTriangle, Settings2, type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp, type AppNotification } from '../../context/AppContext';
import { useAuthOptional, type AuthContextType } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { isWorkerAccount } from '../../lib/authApi';
import { useModalClose } from '../../hooks/useModalClose';
import { useAlertCenterBusinessId } from '../../hooks/useAlertCenterBusinessId';
import { useAlertCenterSummary } from '../../hooks/useAlertCenterSummary';
import {
  fetchAlerts,
  updateAlertStatus,
  resolveAllUnresolvedAlerts,
  type AlertRecord,
} from '../../lib/alertCenterApi';
import {
  fetchDocumentAlertsAsRecords,
  mergeAlertLists,
  isSyntheticDocumentAlert,
  dismissDocumentAlert,
  dismissDocumentAlerts,
} from '../../lib/documentAlertsApi';
import { mapAlertsForBusinessVertical } from '../../lib/alertActions';
import { toast } from 'sonner';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { formatDateTimeEs } from '../../lib/formatDateEs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type InboxTab = 'positivas' | 'negativas';

function isPositiveAlert(n: AppNotification): boolean {
  if (n.polarity === 'positive') return true;
  if (n.excludeFromAlertCenter) return true;
  if (n.kind === 'activity' || n.kind === 'positive') return true;
  if (n.metadata?.polarity === 'positive') return true;
  if (n.metadata?.excludeFromAlertCenter === true) return true;
  if (n.metadata?.kind === 'activity' || n.metadata?.kind === 'positive') return true;
  return false;
}

function isRrhhPersonal(n: AppNotification): boolean {
  const title = String(n.title || '');
  const entity = String(n.entityType || '').toLowerCase();
  const cat = String(n.category || '').toLowerCase();
  return (
    entity === 'vacation' ||
    cat === 'clockin' ||
    /^nueva solicitud/i.test(title) ||
    /^solicitud /i.test(title) ||
    /^conflicto de solicitudes/i.test(title) ||
    /fich/i.test(title) ||
    /vacaci/i.test(title)
  );
}

function alertKind(n: AppNotification): { label: string; Icon: LucideIcon; tone: 'positive' | 'neutral' | 'negative' } {
  if (isPositiveAlert(n)) {
    return { label: 'Positiva', Icon: CheckCircle, tone: 'positive' };
  }
  if (/urgente/i.test(n.title || '') || n.level === 'alert') {
    return { label: 'Negativa', Icon: AlertTriangle, tone: 'negative' };
  }
  if (isRrhhPersonal(n) && /fich/i.test(n.title || '')) {
    return { label: 'Fichaje', Icon: Clock, tone: 'neutral' };
  }
  if (isRrhhPersonal(n)) {
    return { label: 'Equipo', Icon: CalendarDays, tone: 'neutral' };
  }
  return { label: 'Alerta', Icon: Bell, tone: 'neutral' };
}

function resolvePersonalRoute(n: { route?: string; entityType?: string; entityId?: string }): string {
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
}

function DrawerChrome({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[55]" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 w-full sm:max-w-md bg-white dark:bg-stone-950 shadow-2xl z-[60] flex flex-col pt-[env(safe-area-inset-top,0px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-stone-200 dark:border-stone-800 px-4 py-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-50">{title}</h2>
            <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-stone-200 dark:border-stone-800 p-3 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Bell className="mb-3 h-10 w-10 text-stone-300" />
      <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">{title}</p>
      <p className="mt-1 text-xs text-stone-500 max-w-[16rem]">{hint}</p>
    </div>
  );
}

function WorkerInbox({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useApp();
  useModalClose(isOpen, onClose);

  const unread = notifications.filter((n) => !n.read);
  const list = unread.length > 0 ? unread : notifications.slice(0, 30);

  const openOne = async (n: AppNotification) => {
    await markNotificationAsRead(n.id, true);
    const route = resolvePersonalRoute(n);
    if (route) {
      navigate(route);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <DrawerChrome
      title="Alertas"
      subtitle={unread.length > 0 ? `${unread.length} sin leer` : 'Todo al día'}
      onClose={onClose}
      footer={
        unread.length > 0 ? (
          <button
            type="button"
            onClick={() => void markAllNotificationsAsRead()}
            className={`w-full ${VERTIAL_BTN_PRIMARY}`}
          >
            <CheckCircle className="h-4 w-4" />
            Marcar todo leído
          </button>
        ) : null
      }
    >
      {list.length === 0 ? (
        <EmptyState title="Sin avisos" hint="Cuando haya algo de turno o equipo, saldrá aquí." />
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-900">
          {list.map((n) => {
            const kind = alertKind(n);
            const Icon = kind.Icon;
            const iconWrap =
              kind.tone === 'positive'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                : kind.tone === 'negative'
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                  : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300';
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void openOne(n)}
                  className={`w-full flex gap-3 px-4 py-3.5 text-left hover:bg-stone-50 dark:hover:bg-stone-900/60 ${
                    n.read ? 'opacity-60' : ''
                  }`}
                >
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                        {kind.label}
                      </span>
                      {!n.read ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--v-blue,#2563eb)]" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm font-semibold text-stone-900 dark:text-stone-50 line-clamp-1">
                      {n.title}
                    </span>
                    {n.message ? (
                      <span className="mt-0.5 block text-xs text-stone-500 line-clamp-2">{n.message}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DrawerChrome>
  );
}

function ManagerInbox({
  isOpen,
  onClose,
  user,
}: Props & { user: NonNullable<AuthContextType['user']> }) {
  const navigate = useNavigate();
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useApp();
  const currentBusiness = useBusinessOptional()?.currentBusiness;
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = useAlertCenterBusinessId();
  const { summary, reload: reloadSummary } = useAlertCenterSummary(businessId, {
    pollMs: isOpen ? 45_000 : 120_000,
  });
  const businessType = currentBusiness?.businessType;

  const [tab, setTab] = useState<InboxTab>('positivas');
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyIds = useRef(new Set<string>());
  const autoTabRef = useRef(false);
  useModalClose(isOpen, onClose);

  const positiveList = notifications
    .filter((n) => isPositiveAlert(n) || isRrhhPersonal(n) || !n.read)
    .slice(0, 40);
  const positiveUnreadCount = notifications.filter((n) => !n.read).length;
  const negativeCount = summary?.unresolved ?? 0;

  const loadNegativas = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await fetchAlerts(businessId, {
        status: 'new,seen',
        order: 'desc',
        page: 1,
        limit: 25,
      });
      let list = mapAlertsForBusinessVertical(res.alerts || [], businessType);
      if (dataUserId) {
        const docs = await fetchDocumentAlertsAsRecords(dataUserId, businessId).catch(() => []);
        list = mergeAlertLists(list, docs, 25);
      }
      setAlerts(list.filter((a) => a.status !== 'resolved'));
    } catch {
      toast.error('No se pudieron cargar las alertas');
    } finally {
      setLoading(false);
    }
  }, [businessId, businessType, dataUserId]);

  useEffect(() => {
    if (!isOpen) {
      autoTabRef.current = false;
      return;
    }
    if (autoTabRef.current) return;
    if (negativeCount > 0) {
      setTab('negativas');
      autoTabRef.current = true;
      return;
    }
    if (positiveUnreadCount > 0) {
      setTab('positivas');
      autoTabRef.current = true;
    }
  }, [isOpen, positiveUnreadCount, negativeCount]);

  useEffect(() => {
    if (!isOpen || tab !== 'negativas') return;
    void loadNegativas();
  }, [isOpen, tab, loadNegativas]);

  const openPersonal = async (n: AppNotification) => {
    await markNotificationAsRead(n.id, true);
    const route = resolvePersonalRoute(n);
    if (route) {
      navigate(route);
      onClose();
    }
  };

  const openAlert = async (alert: AlertRecord) => {
    if (!busyIds.current.has(alert.id) && alert.status === 'new') {
      busyIds.current.add(alert.id);
      try {
        if (isSyntheticDocumentAlert(alert.id)) {
          if (dataUserId) dismissDocumentAlert(dataUserId, businessId, alert.id);
        } else {
          await updateAlertStatus(businessId, alert.id, 'seen');
        }
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: 'seen' } : a)));
        await reloadSummary();
      } catch {
        /* best-effort */
      } finally {
        busyIds.current.delete(alert.id);
      }
    }
    if (alert.route?.startsWith('/')) {
      navigate(alert.route);
      onClose();
    }
  };

  const resolveOne = async (alertId: string) => {
    if (busyIds.current.has(alertId)) return;
    busyIds.current.add(alertId);
    try {
      if (isSyntheticDocumentAlert(alertId)) {
        if (dataUserId) dismissDocumentAlert(dataUserId, businessId, alertId);
      } else {
        await updateAlertStatus(businessId, alertId, 'resolved');
      }
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      await reloadSummary();
    } catch {
      toast.error('No se pudo cerrar');
    } finally {
      busyIds.current.delete(alertId);
    }
  };

  const clearNegativas = async () => {
    if (!businessId || busy) return;
    setBusy(true);
    try {
      const synthetic = alerts.filter((a) => isSyntheticDocumentAlert(a.id)).map((a) => a.id);
      if (synthetic.length && dataUserId) {
        dismissDocumentAlerts(dataUserId, businessId, synthetic);
      }
      await resolveAllUnresolvedAlerts(businessId);
      setAlerts([]);
      await reloadSummary();
      toast.success('Alertas negativas limpias');
    } catch {
      toast.error('No se pudo limpiar');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const subtitle =
    tab === 'positivas'
      ? positiveUnreadCount > 0
        ? `${positiveUnreadCount} sin leer`
        : 'Lo que salió bien'
      : negativeCount > 0
        ? `${negativeCount} pendientes`
        : 'Problemas a revisar';

  const showPositiveClear = tab === 'positivas' && positiveUnreadCount > 0;
  const showNegativeClear = tab === 'negativas' && (alerts.length > 0 || negativeCount > 0);
  const showNegativeOpen = tab === 'negativas';
  const hasFooter = showPositiveClear || showNegativeClear || showNegativeOpen;

  return (
    <DrawerChrome
      title="Alertas"
      subtitle={subtitle}
      onClose={onClose}
      footer={
        hasFooter ? (
          <>
            {showPositiveClear ? (
              <button
                type="button"
                onClick={() => void markAllNotificationsAsRead()}
                className={`w-full ${VERTIAL_BTN_PRIMARY}`}
              >
                <CheckCircle className="h-4 w-4" />
                Marcar todo leído
              </button>
            ) : null}
            {showNegativeClear ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearNegativas()}
                className={`w-full ${VERTIAL_BTN_SECONDARY}`}
              >
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Limpiar negativas
              </button>
            ) : null}
            {showNegativeOpen ? (
              <button
                type="button"
                onClick={() => {
                  navigate('/saas/alerts');
                  onClose();
                }}
                className={`w-full ${VERTIAL_BTN_PRIMARY}`}
              >
                Abrir centro de alertas
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : null}
            {showNegativeOpen ? (
              <button
                type="button"
                onClick={() => {
                  navigate('/saas/alerts?tab=settings');
                  onClose();
                }}
                className="w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 py-1"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Ajustes
              </button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <div className="sticky top-0 z-10 flex gap-1 border-b border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-950">
        {(
          [
            { id: 'positivas' as const, label: 'Positivas', count: positiveUnreadCount },
            { id: 'negativas' as const, label: 'Negativas', count: negativeCount },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 min-h-10 rounded-xl text-sm font-bold transition-colors ${
                active ? (t.id === 'positivas' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-900 dark:text-stone-300'
              }`}
            >
              {t.label}
              {t.count > 0 ? (
                <span className={`ml-1.5 tabular-nums ${active ? 'opacity-90' : 'text-stone-400'}`}>
                  {t.count > 99 ? '99+' : t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === 'positivas' ? (
        positiveList.length === 0 ? (
          <EmptyState
            title="Sin alertas positivas"
            hint="Aquí van avisos OK (caja cerrada, etc.), solicitudes y fichajes. Las alertas de problema están en Negocio."
          />
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-900">
            {positiveList.map((n) => {
              const kind = alertKind(n);
              const Icon = kind.Icon;
              const iconWrap =
                kind.tone === 'positive'
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : kind.tone === 'negative'
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                    : 'bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40';
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void openPersonal(n)}
                    className={`w-full flex gap-3 px-4 py-3.5 text-left hover:bg-stone-50 dark:hover:bg-stone-900/60 ${
                      n.read ? 'opacity-55' : ''
                    }`}
                  >
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                          {kind.label}
                        </span>
                        {!n.read ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--v-blue,#2563eb)]" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-sm font-semibold text-stone-900 dark:text-stone-50 line-clamp-1">
                        {n.title}
                      </span>
                      {n.message ? (
                        <span className="mt-0.5 block text-xs text-stone-500 line-clamp-2">{n.message}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : loading && alerts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Cargando…
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          title="Sin alertas negativas"
          hint="Aquí solo problemas: descuadres, impagos, caja sin cerrar, pedidos críticos."
        />
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-900">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-stretch gap-1 px-2 py-1">
              <button
                type="button"
                onClick={() => void openAlert(alert)}
                className="min-w-0 flex-1 flex gap-3 px-2 py-2.5 text-left rounded-xl hover:bg-stone-50 dark:hover:bg-stone-900/60"
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    alert.priority === 'high'
                      ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300'
                      : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                  }`}
                >
                  {alert.priority === 'high' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {alert.status === 'new' ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--v-blue,#2563eb)]" />
                    ) : null}
                    <span className="text-sm font-semibold text-stone-900 dark:text-stone-50 line-clamp-1">
                      {alert.title}
                    </span>
                  </span>
                  {alert.message ? (
                    <span className="mt-0.5 block text-xs text-stone-500 line-clamp-2">{alert.message}</span>
                  ) : null}
                  {alert.createdAt ? (
                    <span className="mt-1 block text-[10px] text-stone-400">
                      {formatDateTimeEs(alert.createdAt)}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                title="Cerrar aviso"
                onClick={() => void resolveOne(alert.id)}
                className="shrink-0 self-center p-2.5 rounded-xl text-stone-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
              >
                <CheckCircle className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </DrawerChrome>
  );
}

export function SAAS__NotificationsDrawer({ isOpen, onClose }: Props) {
  const auth = useAuthOptional();
  if (!auth?.user) return null;

  if (isWorkerAccount(auth.user)) {
    return <WorkerInbox isOpen={isOpen} onClose={onClose} />;
  }

  if (!isOpen) return null;

  return <ManagerInbox isOpen={isOpen} onClose={onClose} user={auth.user} />;
}
