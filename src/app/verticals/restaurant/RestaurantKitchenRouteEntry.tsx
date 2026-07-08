import { Navigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { RestaurantKitchenPage } from './RestaurantKitchenPage';

/** Cocina de sala para bar/restaurante; delivery mantiene su KDS propio. */
export function RestaurantKitchenRouteEntry() {
  const businessCtx = useBusinessOptional();
  if (isRestaurantBusinessType(businessCtx?.currentBusiness?.businessType)) {
    return <RestaurantKitchenPage />;
  }
  return <Navigate to="/saas/delivery-kitchen" replace />;
}
