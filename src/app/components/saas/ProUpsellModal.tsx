import { X, Star, Check, Zap, ArrowRight } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';

interface ProUpsellModalProps {
  onClose: () => void;
  onUpgrade?: () => void;
  feature?: string;
}

const PRO_FEATURES = [
  'Roles personalizados (Taller, etc.)',
  'Vehículos ilimitados',
  'ANCOVE integrado',
  'Chat de equipo integrado',
  'Soporte prioritario 24h',
  'Multi-ubicación',
];

export function ProUpsellModal({ onClose, onUpgrade, feature = 'Crear roles personalizados' }: ProUpsellModalProps) {
  useModalClose(true, onClose);
  const iosNoPurchase = isIosCustomerAccessOnlyApp();

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border-2 border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">

        <div className="relative bg-gradient-to-br from-violet-600 to-violet-800 px-6 pt-6 pb-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white dark:bg-gray-800/10 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          <div className="w-12 h-12 bg-white dark:bg-gray-800/15 rounded-2xl flex items-center justify-center mb-4">
            <Star className="w-6 h-6 text-white fill-white" />
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-gray-800/20 rounded-full text-[10px] font-bold text-white uppercase tracking-wider mb-3">
            <Zap className="w-3 h-3 fill-white stroke-none" /> Función Pro
          </span>

          <h2 className="text-xl font-bold text-white mb-1">
            {iosNoPurchase ? 'Función de plan Pro' : 'Actualiza a Pro'}
          </h2>
          <p className="text-sm text-violet-200">
            <span className="font-semibold text-white">"{feature}"</span> requiere el plan Pro.
            {iosNoPurchase
              ? ' En iOS no se contratan planes: gestiona el plan en la web con tu administrador.'
              : ''}
          </p>
        </div>

        {!iosNoPurchase ? (
          <div className="mx-6 -mt-5 bg-white dark:bg-gray-800 border-2 border-violet-200 rounded-2xl px-5 py-4 flex items-center justify-between shadow-sm dark:shadow-gray-900/30">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">Plan Pro</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">99€</span>
                <span className="text-sm text-gray-400 dark:text-gray-500">/mes</span>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full">
                Recomendado
              </span>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Cancela en cualquier momento</p>
            </div>
          </div>
        ) : (
          <div className="mx-6 -mt-5 bg-white dark:bg-gray-800 border-2 border-violet-200 rounded-2xl px-5 py-4 shadow-sm">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Esta app es para clientes con cuenta activa. Los cambios de suscripción se hacen fuera de la app iOS.
            </p>
          </div>
        )}

        <div className="px-6 py-5">
          <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Incluye en Pro</p>
          <div className="space-y-2.5">
            {PRO_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-600" />
                </div>
                <span className={`text-sm ${i === 0 ? 'text-gray-900 dark:text-gray-100 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-2.5">
          {!iosNoPurchase ? (
            <button
              type="button"
              onClick={() => { onUpgrade?.(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors"
            >
              <Star className="w-4 h-4 fill-white stroke-none" />
              Cambiar a Pro — 99€/mes
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-xl text-sm font-semibold hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
          >
            {iosNoPurchase ? 'Entendido' : 'Ahora no'}
          </button>
        </div>

      </div>
    </div>
  );
}
