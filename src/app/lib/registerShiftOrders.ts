import { filterDeliveryOrdersRequest, type DeliveryOrder, type TpvRegisterSession } from './deliveryApi';
import { registerSessionOrderLoadBounds } from './tpvCajaScope';
import { isBrowserOnline } from './tpvTabletOffline';

function shiftOrdersCacheKey(
  userId: string,
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status' | 'pointOfSaleId' | '_id'>,
): string {
  const sid = String(session._id || '').trim();
  const pdv = String(session.pointOfSaleId || '').trim();
  const opened = String(session.openedAt || '').trim();
  return `vertial.tpv.shiftOrders.${userId}.${sid || `${pdv}|${opened}`}`;
}

function readShiftOrdersCache(key: string): DeliveryOrder[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { orders?: DeliveryOrder[]; savedAt?: string };
    if (!Array.isArray(parsed?.orders)) return null;
    return parsed.orders;
  } catch {
    return null;
  }
}

function writeShiftOrdersCache(key: string, orders: DeliveryOrder[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ savedAt: new Date().toISOString(), orders }),
    );
  } catch {
    /* quota */
  }
}

/** Carga pedidos del turno (TPV / cierre / Caja). Cache local para cerrar sin red. */
export async function fetchShiftOrdersForSession(
  dataUserId: string,
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status' | 'pointOfSaleId' | '_id'>,
): Promise<DeliveryOrder[]> {
  const userId = String(dataUserId || '').trim();
  if (!userId) return [];
  const cacheKey = shiftOrdersCacheKey(userId, session);
  const bounds = registerSessionOrderLoadBounds(session);
  const pdvId = String(session.pointOfSaleId || '').trim();

  if (!isBrowserOnline()) {
    return readShiftOrdersCache(cacheKey) || [];
  }

  try {
    const res = await filterDeliveryOrdersRequest(userId, {
      ...(pdvId ? { salesPointId: pdvId } : {}),
      dateFrom: bounds.from,
      dateTo: bounds.to,
      limit: 500,
    });
    const orders = res.orders || [];
    writeShiftOrdersCache(cacheKey, orders);
    return orders;
  } catch {
    return readShiftOrdersCache(cacheKey) || [];
  }
}

/** Prefetch al tener sesión abierta (mantiene cache fresca para cierre offline). */
export function prefetchShiftOrdersForSession(
  dataUserId: string,
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status' | 'pointOfSaleId' | '_id'> | null | undefined,
): void {
  if (!session || !isBrowserOnline()) return;
  void fetchShiftOrdersForSession(dataUserId, session).catch(() => null);
}
