import { Navigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType, isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { DELIVERY_CAJA_PATH, DELIVERY_OPS_HOME_PATH } from '../../lib/retailOpsPaths';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Bloquea rutas de bar/restaurante si no es restaurant.
 * Nunca return null (pantalla en blanco): loading o redirect.
 * Si aún no hay empresa/tipo (recarga), no redirigir: evita echar del TPV al SaaS.
 */
export function RequireRestaurantVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending =
    !businessCtx?.businessesFetchSettled
    || Boolean(businessCtx?.isLoading)
    || !businessCtx?.currentBusiness;
  const allowed = isRestaurantBusinessType(businessType);

  if (!businessCtx || pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }

  if (!allowed) {
    return (
      <Navigate
        to={isStrictDeliveryBusinessType(businessType) ? DELIVERY_CAJA_PATH : DELIVERY_OPS_HOME_PATH}
        replace
      />
    );
  }

  return <>{children}</>;
}
