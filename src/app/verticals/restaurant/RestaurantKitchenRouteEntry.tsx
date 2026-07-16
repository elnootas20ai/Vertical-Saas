import { Navigate } from 'react-router-dom';
import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { RestaurantKitchenPage } from './RestaurantKitchenPage';

/**
 * Cocina de sala (bar/restaurante).
 * Recibe comandas enviadas desde el TPV sala — no el KDS de Delivery.
 */
export function RestaurantKitchenRouteEntry() {
  const businessCtx = useBusinessOptional();
  if (isRestaurantBusinessType(businessCtx?.currentBusiness?.businessType)) {
    return <RestaurantKitchenPage />;
  }
  return <Navigate to="/saas/delivery-kitchen" replace />;
}
