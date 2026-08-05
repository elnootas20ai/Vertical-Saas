import type { VerticalModuleDefinition } from '../types';

/**
 * Módulo Heladería — frontera de código.
 * Independiente de delivery / restaurant / butcher / compraventa.
 * No importar pantallas ni lib de negocio de otros verticales.
 */
export const HELADERIA_MODULE: VerticalModuleDefinition = {
  id: 'heladeria',
  businessType: 'iceCreamShop',
  routePrefixes: [
    '/saas/heladeria-ops',
    '/saas/heladeria-encargos',
    '/saas/heladeria-integraciones',
    '/saas/heladeria-caja',
    '/saas/heladeria-tpv',
    '/saas/vertical/heladeria',
  ],
  codeRoots: [
    'src/app/verticals/heladeria',
    'src/app/pages/saas/Heladeria',
  ],
  legacySharedImports: [],
};

export function isHeladeriaModuleRoute(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return HELADERIA_MODULE.routePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isIceCreamShopBusinessType(
  businessType: string | null | undefined,
): boolean {
  return String(businessType || '').trim() === 'iceCreamShop';
}
