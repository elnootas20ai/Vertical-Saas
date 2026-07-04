import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { CajaPage } from '../../pages/saas/CajaPage';
import { RestaurantCajaPage } from './RestaurantCajaPage';

/** Bar/restaurante usa caja de sala; delivery mantiene su caja original. */
export function RestaurantCajaRouteEntry() {
  const businessCtx = useBusinessOptional();
  if (isRestaurantBusinessType(businessCtx?.currentBusiness?.businessType)) {
    return <RestaurantCajaPage />;
  }
  return <CajaPage />;
}
