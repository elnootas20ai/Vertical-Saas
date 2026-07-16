import { X } from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';
import { TpvPrinterSetupPanel, type TpvPrinterScope } from './TpvPrinterSetupPanel';

/** Panel de impresora a pantalla completa desde el TPV (accesible sin ser dueño del negocio). */
export function TpvPrinterSetupModal({
  scope,
  onClose,
}: {
  scope?: TpvPrinterScope;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-gray-50 dark:bg-gray-950">
      <header className="shrink-0 flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Configurar impresora</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            Red local (manual) → IP → Probar ticket
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 touch-manipulation"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <ErrorBoundary moduleName="Impresora">
          <TpvPrinterSetupPanel scope={scope} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
