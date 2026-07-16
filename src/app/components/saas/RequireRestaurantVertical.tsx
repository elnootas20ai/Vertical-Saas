import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType, isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { DELIVERY_CAJA_PATH, DELIVERY_OPS_HOME_PATH } from '../../lib/retailOpsPaths';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Bloquea rutas de bar/restaurante si la empresa activa no es restaurant.
 * Delivery va a su propia caja/ops — no comparte /saas/caja ni /saas/sala.
 */
export function RequireRestaurantVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed = isRestaurantBusinessType(businessType);

  useEffect(() => {
    if (pending) return;
    if (!allowed) {
      navigate(
        isStrictDeliveryBusinessType(businessType) ? DELIVERY_CAJA_PATH : DELIVERY_OPS_HOME_PATH,
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
