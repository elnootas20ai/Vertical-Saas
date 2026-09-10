/** Rutas chromeless del módulo Compras (sin sidebar). */

export const PURCHASES_WORKSPACE = {
  base: '/saas/compras',
  supplierNew: '/saas/compras/proveedor/nuevo',
  supplierEdit: (id: string) => `/saas/compras/proveedor/${encodeURIComponent(id)}/editar`,
  orderNew: '/saas/compras/pedido/nuevo',
  orderEdit: (id: string) => `/saas/compras/pedido/${encodeURIComponent(id)}/editar`,
  invoiceNew: '/saas/compras/factura/nueva',
  invoiceEdit: (id: string) => `/saas/compras/factura/${encodeURIComponent(id)}/editar`,
  albaran: (id: string) => `/saas/compras/albaran/${encodeURIComponent(id)}`,
} as const;

export const PURCHASES_RETURN_DEFAULT = {
  suppliers: '/saas/catalog?tab=suppliers',
  purchaseOrders: '/saas/catalog?tab=purchase-orders',
  albaranes: '/saas/catalog?tab=albaranes',
  invoices: '/saas/catalog?tab=invoices',
} as const;

export type PurchasesReturnState = {
  returnTo?: string;
};

export function resolvePurchasesReturnTo(
  state: unknown,
  fallback: string = PURCHASES_RETURN_DEFAULT.suppliers,
): string {
  const raw = (state as PurchasesReturnState | null)?.returnTo;
  const to = String(raw || '').trim();
  if (to.startsWith('/saas/')) return to;
  return fallback;
}

export function purchasesWorkspaceNavigateState(returnTo: string): PurchasesReturnState {
  return { returnTo };
}
