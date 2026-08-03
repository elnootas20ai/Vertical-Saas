import {
  cancelDeliveryOrderRequest,
  createDeliveryOrderRequest,
  updateDeliveryOrderRequest,
  updateTpvRegisterSessionRequest,
  type DeliveryOrder,
  type TpvRegisterSession,
  type TpvRegisterTransaction,
} from './deliveryApi';
import { createButcherSaleRequest } from './butcherApi';
import {
  isBrowserOnline,
  listTpvOfflineQueue,
  removeTpvOfflineItem,
  type TpvOfflineQueueItem,
} from './tpvTabletOffline';
import { isDiningOfflineType, syncDiningOfflineItem } from './restaurantTpvOfflineSync';

export type TpvOfflineSyncResult = {
  synced: number;
  failed: number;
  remaining: number;
};

async function syncItem(item: TpvOfflineQueueItem): Promise<boolean> {
  const p = item.payload;

  if (item.type === 'order_create') {
    const userId = String(p.userId || '').trim();
    const orderData = p.orderData as Partial<DeliveryOrder> | undefined;
    if (!userId || !orderData || !Array.isArray(orderData.items) || orderData.items.length === 0) {
      return false;
    }
    await createDeliveryOrderRequest(userId, orderData);
    return true;
  }

  if (item.type === 'order_update') {
    const userId = String(p.userId || '').trim();
    const order = p.order as DeliveryOrder | undefined;
    if (!userId || !order?._id) return false;
    await updateDeliveryOrderRequest(userId, order);
    return true;
  }

  if (item.type === 'order_cancel') {
    const userId = String(p.userId || '').trim();
    const orderId = String(p.orderId || '').trim();
    const cancelReason = String(p.cancelReason || '').trim();
    if (!userId || !orderId || cancelReason.length < 4) return false;
    try {
      await cancelDeliveryOrderRequest(userId, orderId, cancelReason);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '');
      // Idempotente: si ya se canceló online, la cola no debe quedarse pillada.
      if (/ya est[aá] cancelado|already cancelled|404|no encontrado/i.test(msg)) return true;
      throw err;
    }
  }

  if (item.type === 'register_tx') {
    const userId = String(p.userId || '').trim();
    const session = p.session as TpvRegisterSession | undefined;
    if (!userId || !session?._id) return false;
    await updateTpvRegisterSessionRequest(userId, session);
    return true;
  }

  if (item.type === 'sale') {
    const userId = String(p.userId || '').trim();
    const sessionId = String(p.sessionId || '').trim();
    const session = p.session as TpvRegisterSession | undefined;
    const tx = p.tx as TpvRegisterTransaction | undefined;
    if (!userId || !sessionId || !session || !tx) return false;
    await updateTpvRegisterSessionRequest(userId, session);
    return true;
  }

  if (item.type === 'butcher_sale') {
    const userId = String(p.userId || '').trim();
    const sale = p.sale as Record<string, unknown> | undefined;
    if (!userId || !sale || !Array.isArray(sale.items) || sale.items.length === 0) return false;
    const res = await createButcherSaleRequest(userId, sale);
    if (!res?.ok) return false;
    return true;
  }

  if (isDiningOfflineType(item.type)) {
    return syncDiningOfflineItem(item);
  }

  // clock_in / clock_out: sincronización futura vía API de fichajes
  return false;
}

/** Intenta vaciar la cola offline. Devuelve estadísticas. */
export async function flushTpvOfflineQueue(): Promise<TpvOfflineSyncResult> {
  if (!isBrowserOnline()) {
    const remaining = listTpvOfflineQueue().length;
    return { synced: 0, failed: 0, remaining };
  }

  const queue = listTpvOfflineQueue();
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const ok = await syncItem(item);
      if (ok) {
        removeTpvOfflineItem(item.id);
        synced += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { synced, failed, remaining: listTpvOfflineQueue().length };
}
