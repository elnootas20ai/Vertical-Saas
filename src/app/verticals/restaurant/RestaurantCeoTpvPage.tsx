import { useLocation } from 'react-router-dom';
import { RestaurantSalaTpvShell } from './RestaurantSalaTpvShell';

/**
 * Entrada TPV CEO / tablet bar-restaurante.
 * Pantalla propia del vertical — nunca TpvRapido / Delivery.
 */
export function RestaurantCeoTpvPage() {
  const { pathname } = useLocation();
  const tabletMode = pathname.includes('/worker/tpv');
  return <RestaurantSalaTpvShell tabletMode={tabletMode} />;
}
