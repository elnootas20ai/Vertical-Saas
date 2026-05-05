import { X, Sparkles } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  open: boolean;
  onClose: () => void;
  featureName?: string;
}

export function SAAS__ComingSoonModal({ open, onClose, featureName = 'Esta funcionalidad' }: Props) {
  useModalClose(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Próximamente</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-center py-6">
            <div className="text-6xl mb-4">🚀</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              Estamos trabajando en ello
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              {featureName} estará disponible muy pronto.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Seguimos mejorando Vertial para ti.
            </p>
          </div>

          <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-purple-900">
                <div className="font-semibold mb-1">Novedades en camino</div>
                <p className="text-purple-800">
                  Estamos añadiendo nuevas funcionalidades constantemente. 
                  Te notificaremos cuando esta esté lista.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
