import type { VerticalModuleDefinition } from '../types';

/**
 * Módulo Delivery — frontera de código.
 *
 * Bar/restaurante NO forma parte de este módulo (retirado del producto).
 *
 * Otros verticales NO deben importar páginas, componentes ni lib de negocio delivery.
 * Solo pueden usar `legacySharedImports` (retail/PDV compartido).
 */
export const DELIVERY_MODULE: VerticalModuleDefinition = {
  id: 'delivery',
  businessType: 'delivery',
  routePrefixes: [
    '/saas/delivery-ops',
    '/saas/delivery-kitchen',
    '/saas/delivery-reparto',
    '/saas/delivery-montaje',
    '/saas/delivery-catalog',
    '/saas/delivery-integrations',
    '/saas/vertical/delivery',
    '/saas/worker/tpv/delivery',
  ],
  codeRoots: [
    'src/app/verticals/delivery',
    'src/app/pages/saas/delivery',
    'src/app/components/delivery',
    'src/app/lib/delivery',
  ],
  legacySharedImports: [
    'deliverySetup',
    'deliveryApi',
    'deliveryOpsPdvSelection',
    'workCentersApi',
    'brandsApi',
    'pdvScope',
    'retailScopeCache',
  ],
};

/** Comprueba si un pathname pertenece al módulo delivery. */
export function isDeliveryModuleRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return DELIVERY_MODULE.routePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
