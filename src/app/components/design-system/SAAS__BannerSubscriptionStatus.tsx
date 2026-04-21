import { useSubscription } from '../../context/SubscriptionContext';
import { AlertCircle, Clock, XCircle, Info } from 'lucide-react';
import { useNavigate } from 'react-router';

export function SAAS__BannerSubscriptionStatus() {
  const { status, trialDaysRemaining, graceHoursRemaining } = useSubscription();
  const navigate = useNavigate();

  if (status === 'subscription_active') {
    return null; // No mostrar banner si todo está OK
  }

  if (status === 'trial_active') {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-blue-900">
              <span className="font-semibold">Prueba gratuita activa.</span> Te quedan {trialDaysRemaining} días de prueba.
            </p>
          </div>
          <button
            onClick={() => navigate('/saas/billing')}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Ver planes
          </button>
        </div>
      </div>
    );
  }

  if (status === 'trial_expired') {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Tu prueba gratuita ha finalizado.</span> Elige un plan para continuar.
            </p>
          </div>
          <button
            onClick={() => navigate('/saas/billing')}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Elegir plan
          </button>
        </div>
      </div>
    );
  }

  if (status === 'payment_failed') {
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-900">
              <span className="font-semibold">Problema con el pago.</span> Actualiza tu método de pago para evitar la suspensión del servicio.
            </p>
          </div>
          <button
            onClick={() => navigate('/saas/billing')}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Actualizar pago
          </button>
        </div>
      </div>
    );
  }

  if (status === 'grace_period') {
    return (
      <div className="bg-orange-50 border-b border-orange-300 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 animate-pulse" />
            <p className="text-sm text-orange-900">
              <span className="font-semibold">Periodo de gracia.</span> Quedan {graceHoursRemaining} horas para actualizar tu pago antes de la suspensión.
            </p>
          </div>
          <button
            onClick={() => navigate('/saas/billing')}
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Actualizar pago ahora
          </button>
        </div>
      </div>
    );
  }

  return null;
}
