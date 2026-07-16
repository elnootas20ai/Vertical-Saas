import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType, isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { RESTAURANT_OPS_HOME_PATH } from '../../lib/retailOpsPaths';
import { AuthRouteLoading } from '../AuthRouteLoading';

/** Bloquea rutas de delivery en negocios que no son delivery. */
export function RequireDeliveryVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed = isStrictDeliveryBusinessType(businessType);

  useEffect(() => {
    if (pending) return;
    if (!allowed) {
      navigate(
        isRestaurantBusinessType(businessType) ? RESTAURANT_OPS_HOME_PATH : '/saas',
        { replace: true },
      );
    }
  }, [allowed, pending, navigate, businessType]);

  if (pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }
  if (!allowed) return null;
  return <>{children}</>;
}
