import { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useApp, SubscriptionStatus } from '../../context/AppContext';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';

interface SubscriptionGuardProps {
  children: ReactNode;
  allowedStatuses?: SubscriptionStatus[];
  fallbackPath?: string;
  showBlockedScreen?: boolean;
}

export function SubscriptionGuard({ 
  children, 
  allowedStatuses = ['trial_active', 'trial_expiring', 'subscription_active'],
  fallbackPath = '/saas/suspended',
  showBlockedScreen = false
}: SubscriptionGuardProps) {
  const { subscription } = useApp();
  const iosAccessOnly = isIosCustomerAccessOnlyApp();

  const isAllowed = allowedStatuses.includes(subscription.status);

  if (!isAllowed) {
    if (showBlockedScreen) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 border-2 border-red-200 rounded-2xl p-8 text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Acceso restringido
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Esta funcionalidad no está disponible con tu estado de suscripción actual.
            </p>
            {!iosAccessOnly ? (
              <a
                href="/saas/billing"
                className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
              >
                Ver Mi plan
              </a>
            ) : (
              <p className="text-sm text-gray-500">
                En iOS no se gestiona el cobro. Contacta con soporte@vertialapp.com
              </p>
            )}
          </div>
        </div>
      );
    }
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}
