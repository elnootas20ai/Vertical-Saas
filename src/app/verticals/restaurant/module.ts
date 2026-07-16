import type { VerticalModuleDefinition } from '../types';

/**
 * Módulo Bar / Restaurante — frontera de código independiente de Delivery.
 *
 * Delivery NO incluye /saas/caja, /saas/sala ni /saas/cocina.
 * Este módulo es dueño de sala, caja restaurant, TPV mesa, cocina KDS y reservas.
 *
 * PDV/tiendas (`deliveryApi`, `deliverySetup`) tienen nombre legacy compartido;
 * no importar pantallas DeliveryOps, DeliveryKitchen, etc.
 */
export const RESTAURANT_MODULE: VerticalModuleDefinition = {
  id: 'restaurant',
  businessType: 'restaurant',
  routePrefixes: [
    '/saas/sala',
    '/saas/sala/setup',
    '/saas/reservations',
    '/saas/lista-espera',
    '/saas/caja',
    '/saas/caja/tpv',
    '/saas/cocina',
    '/saas/vertical/restaurant',
    '/saas/worker/tpv/restaurant',
  ],
  codeRoots: [
    'src/app/verticals/restaurant',
    'src/app/pages/saas/restaurant',
    'src/app/components/saas/restaurant',
    'src/app/components/saas/sala',
    'src/app/lib/restaurantCajaApi',
    'src/app/lib/restaurantTpvPermissions',
    'src/app/lib/restaurantCloseWarnings',
    'src/app/lib/restaurantFloorReservations',
    'src/app/lib/restaurantReservationsApi',
    'src/app/lib/salaApi',
    'src/app/lib/salaRoomPdv',
    'src/app/lib/salaRoomTerminal',
    'src/app/lib/salaStoreTpv',
    'src/app/lib/salaTpvLaunch',
  ],
  legacySharedImports: [
    'deliverySetup',
    'deliveryApi',
    'deliveryOpsPdvSelection',
    'deliveryOpsTypes',
    // Ticket helpers compartidos (nombre legacy); KDS sala los reutiliza sin DeliveryOps.
    'deliveryTicketPrint',
    'deliveryTicketHelpers',
    'workCentersApi',
    'brandsApi',
    'pdvScope',
    'retailScopeCache',
    'retailScopeRegistry',
    'tpvRegisterScope',
    'tpvCajaScope',
  ],
};

export function isRestaurantModuleRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return RESTAURANT_MODULE.routePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
