import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, CreditCard, Clock, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function SubscriptionBanner() {
  const { subscription } = useApp();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    // Reset dismissed when status changes
    setDismissed(false);
  }, [subscription.status]);

  useEffect(() => {
    if (subscription.status === 'grace_period' && subscription.gracePeriodEndsAt) {
      const interval = setInterval(() => {
        const now = Date.now();
        const end = new Date(subscription.gracePeriodEndsAt!).getTime();
        const diff = end - now;

        if (diff <= 0) {
          setTimeLeft('Expirado');
          clearInterval(interval);
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          setTimeLeft(`${hours}h ${minutes}m`);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [subscription.status, subscription.gracePeriodEndsAt]);

  if (dismissed) return null;

  // Trial active banner (countdown of 14 days)
  if (subscription.status === 'trial_active' && subscription.trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft > 0 && daysLeft <= 14) {
      return (
        <div className="bg-blue-50 dark:bg-blue-950/80 border-b-2 border-blue-200 dark:border-blue-800">
          <div className="px-4 md:px-6 py-2 md:py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="w-4 h-4 text-blue-700 dark:text-blue-400 flex-shrink-0" />
                <span className="text-xs md:text-sm font-semibold text-blue-900 dark:text-blue-200 truncate">
                  Periodo de prueba: {daysLeft} {daysLeft === 1 ? 'día' : 'días'} restantes
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => navigate('/saas/billing')}
                  className="px-3 py-1.5 bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 text-white font-medium rounded-lg transition-colors text-xs whitespace-nowrap"
                >
                  Activar suscripción
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  // Trial expiring banner (<=3 days)
  if (subscription.status === 'trial_expiring' && subscription.trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    return (
      <div className="bg-amber-100 dark:bg-amber-950/80 border-b-2 border-amber-300 dark:border-amber-800">
        <div className="px-4 md:px-6 py-2 md:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0" />
              <span className="text-xs md:text-sm font-semibold text-amber-900 dark:text-amber-200 truncate">
                Prueba termina en {daysLeft} {daysLeft === 1 ? 'día' : 'días'}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => navigate('/saas/billing')}
                className="px-3 py-1.5 bg-amber-700 dark:bg-amber-600 hover:bg-amber-800 dark:hover:bg-amber-500 text-white font-medium rounded-lg transition-colors text-xs whitespace-nowrap"
              >
                Ver planes
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1 hover:bg-amber-200 dark:hover:bg-amber-900 rounded transition-colors"
              >
                <X className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Payment failed banner
  if (subscription.status === 'payment_failed') {
    return (
      <div className="bg-red-100 dark:bg-red-950/80 border-b-2 border-red-300 dark:border-red-800">
        <div className="px-4 md:px-6 py-2 md:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-400 flex-shrink-0" />
              <span className="text-xs md:text-sm font-semibold text-red-900 dark:text-red-200 truncate">
                Error en el pago — actualiza tu método
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => navigate('/saas/billing')}
                className="px-3 py-1.5 bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-500 text-white font-medium rounded-lg transition-colors text-xs whitespace-nowrap"
              >
                Actualizar
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1 hover:bg-red-200 dark:hover:bg-red-900 rounded transition-colors"
              >
                <X className="w-4 h-4 text-red-700 dark:text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Grace period banner (72h countdown)
  if (subscription.status === 'grace_period') {
    return (
      <div className="bg-orange-100 dark:bg-orange-950/80 border-b-2 border-orange-300 dark:border-orange-800">
        <div className="px-4 md:px-6 py-2 md:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-orange-700 dark:text-orange-400 flex-shrink-0" />
              <span className="text-xs md:text-sm font-semibold text-orange-900 dark:text-orange-200 truncate">
                Periodo de gracia: {timeLeft}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => navigate('/saas/billing')}
                className="px-3 py-1.5 bg-orange-700 dark:bg-orange-600 hover:bg-orange-800 dark:hover:bg-orange-500 text-white font-medium rounded-lg transition-colors text-xs whitespace-nowrap"
              >
                Resolver
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1 hover:bg-orange-200 dark:hover:bg-orange-900 rounded transition-colors"
              >
                <X className="w-4 h-4 text-orange-700 dark:text-orange-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}