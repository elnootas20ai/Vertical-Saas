import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Loader2,
  CheckCheck,
  ExternalLink,
  Info,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuthOptional } from '../../../context/AuthContext';
import {
  listNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  type NotificationRecord,
} from '../../../lib/notificationApi';

function formatWhen(iso: string) {
  try {
    const date = new Date(iso);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function WorkerNotifications() {
  const { t } = useTranslation();
  const user = useAuthOptional()?.user ?? null;
  const userId = user?.user_id || user?.id || '';

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    listNotificationsRequest(userId)
      .then((res) => {
        const list = (res as { notifications?: NotificationRecord[] }).notifications || [];
        setNotifications(list);
      })
      .catch((err: Error) => setError(err.message || 'No se pudieron cargar las notificaciones'))
      .finally(() => setLoading(false));
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkRead = async (notification: NotificationRecord) => {
    if (!userId || notification.read) return;
    try {
      await markNotificationReadRequest(userId, notification.id, true);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
    } catch {
      /* best-effort */
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsReadRequest(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al marcar como leídas');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <Layout title={t('worker.notifications.title')} subtitle={t('worker.notifications.subtitle')}>
      <div className="space-y-6">
        <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-5 py-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Aquí ves tus avisos in-app. También aparecen en el campanario de la barra superior.
            Las preferencias de email y push por categoría llegarán en una próxima actualización.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              {unreadCount > 0 ? (
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                  <BellOff className="w-5 h-5 text-gray-400" />
                </div>
              )}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {unreadCount > 0
                    ? `${unreadCount} sin leer`
                    : 'Todo al día'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {notifications.length} avisos en total
                </p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
              >
                {markingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4" />
                )}
                Marcar todas leídas
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="px-5 py-8 text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : notifications.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              No tienes notificaciones todavía.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {notifications.slice(0, 50).map((notification) => {
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className={`text-sm font-medium ${notification.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                        {notification.title}
                      </p>
                      <span className="text-xs text-gray-400 shrink-0">
                        {formatWhen(notification.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {notification.message}
                    </p>
                  </>
                );

                const className = `block px-5 py-4 transition-colors ${
                  notification.read
                    ? 'bg-white dark:bg-gray-800'
                    : 'bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`;

                if (notification.route) {
                  return (
                    <Link
                      key={notification.id}
                      to={notification.route}
                      onClick={() => handleMarkRead(notification)}
                      className={className}
                    >
                      {content}
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-2">
                        Ver detalle
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </Link>
                  );
                }

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleMarkRead(notification)}
                    className={`w-full text-left ${className}`}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
