import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Texto descriptivo del módulo para el mensaje de error */
  moduleName?: string;
  /** Fallback personalizado; recibe el error y un handler de reset */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // En producción aquí enviaríamos a Sentry / Datadog
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, moduleName, fallback } = this.props;

    if (!hasError || !error) return children;

    if (fallback) return fallback(error, this.reset);

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-red-50 dark:bg-red-950/30 rounded-2xl">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-950 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          {moduleName ? `Error en ${moduleName}` : 'Algo ha ido mal'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
          Se ha producido un error inesperado. Puedes intentar recargar el módulo
          o volver al inicio.
        </p>
        {import.meta.env.DEV && (
          <pre className="mb-6 max-w-lg text-left text-xs bg-gray-100 dark:bg-gray-800 text-red-600 dark:text-red-400 rounded-xl p-4 overflow-auto">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3">
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
          <button
            onClick={() => { window.location.href = '/saas/dashboard'; }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            <Home className="w-4 h-4" />
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }
}

/** HOC para envolver cualquier página/módulo con un Error Boundary */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  moduleName?: string,
) {
  const displayName = moduleName ?? WrappedComponent.displayName ?? WrappedComponent.name ?? 'Module';

  function WithBoundary(props: P) {
    return (
      <ErrorBoundary moduleName={displayName}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  }

  WithBoundary.displayName = `WithErrorBoundary(${displayName})`;
  return WithBoundary;
}
