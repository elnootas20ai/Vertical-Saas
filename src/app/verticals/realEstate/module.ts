import type { VerticalModuleDefinition } from '../types';

/** Módulo Inmobiliaria — frontera ligera; no mezclar con delivery/cocina. */
export const REAL_ESTATE_MODULE: VerticalModuleDefinition = {
  id: 'realEstate',
  businessType: 'realEstate',
  routePrefixes: [
    '/saas/realestate-properties',
    '/saas/realestate-visits',
    '/saas/realestate-contracts',
    '/saas/realestate-appraisals',
    '/saas/realestate-owners',
    '/saas/realestate-tenants',
  ],
  codeRoots: [
    'src/app/verticals/realEstate',
    'src/app/pages/saas/RealEstateProperties.tsx',
    'src/app/pages/saas/RealEstateVisits.tsx',
    'src/app/pages/saas/RealEstateContracts.tsx',
    'src/app/pages/saas/RealEstateAppraisals.tsx',
    'src/app/pages/saas/RealEstateOwners.tsx',
    'src/app/pages/saas/RealEstateTenants.tsx',
    'src/app/pages/saas/dashboards/RealEstateDashboard.tsx',
    'src/app/pages/saas/worker/WorkerTpvRealEstate.tsx',
  ],
  legacySharedImports: [],
};

export function isRealEstateModuleRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return REAL_ESTATE_MODULE.routePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
