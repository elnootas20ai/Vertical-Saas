import { Calendar, CreditCard, AlertCircle, AlertTriangle } from 'lucide-react';

interface CardEstadoCuentaProps {
  type: 'trial' | 'trial-warning' | 'trial-expired' | 'active' | 'overdue' | 'empty';
  daysRemaining?: number;
  planName?: string;
  onManagePlan?: () => void;
  onChoosePlan?: () => void;
  onUpdatePayment?: () => void;
}

export function CardEstadoCuenta({
  type,
  daysRemaining,
  planName,
  onManagePlan,
  onChoosePlan,
  onUpdatePayment,
}: CardEstadoCuentaProps) {
  if (type === 'empty') {
    return (
      <div className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-800">
        <div className="flex items-start gap-3">
          <CreditCard className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Estado de cuenta</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Aún no hay información de facturación</p>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'trial') {
    return (
      <div className="p-6 border-2 border-blue-200 rounded-2xl bg-blue-50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Periodo de activación</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Te quedan <strong>{daysRemaining} días</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onChoosePlan}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
          >
            Elegir plan
          </button>
        </div>
      </div>
    );
  }

  if (type === 'trial-warning') {
    return (
      <div className="p-6 border-2 border-yellow-200 rounded-2xl bg-yellow-50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">¡Tu prueba está por terminar!</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Solo te quedan <strong className="text-yellow-700">{daysRemaining} días</strong>. Elige tu plan ahora.
              </p>
            </div>
          </div>
          <button
            onClick={onChoosePlan}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
          >
            Elegir plan
          </button>
        </div>
      </div>
    );
  }

  if (type === 'trial-expired') {
    return (
      <div className="p-6 border-2 border-red-200 rounded-2xl bg-red-50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Tu periodo de prueba ha expirado</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Elige un plan para seguir usando Vertial
              </p>
            </div>
          </div>
          <button
            onClick={onChoosePlan}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
          >
            Elegir plan
          </button>
        </div>
      </div>
    );
  }

  if (type === 'active') {
    return (
      <div className="p-6 border-2 border-emerald-200 rounded-2xl bg-emerald-50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Plan activo</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Plan <strong>{planName}</strong> activo
              </p>
            </div>
          </div>
          <button
            onClick={onManagePlan}
            className="px-4 py-2 border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-100 text-sm font-medium rounded-xl transition-colors flex-shrink-0"
          >
            Gestionar plan
          </button>
        </div>
      </div>
    );
  }

  if (type === 'overdue') {
    return (
      <div className="p-6 border-2 border-red-200 rounded-2xl bg-red-50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Actualizar método de pago</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Hay un problema con tu método de pago
              </p>
            </div>
          </div>
          <button
            onClick={onUpdatePayment}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
          >
            Actualizar pago
          </button>
        </div>
      </div>
    );
  }

  return null;
}