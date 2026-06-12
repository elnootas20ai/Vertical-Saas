/** Rutas del hub unificado Proveedores (directorio + órdenes + facturas). */
export const SUPPLIERS_HUB = {
  base: '/saas/suppliers',
  directorio: '/saas/suppliers',
  ordenes: '/saas/suppliers/ordenes-compra',
  facturas: '/saas/suppliers/facturas',
} as const;

export type SuppliersHubTab = 'directorio' | 'ordenes' | 'facturas';

export function suppliersHubTabFromPath(pathname: string): SuppliersHubTab {
  if (pathname.includes('/ordenes-compra')) return 'ordenes';
  if (pathname.includes('/facturas')) return 'facturas';
  return 'directorio';
}

export function suppliersHubPathForTab(tab: SuppliersHubTab): string {
  return SUPPLIERS_HUB[tab];
}
