import type { VerticalModuleDefinition } from '../types';

/**
 * Módulo Heladería — frontera de código.
 * Producto: el sidebar/core operativo reutiliza el shell Delivery (Clientes, TPV, ops, caja…).
 * Código propio vive aquí; no mezclar lógica de negocio delivery dentro de estos archivos.
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

export { isIceCreamShopBusinessType } from '../../lib/deliveryOpsTypes';
