import { Navigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { AuthRouteLoading } from '../AuthRouteLoading';

/** Eventos no usa TPV, caja ni catálogo delivery: redirige al hub operativo. */
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

  return <>{children}</>;
}
