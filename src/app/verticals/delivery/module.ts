import type { VerticalModuleDefinition } from '../types';

/**
 * Módulo Delivery — frontera de código.
 *
 * Todo lo específico de delivery (pedidos, cocina, reparto, catálogo TPV delivery, CRM delivery)
 * vive bajo estas rutas o se importa desde `@/verticals/delivery` (barrel).
 *
 * Otros verticales NO deben importar páginas, componentes ni lib de negocio delivery.
 * Solo pueden usar `legacySharedImports` (retail/PDV compartido — renombrar en fases futuras).
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
    '/saas/tpv',
    '/saas/sala',
    '/saas/caja',
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
