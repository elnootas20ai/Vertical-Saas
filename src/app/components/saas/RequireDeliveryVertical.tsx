import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { AuthRouteLoading } from '../AuthRouteLoading';

/** Bloquea rutas de delivery en negocios que no son delivery (p. ej. restaurante → sala). */
export function RequireDeliveryVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed = isStrictDeliveryBusinessType(businessType);

  useEffect(() => {
    if (pending) return;
    if (!allowed) {
      navigate('/saas/sala', { replace: true });
    }
  }, [allowed, pending, navigate]);

  if (pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }
  if (!allowed) return null;
  return <>{children}</>;
}
