import { useEffect, useReducer, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { AlertTriangle, Clock, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import {
  dismissBannerForRestOfLocalDay,
  isBannerDismissedForLocalToday,
} from '../../lib/dayBannerDismiss';
import { getTrialExpiringBannerContent } from '../../lib/trialBannerMessages';

export function SubscriptionBanner() {
  const { subscription } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [timeLeft, setTimeLeft] = useState('');

  const userId = user?.user_id ?? '';
  const trialDismissKey = userId ? `vertial.banner.dismissDay.${userId}.subscriptionTrial` : '';
  const paymentDismissKey = userId ? `vertial.banner.dismissDay.${userId}.subscriptionPayment` : '';
  const graceDismissKey = userId ? `vertial.banner.dismissDay.${userId}.subscriptionGrace` : '';

  const dismissedTrial = trialDismissKey && isBannerDismissedForLocalToday(trialDismissKey);
  const dismissedPayment = paymentDismissKey && isBannerDismissedForLocalToday(paymentDismissKey);
  const dismissedGrace = graceDismissKey && isBannerDismissedForLocalToday(graceDismissKey);

  // Trabajadores no gestionan la suscripción de la empresa — ocultar avisos de trial/pago.
  if (isWorkerAccount(user)) return null;

  /** Navegación u otro tick: releer localStorage; intervalo para pasar medianoche sin recargar. */
  useEffect(() => {
    rerender();
  }, [location.pathname, subscription.status]);

  useEffect(() => {
    const id = window.setInterval(() => rerender(), 60_000);
    return () => window.clearInterval(id);
  }, []);

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

  const hasSavedCard = Boolean(String(user?.paymentSummary?.lastFourDigits || '').trim());
  const hasMoneiSubscription = Boolean(String(subscription.moneiSubscriptionId || '').trim());

  // Trial expiring: solo si falta método de pago (la info de tarjeta/prueba ya se da en el registro)
  if (
    !dismissedTrial &&
    !hasSavedCard &&
    !hasMoneiSubscription &&
    subscription.status === 'trial_expiring' &&
    subscription.trialEndsAt
  ) {
    const daysLeft = Math.ceil(
      (new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const trialCopy = getTrialExpiringBannerContent({
      daysLeft,
      hasSavedCard: false,
      hasMoneiSubscription: false,
    });

    return (
      <div className="bg-amber-100 dark:bg-amber-950/80 border-b-2 border-amber-300 dark:border-amber-800">
        <div className="px-4 md:px-6 py-2 md:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs md:text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {trialCopy.title}
                </p>
                <p className="text-[11px] md:text-xs text-amber-900/85 dark:text-amber-200/85 leading-snug mt-0.5">
                  {trialCopy.detail}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => navigate('/saas/billing')}
                className="px-3 py-1.5 bg-amber-700 dark:bg-amber-600 hover:bg-amber-800 dark:hover:bg-amber-500 text-white font-medium rounded-lg transition-colors text-xs whitespace-nowrap"
              >
                {trialCopy.ctaLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (trialDismissKey) dismissBannerForRestOfLocalDay(trialDismissKey);
                  rerender();
                }}
                className="p-1 hover:bg-amber-200 dark:hover:bg-amber-900 rounded transition-colors"
                aria-label="Cerrar hasta mañana"
                title="No mostrar hoy (se restablece a las 00:00)"
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
  if (!dismissedPayment && subscription.status === 'payment_failed') {
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
                type="button"
                onClick={() => {
                  if (paymentDismissKey) dismissBannerForRestOfLocalDay(paymentDismissKey);
                  rerender();
                }}
                className="p-1 hover:bg-red-200 dark:hover:bg-red-900 rounded transition-colors"
                aria-label="Cerrar hasta mañana"
                title="No mostrar hoy (se restablece a las 00:00)"
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
  if (!dismissedGrace && subscription.status === 'grace_period') {
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
                type="button"
                onClick={() => {
                  if (graceDismissKey) dismissBannerForRestOfLocalDay(graceDismissKey);
                  rerender();
                }}
                className="p-1 hover:bg-orange-200 dark:hover:bg-orange-900 rounded transition-colors"
                aria-label="Cerrar hasta mañana"
                title="No mostrar hoy (se restablece a las 00:00)"
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
