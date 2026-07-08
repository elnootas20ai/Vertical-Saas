import {
  createDeliveryOrderRequest,
  updateDeliveryOrderRequest,
  updateTpvRegisterSessionRequest,
  type DeliveryOrder,
  type TpvRegisterSession,
  type TpvRegisterTransaction,
} from './deliveryApi';
import {
  isBrowserOnline,
  listTpvOfflineQueue,
  removeTpvOfflineItem,
  type TpvOfflineQueueItem,
} from './tpvTabletOffline';

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
