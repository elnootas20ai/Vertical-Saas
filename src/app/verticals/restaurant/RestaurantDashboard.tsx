import { Navigate } from 'react-router-dom';
import type { VerticalDashboardProps } from '../../lib/verticalDashboardMap';
import { RESTAURANT_OPS_HOME_PATH } from '../../lib/retailOpsPaths';

/** Dashboard SaaS restaurant → Centro operativo (hub propio, no Delivery). */
export function RestaurantDashboard(_props: VerticalDashboardProps) {
  return <Navigate to={RESTAURANT_OPS_HOME_PATH} replace />;
}
