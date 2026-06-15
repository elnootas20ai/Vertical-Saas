import { Navigate } from 'react-router-dom';
import { isTpvTabletBound, TPV_TABLET_DELIVERY_PATH } from '../../lib/tpvTabletSession';

const DESKTOP_TPV_RAPIDO_PATH = '/saas/vertical/delivery/tpv';

/** Atajos legacy `/saas/tpv*` → TPV rápido escritorio o tablero tablet según binding. */
export function RedirectLegacyDeliveryTpv() {
  if (isTpvTabletBound()) {
    return <Navigate to={TPV_TABLET_DELIVERY_PATH} replace />;
  }
  return <Navigate to={DESKTOP_TPV_RAPIDO_PATH} replace />;
}
