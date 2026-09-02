import { Navigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType, isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { RESTAURANT_OPS_HOME_PATH } from '../../lib/retailOpsPaths';
import { AuthRouteLoading } from '../AuthRouteLoading';

/**
 * Bloquea rutas de delivery en negocios que no son delivery.
 * Si aún no hay empresa/tipo (recarga), no redirigir: evita echar del TPV al SaaS.
 * Misma política que RequireRestaurantVertical.
 */
export function RequireDeliveryVertical({ children }: { children: React.ReactNode }) {
  const businessCtx = useBusinessOptional();
  const businessType = businessCtx?.currentBusiness?.businessType;
  const pending =
    !businessCtx?.businessesFetchSettled
    || Boolean(businessCtx?.isLoading)
    || !businessCtx?.currentBusiness;
  const allowed = isStrictDeliveryBusinessType(businessType);

  if (!businessCtx || pending) {
    return <AuthRouteLoading label="Preparando acceso…" />;
  }

  if (!allowed) {
    return (
      <Navigate
        to={isRestaurantBusinessType(businessType) ? RESTAURANT_OPS_HOME_PATH : '/saas'}
        replace
      />
    );
  }

  return <>{children}</>;
}
