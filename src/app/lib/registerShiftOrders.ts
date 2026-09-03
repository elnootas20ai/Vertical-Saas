import { filterDeliveryOrdersRequest, type DeliveryOrder, type TpvRegisterSession } from './deliveryApi';
import { registerSessionOrderLoadBounds } from './tpvCajaScope';
import { isBrowserOnline } from './tpvTabletOffline';

/** Tope de pedidos en cache offline (cierre sin red). */
const SHIFT_ORDERS_CACHE_MAX = 200;
/** TTL cache local — evita basura eterna en localStorage. */
const SHIFT_ORDERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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
    const savedAt = parsed.savedAt ? Date.parse(parsed.savedAt) : 0;
    if (savedAt && Number.isFinite(savedAt) && Date.now() - savedAt > SHIFT_ORDERS_CACHE_TTL_MS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return null;
    }
    return parsed.orders.slice(0, SHIFT_ORDERS_CACHE_MAX);
  } catch {
    return null;
  }
}

function writeShiftOrdersCache(key: string, orders: DeliveryOrder[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        orders: orders.slice(0, SHIFT_ORDERS_CACHE_MAX),
      }),
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
