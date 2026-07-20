import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../lib/userFacingError';
import { CrashReportPanel } from './CrashReportPanel';

interface Props {
  children: ReactNode;
  /** Texto descriptivo del módulo para el mensaje de error */
  moduleName?: string;
  /** Fallback personalizado; recibe el error, reset y detalle técnico (solo para el envío). */
  fallback?: (error: Error, reset: () => void, errorInfo: ErrorInfo | null) => ReactNode;
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
    reportClientError({
      err: error,
      context: this.props.moduleName || 'React',
      page: typeof window !== 'undefined' ? window.location.pathname : '',
    });
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, moduleName, fallback } = this.props;

    if (!hasError || !error) return children;

    if (fallback) return fallback(error, this.reset, errorInfo);

    return (
      <CrashReportPanel
        error={error}
        errorInfo={errorInfo}
        moduleName={moduleName}
        onReset={this.reset}
      />
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
