import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isWebOrderingModuleEnabled } from '../../lib/verticalModuleVisibility';
import { AuthRouteLoading } from '../AuthRouteLoading';

/** Bloquea tienda web / pedidos online solo si el vertical lo desactiva en visibilidad. */
export function RequireWebOrderingVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed = isWebOrderingModuleEnabled(businessType);

  useEffect(() => {
    if (pending) return;
    if (!allowed) {
      navigate('/saas/dashboard', { replace: true });
    }
  }, [allowed, pending, navigate]);

  if (pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }
  if (!allowed) return null;
  return <>{children}</>;
}
