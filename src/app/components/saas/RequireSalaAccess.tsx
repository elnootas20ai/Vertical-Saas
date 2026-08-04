import { Navigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import {
  isRestaurantBusinessType,
  isStrictDeliveryBusinessType,
} from '../../lib/deliveryOpsTypes';
import { DELIVERY_OPS_HOME_PATH } from '../../lib/retailOpsPaths';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Sala (mapa zonas/mesas): bar/restaurante y delivery.
 * Nunca return null (pantalla en blanco).
 */
export function RequireSalaAccess({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const businessType = businessCtx?.currentBusiness?.businessType;
  // Solo esperar el primer fetch; no bloquear si isLoading parpadea al refrescar.
  const pending = !businessCtx?.businessesFetchSettled;
  const allowed =
    isRestaurantBusinessType(businessType) || isStrictDeliveryBusinessType(businessType);

  if (!businessCtx || pending) {
    return <AuthRouteLoading label="Preparando sala…" />;
  }

  if (!allowed) {
    return <Navigate to={DELIVERY_OPS_HOME_PATH} replace />;
  }

  return <>{children}</>;
}
