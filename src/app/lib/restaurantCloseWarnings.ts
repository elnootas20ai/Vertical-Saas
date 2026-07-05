import { listDiningOrdersRequest, listDiningTablesRequest } from './salaApi';
import { isOpenDiningOrder } from './restaurantTableDisplay';
import { diningOrderDueAmount } from './restaurantDiningTpv';
import { localCalendarDayKey } from './tpvCajaScope';

export type RestaurantCloseCheck = {
  warnings: string[];
  openAccountCount: number;
  openAccountTotal: number;
  occupiedTableCount: number;
};

/** Comprueba mesas/cuentas abiertas antes de cerrar caja restaurante. */
export async function checkRestaurantRegisterClose(userId: string): Promise<RestaurantCloseCheck> {
  const today = localCalendarDayKey();
  const dayStart = `${today}T00:00:00.000Z`;

  const [orders, tables] = await Promise.all([
    listDiningOrdersRequest(userId, { dateFrom: dayStart }).catch(() => []),
    listDiningTablesRequest(userId).catch(() => []),
  ]);

  const openAccounts = orders.filter((o) => isOpenDiningOrder(o) && diningOrderDueAmount(o) > 0);
  const openTotal = openAccounts.reduce((s, o) => s + diningOrderDueAmount(o), 0);
  const occupied = tables.filter((t) =>
    ['occupied', 'pending_order', 'pending_payment', 'served'].includes(String(t.status || '')),
  );

  const warnings: string[] = [];
  if (openAccounts.length > 0) {
    warnings.push(
      `${openAccounts.length} cuenta${openAccounts.length > 1 ? 's' : ''} abierta${openAccounts.length > 1 ? 's' : ''} (${openTotal.toFixed(2)} € sin cobrar)`,
    );
  }
  if (occupied.length > 0) {
    warnings.push(
      `${occupied.length} mesa${occupied.length > 1 ? 's' : ''} ocupada${occupied.length > 1 ? 's' : ''} en sala`,
    );
  }

  return {
    warnings,
    openAccountCount: openAccounts.length,
    openAccountTotal: openTotal,
    occupiedTableCount: occupied.length,
  };
}
