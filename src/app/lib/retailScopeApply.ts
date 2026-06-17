/** Evita pisar tiendas visibles con un fetch vacío transitorio (p. ej. tras invalidar caché al navegar). */
export function shouldSkipEmptyStoreApply(params: {
  hasDisplayedStores: boolean;
  incomingRetailCount: number;
  incomingPdvCount: number;
  force?: boolean;
}): boolean {
  const hasIncoming = params.incomingRetailCount > 0 || params.incomingPdvCount > 0;
  return params.hasDisplayedStores && !hasIncoming;
}
