import type { VerticalModuleDefinition } from '../types';

/**
 * Módulo Carnicería — frontera de código.
 * No mezclar con delivery / restaurant / compraventa.
 * PDV/báscula usan retail legacy compartido (`deliveryApi`).
 */
export const BUTCHER_MODULE: VerticalModuleDefinition = {
  id: 'butcher',
  businessType: 'butcherShop',
  routePrefixes: [
    '/saas/butcher-hub',
    '/saas/butcher-clients',
    '/saas/butcher-orders',
    '/saas/butcher-sales',
    '/saas/butcher-products',
    '/saas/butcher-purchases',
    '/saas/butcher-traceability',
    '/saas/butcher-waste',
    '/saas/butcher-reports',
    '/saas/butcher-tpv',
    '/saas/butcher-reparto',
    '/saas/butcher-despiece',
    '/saas/butcher-basculas',
    '/saas/vertical/carniceria',
    '/saas/worker/butcher-orders',
    '/saas/worker/butcher-reparto',
    '/saas/worker/tpv/butcher',
  ],
  codeRoots: [
    'src/app/verticals/butcher',
  ],
  legacySharedImports: [
    'deliverySetup',
    'deliveryApi',
    'deliveryOpsPdvSelection',
    'workCentersApi',
    'brandsApi',
    'pdvScope',
    'retailScopeCache',
    'vertialPrint',
    'useScale',
    'scaleService',
    'butcherTpvScope',
  ],
};

export function isButcherModuleRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return BUTCHER_MODULE.routePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
