import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { HotelReservations } from '../../pages/saas/HotelReservations';
import { RestaurantReservationsPage } from './RestaurantReservationsPage';

/** Muestra reservas de restaurante o hotel según el tipo de negocio. */
export function RestaurantReservationsRouteEntry() {
  const businessCtx = useBusinessOptional();
  if (isRestaurantBusinessType(businessCtx?.currentBusiness?.businessType)) {
    return <RestaurantReservationsPage />;
  }
  return <HotelReservations />;
}
