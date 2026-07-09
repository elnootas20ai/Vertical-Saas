import type { VerticalModuleDefinition } from '../types';

/**
 * Módulo Restauración — vertical propio (bar, restaurante, sala).
 * Reutiliza el motor operativo de pedidos/TPV vía rutas compartidas,
 * pero con frontera de código y datos separada de delivery puro.
 * Las rutas delivery-* (ops, kitchen, montaje) NO pertenecen a este módulo:
 * las bloquea RequireDeliveryVertical y redirigen a /saas/sala.
 */
export const RESTAURANT_MODULE: VerticalModuleDefinition = {
  id: 'restaurant',
  businessType: 'restaurant',
  routePrefixes: [
    '/saas/tpv',
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
  ],
  legacySharedImports: [
    'deliverySetup',
    'deliveryApi',
    'deliveryOpsPdvSelection',
    'workCentersApi',
    'brandsApi',
    'pdvScope',
    'retailScopeCache',
    'retailScopeRegistry',
  ],
};

export function isRestaurantModuleRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return RESTAURANT_MODULE.routePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
