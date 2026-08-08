import { listDiningOrdersRequest, listDiningTablesRequest } from './salaApi';
import { diningOrderHasTpvPedido, isOpenDiningOrder, openOrdersByTableId } from './restaurantTableDisplay';
import { diningOrderDueAmount } from './restaurantDiningTpv';
import { formatMoneyEs } from './formatNumberEs';

export type RestaurantCloseCheck = {
  warnings: string[];
  openAccountCount: number;
  openAccountTotal: number;
  occupiedTableCount: number;
};

/**
 * Comprueba mesas/cuentas abiertas antes de cerrar caja restaurante.
 *
 * Importante: una mesa cuenta como «ocupada» solo si tiene un pedido TPV real
 * (misma regla que el plano del TPV, `resolveTpvFloorVisualStatus`). El campo
 * `status` persistido de la mesa puede quedarse en «occupied» tras cobrar y
 * provocaba avisos falsos que el usuario no veía en sala.
 */
export async function checkRestaurantRegisterClose(userId: string): Promise<RestaurantCloseCheck> {
  // 48 h hacia atrás: una cuenta abierta de ayer también debe avisar al cerrar.
  const dayStart = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const [orders, tables] = await Promise.all([
    listDiningOrdersRequest(userId, { dateFrom: dayStart }).catch(() => []),
    listDiningTablesRequest(userId).catch(() => []),
  ]);

  const openAccounts = orders.filter((o) => isOpenDiningOrder(o) && diningOrderDueAmount(o) > 0);
  const openTotal = openAccounts.reduce((s, o) => s + diningOrderDueAmount(o), 0);

  const openByTable = openOrdersByTableId(orders);
  const occupied = tables.filter((t) => diningOrderHasTpvPedido(openByTable.get(String(t._id || ''))));

  const warnings: string[] = [];
  if (openAccounts.length > 0) {
    warnings.push(
      `${openAccounts.length} cuenta${openAccounts.length > 1 ? 's' : ''} sin cobrar (${formatMoneyEs(openTotal)})`,
    );
  }
  if (occupied.length > 0) {
    warnings.push(
      `${occupied.length} mesa${occupied.length > 1 ? 's' : ''} con pedido abierto en sala`,
    );
  }

  return {
    warnings,
    openAccountCount: openAccounts.length,
    openAccountTotal: openTotal,
    occupiedTableCount: occupied.length,
  };
}
