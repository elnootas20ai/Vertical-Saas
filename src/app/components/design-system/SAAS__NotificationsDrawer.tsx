import { X, Bell, CheckCircle, AlertCircle, Info, Clock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SAAS__NotificationsDrawer({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useApp();
  useModalClose(isOpen, onClose);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const getIcon = (level: 'success' | 'warning' | 'info' | 'alert') => {
    switch (level) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-amber-600" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />;
      case 'alert':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getBackgroundColor = (level: 'success' | 'warning' | 'info' | 'alert') => {
    switch (level) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
      case 'alert':
        return 'bg-red-50 border-red-200';
    }
  };

  const formatTimestamp = (createdAt: string) => {
    const now = Date.now();
    const then = new Date(createdAt).getTime();
    const diff = now - then;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    return `Hace ${days}d`;
  };

  const resolveRoute = (notification: { route?: string; entityType?: string; entityId?: string }): string => {
    if (notification.route && notification.route.startsWith('/saas/')) return notification.route;
    if (!notification.entityType || !notification.entityId) return '';
    const id = encodeURIComponent(notification.entityId);
    const routeMap: Record<string, string> = {
      sale: `/saas/sales/${id}`,
      vehicle: `/saas/vehicles/${id}`,
      document: `/saas/documents/${id}`,
      lead: `/saas/clients?tab=leads&leadId=${id}`,
      client: `/saas/clients/${id}`,
      team: `/saas/team/${id}`,
      workorder: `/saas/workshop/${id}`,
      quote: `/saas/quotes`,
      order: `/saas/orders`,
      invoice: `/saas/client-billing`,
      supplier: `/saas/suppliers`,
      supplier_invoice: `/saas/supplier-billing`,
      purchase_order: `/saas/purchase-orders`,
      appointment: `/saas/calendar`,
      reservation: `/saas/reservations`,
    };
    return routeMap[notification.entityType] || '';
  };

  const handleNotificationClick = async (n: { id: string; entityId?: string; entityType?: string; route?: string }) => {
    try {
      await markNotificationAsRead(n.id, true);
    } catch { /* silent */ }
    const route = resolveRoute(n);
    if (route && route.startsWith('/')) {
      navigate(route, {
        state: n.entityId ? { notificationEntityId: n.entityId, notificationEntityType: n.entityType } : undefined,
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Notificaciones</h2>
              {unreadCount > 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-400">{unreadCount} sin leer</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4">
          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-2 rounded-xl transition-all cursor-pointer hover:shadow-md ${
                    getBackgroundColor(notification.level)
                  } ${notification.read ? 'opacity-70' : ''}`}
                  onClick={() => {
                    void handleNotificationClick(notification);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(notification.level)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                          {notification.title}
                        </h3>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(notification.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Bell className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Sin notificaciones
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                No tienes notificaciones en este momento
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {notifications.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
            <button
              onClick={() => {
                void markAllNotificationsAsRead();
              }}
              className="w-full px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Marcar todas como leídas
            </button>
          </div>
        )}
      </div>
    </>
  );
}
