import type { Business } from './businessApi';
import { usesOpsCrmBusinessType } from './deliveryOpsTypes';

/**
 * Verticales cuyo CRM debe filtrar clientes por empresa activa (no mezclar cuentas/negocios).
 */
export function usesBusinessScopedClients(businessType?: string | null): boolean {
  return usesOpsCrmBusinessType(businessType);
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
