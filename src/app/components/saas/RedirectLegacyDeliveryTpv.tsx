import { Navigate } from 'react-router-dom';
import { useBusiness } from '../../context/BusinessContext';
import { isTpvTabletBound, resolveTpvTabletWorkerPath } from '../../lib/tpvTabletSession';
import { resolveRetailCeoTpvPath } from '../../lib/retailOpsPaths';

/** Atajos legacy `/saas/tpv*` → TPV según vertical (restaurante o delivery). */
export function RedirectLegacyDeliveryTpv() {
  const { currentBusiness } = useBusiness();
  if (isTpvTabletBound()) {
    return <Navigate to={resolveTpvTabletWorkerPath()} replace />;
  }
  return (
    <Navigate
      to={resolveRetailCeoTpvPath(currentBusiness?.businessType)}
      replace
    />
  );
}
