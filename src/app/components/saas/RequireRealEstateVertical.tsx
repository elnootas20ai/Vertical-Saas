import { Navigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Bloquea rutas de inmobiliaria si la empresa activa no es realEstate.
 */
export function RequireRealEstateVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const businessType = String(businessCtx?.currentBusiness?.businessType || '').trim();
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed = businessType === 'realEstate';

  if (!businessCtx || pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }

  if (!allowed) {
    return <Navigate to="/saas/dashboard" replace />;
  }

  return <>{children}</>;
}
