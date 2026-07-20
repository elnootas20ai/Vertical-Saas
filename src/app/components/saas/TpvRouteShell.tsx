import type { ErrorInfo, ReactNode } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { CrashReportPanel } from '../CrashReportPanel';

function TpvErrorFallback(error: Error, reset: () => void, errorInfo: ErrorInfo | null) {
  return (
    <CrashReportPanel
      error={error}
      errorInfo={errorInfo}
      moduleName="TPV"
      onReset={reset}
      homeHref="/saas/caja"
      homeLabel="Ir a caja"
      title="El TPV ha tenido un problema"
      description="No se ha cerrado tu sesión. Puedes reintentar, volver a la caja o enviarlo a Vertial para que lo revisemos."
    />
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
