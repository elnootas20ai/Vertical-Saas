/**
 * Legacy: el TPV delivery ya NO muestra plano de mesas.
 * Se deja el hook en false para no reactivar el interruptor Pedidos|Mesas.
 */
export function useDeliverySalaMapReady(
  _userId?: string | null,
  _businessId?: string | null,
): boolean {
  return false;
}
