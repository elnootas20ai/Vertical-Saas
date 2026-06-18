import { filterDeliveryOrdersRequest, type DeliveryOrder, type TpvRegisterSession } from './deliveryApi';
import { registerSessionOrderLoadBounds } from './tpvCajaScope';

/** Carga pedidos del turno con el mismo rango en TPV, cierre y Caja gerente. */
export async function fetchShiftOrdersForSession(
  dataUserId: string,
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status' | 'pointOfSaleId'>,
): Promise<DeliveryOrder[]> {
  const userId = String(dataUserId || '').trim();
  if (!userId) return [];
  const bounds = registerSessionOrderLoadBounds(session);
  const pdvId = String(session.pointOfSaleId || '').trim();
  const res = await filterDeliveryOrdersRequest(userId, {
    ...(pdvId ? { salesPointId: pdvId } : {}),
    dateFrom: bounds.from,
    dateTo: bounds.to,
    limit: 500,
  });
  return res.orders || [];
}
