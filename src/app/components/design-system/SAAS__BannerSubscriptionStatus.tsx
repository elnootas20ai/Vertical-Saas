import { useSubscription } from '../../context/SubscriptionContext';
import { AlertCircle, Clock, XCircle, Info } from 'lucide-react';
import { useNavigate } from 'react-router';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';

export function SAAS__BannerSubscriptionStatus() {
  const { status, trialDaysRemaining, graceHoursRemaining } = useSubscription();
  const navigate = useNavigate();
  const iosAccessOnly = isIosCustomerAccessOnlyApp();

  if (status === 'subscription_active') {
    return null;
  }

  if (status === 'trial_active') {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-900">
              <span className="font-semibold">Prueba gratuita activa.</span> Te quedan {trialDaysRemaining} días de prueba.
            </p>
          </div>
          {!iosAccessOnly ? (
            <button
              onClick={() => navigate('/saas/billing')}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              Ver planes
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (status === 'trial_expired') {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Tu prueba gratuita ha finalizado.</span>
              {iosAccessOnly
                ? ' Contacta con soporte para reactivar el acceso.'
                : ' Elige un plan para continuar.'}
            </p>
          </div>
          {!iosAccessOnly ? (
            <button
              onClick={() => navigate('/saas/billing')}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              Elegir plan
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (status === 'payment_failed') {
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-900">
              <span className="font-semibold">Problema con el pago.</span>
              {iosAccessOnly
                ? ' Contacta con soporte@vertialapp.com.'
                : ' Actualiza tu método de pago para evitar la suspensión del servicio.'}
            </p>
          </div>
          {!iosAccessOnly ? (
            <button
              onClick={() => navigate('/saas/billing')}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              Actualizar pago
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (status === 'grace_period') {
    return (
      <div className="bg-orange-50 border-b border-orange-300 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 animate-pulse shrink-0" />
            <p className="text-sm text-orange-900">
              <span className="font-semibold">Periodo de gracia.</span> Quedan {graceHoursRemaining} horas
              {iosAccessOnly ? '.' : ' para actualizar tu pago antes de la suspensión.'}
            </p>
          </div>
          {!iosAccessOnly ? (
            <button
              onClick={() => navigate('/saas/billing')}
              className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              Actualizar pago ahora
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
