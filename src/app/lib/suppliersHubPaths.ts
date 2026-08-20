/** Rutas de proveedores. Facturas/pedidos viven en Catálogo → Compras. */
export const SUPPLIERS_HUB = {
  base: '/saas/suppliers',
  directorio: '/saas/suppliers',
  ordenes: '/saas/catalog?tab=purchase-orders',
  facturas: '/saas/catalog?tab=invoices',
} as const;
