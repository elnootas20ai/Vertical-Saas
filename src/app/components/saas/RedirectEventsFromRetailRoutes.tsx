import { Navigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Verticales que no usan TPV / catálogo retail:
 * - Eventos → hub operativo
 * - Inmobiliaria → panel (sin catálogo ni proveedores)
 */
export function RedirectEventsFromRetailRoutes({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const businessType = businessCtx?.currentBusiness?.businessType;

  if (pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }

  if (businessType === 'events') {
    return <Navigate to="/saas/vertical/eventos" replace />;
  }

  if (businessType === 'realEstate') {
    return <Navigate to="/saas/dashboard" replace />;
  }

  return <>{children}</>;
}
