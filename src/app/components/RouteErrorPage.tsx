import { useEffect, useMemo } from 'react';
import {
  isRouteErrorResponse,
  useNavigate,
  useRouteError,
} from 'react-router-dom';
import { CrashReportPanel } from './CrashReportPanel';
import { reportClientError } from '../lib/userFacingError';

type Props = {
  /** Nombre corto para el informe (p. ej. SaaS, Auth). */
  moduleName?: string;
};

/**
 * Pantalla de error de React Router (`errorElement`).
 * Sustituye el mensaje técnico por defecto para que en producción
 * el usuario vea recuperación clara (reintentar / inicio / enviar a Vertial).
 */
export function RouteErrorPage({ moduleName = 'Vertial' }: Props) {
  const routeError = useRouteError();
  const navigate = useNavigate();

  const error = useMemo(() => {
    if (routeError instanceof Error) return routeError;
    if (isRouteErrorResponse(routeError)) {
      const detail =
        typeof routeError.data === 'string' && routeError.data.trim()
          ? routeError.data
          : routeError.statusText || 'Error de ruta';
      return new Error(`${routeError.status}: ${detail}`);
    }
    if (typeof routeError === 'string' && routeError.trim()) {
      return new Error(routeError);
    }
    return new Error('Ha ocurrido un error inesperado');
  }, [routeError]);

  useEffect(() => {
    reportClientError({
      err: error,
      context: `Route:${moduleName}`,
      page: typeof window !== 'undefined' ? window.location.pathname : '',
    });
  }, [error, moduleName]);

  const isNotFound = isRouteErrorResponse(routeError) && routeError.status === 404;

  return (
    <CrashReportPanel
      error={error}
      moduleName={moduleName}
      title={isNotFound ? 'Página no encontrada' : 'Algo ha ido mal'}
      description={
        isNotFound
          ? 'Esta dirección no existe o ya no está disponible. Vuelve al inicio o reintenta.'
          : 'Ha ocurrido un problema al cargar esta pantalla. Puedes reintentar, volver al inicio o enviarlo a Vertial.'
      }
      onReset={() => {
        try {
          navigate(0);
        } catch {
          window.location.reload();
        }
      }}
      homeHref="/saas/dashboard"
      homeLabel="Ir al inicio"
    />
  );
}
