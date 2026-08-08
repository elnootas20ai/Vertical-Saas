import type { Business } from './businessApi';

/**
 * Todos los verticales filtran clientes por empresa activa.
 * Evita que la cartera de delivery se cuele en inmobiliaria, restaurante, etc.
 */
export function usesBusinessScopedClients(businessType?: string | null): boolean {
  return Boolean(String(businessType || '').trim());
}

/** businessId para listado/búsqueda CRM cuando el vertical lo requiere. */
export function resolveClientSearchBusinessId(
  business: Business | null | undefined,
  scopeBusinessId: string | null | undefined,
): string | undefined {
  if (!usesBusinessScopedClients(business?.businessType)) return undefined;
  const bid = String(scopeBusinessId || '').replace(/^business:/, '').trim();
  return bid || undefined;
}
