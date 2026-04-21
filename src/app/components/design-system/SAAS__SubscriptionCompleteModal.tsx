import { CheckCircle, X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  onComplete: () => void;
}

export function SAAS__SubscriptionCompleteModal({ onComplete }: Props) {
  useModalClose(true, onComplete);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onComplete}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6 rounded-t-2xl text-center">
          <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            🎉 Bloque Suscripción Completado
          </h2>
          <p className="text-green-50">
            Sistema de estados y facturación implementado
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Pantallas creadas</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Billing - Facturación completa</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__Suspended - Pantalla de bloqueo</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Componentes creados</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SAAS__BannerSubscriptionStatus</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-gray-100">SubscriptionContext (Estado global)</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Estados implementados</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">✓ subscription_active</div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">✓ trial_active</div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">✓ trial_expired</div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">✓ payment_failed</div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">✓ grace_period</div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">✓ suspended</div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Funcionalidades</h3>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>Banners de estado dinámicos según suscripción</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>Redirección automática a pantalla suspendida</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>Simulador de estados (botón inferior izquierda)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>Página de facturación con historial y método de pago</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>Lógica de bloqueo según estado (solo UI)</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Cómo probar:</span> Navega a cualquier página del SaaS y usa el botón 
              <span className="font-mono bg-amber-100 px-2 py-0.5 rounded mx-1">⚙️</span> 
              en la esquina inferior izquierda para cambiar el estado de suscripción y ver el comportamiento.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-8 py-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            Entendido, continuar
          </button>
        </div>
      </div>
    </div>
  );
}
