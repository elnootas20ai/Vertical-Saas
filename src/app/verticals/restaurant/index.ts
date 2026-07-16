/**
 * API pública del módulo Bar / Restaurante.
 *
 * Fuera de este vertical: importar desde aquí (no desde Delivery*).
 * Código nuevo de sala/caja/cocina/reservas → `src/app/verticals/restaurant/`.
 */

export {
  RESTAURANT_MODULE,
  isRestaurantModuleRoute,
} from './module';

export {
  isRestaurantBusinessType,
  resolveRestaurantVerticalFromContext,
} from '../../lib/deliveryOpsTypes';

export {
  resolveRestaurantFormat,
  type RestaurantFormat,
} from './restaurantFormat';

export {
  filterRestaurantRetailWorkCenters,
  resolveRestaurantRetailOwnerId,
} from './retailScope';

export {
  bootstrapRestaurantCeoTpvStores,
  buildRestaurantCeoTpvStoreRows,
} from './ceoTpvStores';

export { RestaurantCeoTpvPage } from './RestaurantCeoTpvPage';

export { RestaurantSalaPage } from './RestaurantSalaPage';
export { RestaurantSalaQuickSetup } from './RestaurantSalaQuickSetup';
export { RestaurantSalaLiveView } from './RestaurantSalaLiveView';
export { RestaurantSalaTpvPage } from './RestaurantSalaTpvPage';
export { RestaurantReservationsPage } from './RestaurantReservationsPage';
export { RestaurantCajaPage } from './RestaurantCajaPage';
