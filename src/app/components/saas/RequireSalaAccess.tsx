import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import {
  isRestaurantBusinessType,
  isStrictDeliveryBusinessType,
} from '../../lib/deliveryOpsTypes';
import { DELIVERY_OPS_HOME_PATH } from '../../lib/retailOpsPaths';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Sala (mapa zonas/mesas): bar/restaurante y delivery.
 * Otras rutas restaurant (cocina sala, caja sala…) siguen con RequireRestaurantVertical.
 */
export function RequireSalaAccess({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const navigate = useNavigate();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending = !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  const allowed =
    isRestaurantBusinessType(businessType) || isStrictDeliveryBusinessType(businessType);

  useEffect(() => {
    if (pending) return;
    if (!allowed) {
      navigate(DELIVERY_OPS_HOME_PATH, { replace: true });
    }
  }, [allowed, pending, navigate]);

  if (pending) {
    return <AuthRouteLoading label="Preparando sala…" />;
  }
  if (!allowed) return null;
  return <>{children}</>;
}
