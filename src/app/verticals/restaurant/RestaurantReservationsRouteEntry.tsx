import { useBusinessOptional } from '../../context/BusinessContext';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { HotelReservations } from '../../pages/saas/HotelReservations';
import { RestaurantReservationsPage } from './RestaurantReservationsPage';

/**
 * Reservas: bar/restaurante usa el MVP de sala + CRM.
 * Otros verticales (hotel) mantienen su pantalla propia.
 */
export function RestaurantReservationsRouteEntry() {
  const businessCtx = useBusinessOptional();
  if (isRestaurantBusinessType(businessCtx?.currentBusiness?.businessType)) {
    return <RestaurantReservationsPage />;
  }
  return <HotelReservations />;
}
