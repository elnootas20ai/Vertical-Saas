import type { ReactNode } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

function TpvErrorFallback(error: Error, reset: () => void) {
  return (
    <div className="min-h-[100svh] w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 p-6 text-center">
      <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 rounded-2xl flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
        El TPV ha tenido un problema
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mb-2">
        No se ha cerrado tu sesión. Puedes reintentar o volver a la caja sin perder la configuración del local.
      </p>
      {import.meta.env.DEV ? (
        <pre className="mb-4 max-w-lg text-left text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-red-600 dark:text-red-400 rounded-xl p-3 overflow-auto">
          {error.message}
        </pre>
      ) : null}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
        <button
          type="button"
          onClick={() => { window.location.href = '/saas/caja'; }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-semibold text-sm"
        >
          <Home className="w-4 h-4" />
          Ir a caja
        </button>
      </div>
    </div>
  );
}

/** Evita pantalla en blanco en TPV/caja: captura errores de React y muestra recuperación. */
export function TpvRouteShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary moduleName="TPV" fallback={TpvErrorFallback}>
      {children}
    </ErrorBoundary>
  );
}
