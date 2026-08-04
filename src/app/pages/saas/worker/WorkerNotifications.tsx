import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Loader2,
  CheckCheck,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useApp } from '../../../context/AppContext';
import { useAuthOptional } from '../../../context/AuthContext';
import { formatDateTimeEs } from '../../../lib/formatDateEs';
import { WORKER_PAGE } from '../../../lib/workerUi';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

function docKindLabel(n: { title?: string; entityType?: string; metadata?: Record<string, unknown> }) {
  const title = String(n.title || '');
  const docType = String(n.metadata?.documentType || '').toLowerCase();
  if (docType === 'contrato' || /^nuevo contrato/i.test(title)) return 'Contrato';
  if (docType === 'nomina' || /nómina|nomina/i.test(title)) return 'Nómina';
  if (n.entityType === 'payroll' || /documento|certificado|justificante/i.test(title)) return 'Documento';
  return 'Aviso';
}

export function WorkerNotifications() {
  const user = useAuthOptional()?.user ?? null;
  const userId = user?.user_id || user?.id || '';
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useApp();

  const [tab, setTab] = useState<'alertas' | 'todas'>('alertas');
  const [markingAll, setMarkingAll] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const tmr = window.setTimeout(() => setBooting(false), 200);
    return () => window.clearTimeout(tmr);
  }, [userId]);

  const unread = useMemo(() => notifications.filter((n) => !n.read), [notifications]);
  const unreadCount = unread.length;
  const visible = tab === 'alertas' ? unread : notifications;

  useEffect(() => {
    if (unreadCount === 0) setTab('todas');
  }, [unreadCount]);

  const handleMarkRead = async (id: string) => {
    await markNotificationAsRead(id, true);
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsAsRead();
      setTab('todas');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <Layout title="Tus alertas" subtitle="Nóminas, contratos y avisos de la empresa">
      <div className={`${WORKER_PAGE} sm:space-y-4`}>
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3.5 dark:border-stone-800">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  unreadCount > 0
                    ? 'bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40'
                    : 'bg-stone-100 text-stone-400 dark:bg-stone-800'
                }`}
              >
                {unreadCount > 0 ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-stone-900 dark:text-white">
                  {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
                </h3>
                <p className="text-xs text-stone-500">
                  {notifications.length} aviso{notifications.length !== 1 ? 's' : ''} en total
                </p>
              </div>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                disabled={markingAll}
                className={`${VERTIAL_BTN_SECONDARY} !min-h-11 !px-3 !text-xs`}
              >
                {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Limpiar
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 border-b border-stone-100 px-4 py-2.5 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setTab('alertas')}
              className={`min-h-10 rounded-xl px-3 text-xs font-bold ${
                tab === 'alertas'
                  ? 'bg-[var(--v-blue,#2563eb)] text-white'
                  : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
              }`}
            >
              Sin leer ({unreadCount})
            </button>
            <button
              type="button"
              onClick={() => setTab('todas')}
              className={`min-h-10 rounded-xl px-3 text-xs font-bold ${
                tab === 'todas'
                  ? 'bg-[var(--v-blue,#2563eb)] text-white'
                  : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
              }`}
            >
              Todas
            </button>
          </div>

          {booting ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--v-blue,#2563eb)]" />
            </div>
          ) : visible.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-stone-300" />
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">
                {tab === 'alertas' ? 'Nada pendiente' : 'Aún no hay avisos'}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Cuando publiquen una nómina o un contrato, te llega aquí y a la campanita.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {visible.slice(0, 60).map((notification) => {
                const kind = docKindLabel(notification);
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                        {kind}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-stone-400">
                        {formatDateTimeEs(notification.createdAt)}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 text-[15px] font-semibold ${
                        notification.read
                          ? 'text-stone-600 dark:text-stone-400'
                          : 'text-stone-900 dark:text-white'
                      }`}
                    >
                      {notification.title}
                    </p>
                    {notification.message ? (
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        {notification.message}
                      </p>
                    ) : null}
                  </>
                );

                const className = `block min-h-[72px] px-4 py-3.5 transition-colors active:bg-stone-50 dark:active:bg-stone-900/50 ${
                  notification.read
                    ? 'bg-white dark:bg-stone-950'
                    : 'bg-blue-50/50 dark:bg-blue-950/15'
                }`;

                if (notification.route) {
                  return (
                    <li key={notification.id}>
                      <Link
                        to={notification.route}
                        onClick={() => void handleMarkRead(notification.id)}
                        className={className}
                      >
                        {body}
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--v-blue,#2563eb)]">
                          Abrir
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </Link>
                    </li>
                  );
                }

                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(notification.id)}
                      className={`w-full text-left ${className}`}
                    >
                      {body}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={markingAll}
            className={`w-full md:hidden ${VERTIAL_BTN_PRIMARY}`}
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Marcar todo leído
          </button>
        ) : null}
      </div>
    </Layout>
  );
}
