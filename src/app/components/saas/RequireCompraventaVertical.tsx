import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isCompraventaBusinessType } from '../../lib/compraventaSetup';
import { AuthRouteLoading } from '../AuthRouteLoading';

/** Bloquea rutas de compraventa en negocios que no son carDealership. */
export function RequireCompraventaVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed = isCompraventaBusinessType(businessType);

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
