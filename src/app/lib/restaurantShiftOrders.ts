/**
 * Carga comandas del turno como DeliveryOrder (facturación marcas).
 * Mapeo puro: restaurantShiftOrderMap.ts
 */
import type { DeliveryOrder, TpvRegisterSession } from './deliveryApi';
import { listDiningOrdersRequest } from './salaApi';
import { registerSessionOrderLoadBounds } from './tpvCajaScope';
import { diningOrdersToShiftDeliveryOrders } from './restaurantShiftOrderMap';

export {
  diningOrderToShiftDeliveryOrder,
  diningOrdersToShiftDeliveryOrders,
} from './restaurantShiftOrderMap';

/** Carga comandas del turno (mismo rango temporal que delivery). */
export async function fetchShiftDiningOrdersForSession(
  dataUserId: string,
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'>,
): Promise<DeliveryOrder[]> {
  const userId = String(dataUserId || '').trim();
  if (!userId) return [];
  const bounds = registerSessionOrderLoadBounds(session);
  const orders = await listDiningOrdersRequest(userId, {
    dateFrom: bounds.from,
    dateTo: bounds.to,
  });
  return diningOrdersToShiftDeliveryOrders(orders);
}
