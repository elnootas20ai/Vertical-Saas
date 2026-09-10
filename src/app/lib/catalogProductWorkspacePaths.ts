/** Rutas chromeless de ficha producto TPV (sin sidebar). */

export const CATALOG_PRODUCT_WORKSPACE = {
  base: '/saas/catalog/producto',
  nuevo: '/saas/catalog/producto/nuevo',
  edit: (id: string) => `/saas/catalog/producto/${encodeURIComponent(id)}`,
} as const;

export const CATALOG_PRODUCT_RETURN_DEFAULT = '/saas/catalog';

export type CatalogProductReturnState = {
  returnTo?: string;
  /** Categoría activa al volver al listado */
  category?: string;
};

export function resolveCatalogProductReturnTo(
  state: unknown,
  fallback: string = CATALOG_PRODUCT_RETURN_DEFAULT,
): string {
  const raw = (state as CatalogProductReturnState | null)?.returnTo;
  const to = String(raw || '').trim();
  if (to.startsWith('/saas/')) return to;
  return fallback;
}

export function catalogProductWorkspaceNavigateState(
  returnTo: string,
  category?: string,
): CatalogProductReturnState {
  const cat = String(category || '').trim();
  return cat ? { returnTo, category: cat } : { returnTo };
}
