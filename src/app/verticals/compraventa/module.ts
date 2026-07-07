import type { VerticalModuleDefinition } from '../types';

/** Módulo Compraventa — frontera independiente de delivery. */
export const COMPRAVENTA_MODULE: VerticalModuleDefinition = {
  id: 'compraventa',
  businessType: 'carDealership',
  routePrefixes: [
    '/saas/vertical/compraventa',
    '/saas/compraventa-hub',
    '/saas/vehicles',
  ],
  codeRoots: [
    'src/app/verticals/compraventa',
    'src/app/pages/saas/vertical/compraventa',
    'src/app/components/saas/compraventa',
    'src/app/lib/compraventa',
    'src/app/lib/compraventaFiscalCalculator.ts',
    'src/app/lib/compraventaFiscalHistory.ts',
    'src/app/lib/compraventaFiscalPrefill.ts',
    'src/app/lib/compraventaFiscalTpoRates.ts',
    'src/app/lib/fiscalConsultationApi.ts',
  ],
  legacySharedImports: [
    'deliverySetup',
    'deliveryApi',
    'workCentersApi',
    'brandsApi',
    'pdvScope',
  ],
};

export function isCompraventaModuleRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return COMPRAVENTA_MODULE.routePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
