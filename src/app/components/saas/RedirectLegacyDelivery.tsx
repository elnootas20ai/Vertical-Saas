import { Navigate, useSearchParams } from 'react-router-dom';

const OPS_PATH = '/saas/delivery-ops';

/** Atajo legacy `/saas/delivery` → centro operativo (o subpantalla según `?tab=`). */
export function RedirectLegacyDelivery() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab')?.trim().toLowerCase();

  if (tab === 'history') {
    return <Navigate to={OPS_PATH} replace />;
  }
  if (tab === 'kitchen' || tab === 'cocina') {
    return <Navigate to="/saas/delivery-kitchen" replace />;
  }
  if (tab === 'assembly' || tab === 'montaje') {
    return <Navigate to="/saas/delivery-montaje" replace />;
  }
  if (tab === 'delivery' || tab === 'reparto') {
    return <Navigate to="/saas/delivery-reparto" replace />;
  }

  return <Navigate to={OPS_PATH} replace />;
}
