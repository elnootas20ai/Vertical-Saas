import {
  cancelDeliveryOrderRequest,
  createDeliveryOrderRequest,
  listTpvRegisterSessionsRequest,
  updateDeliveryOrderRequest,
  updateTpvRegisterSessionRequest,
  type DeliveryOrder,
  type TpvRegisterSession,
} from './deliveryApi';
import { createButcherSaleRequest, type ButcherSale } from './butcherApi';
import {
  isBrowserOnline,
  listTpvOfflineQueue,
  removeTpvOfflineItem,
  type TpvOfflineQueueItem,
} from './tpvTabletOffline';
import { mergeTpvRegisterTransactions } from './tpvLocalCajaSale';
import { isDiningOfflineType, syncDiningOfflineItem } from './restaurantTpvOfflineSync';

export type TpvOfflineSyncResult = {
  synced: number;
  failed: number;
  remaining: number;
};

function queuePriority(type: string): number {
  if (type === 'order_create' || type === 'order_update' || type === 'order_cancel') return 0;
  if (type === 'butcher_sale') return 0;
  if (type === 'register_tx' || type === 'sale') return 1;
  if (type === 'register_close') return 3;
  return 2;
}

function preferClosedStatus(
  remote: TpvRegisterSession,
  local: TpvRegisterSession,
): TpvRegisterSession['status'] {
  // Nunca reabrir una caja ya cerrada en servidor por un register_tx residual.
  if (remote.status === 'closed' || local.status === 'closed') return 'closed';
  return local.status || remote.status || 'open';
}

async function syncRegisterSession(
  userId: string,
  localSession: TpvRegisterSession,
): Promise<boolean> {
  const list = await listTpvRegisterSessionsRequest(userId);
  const remote = list.find((s) => s._id === localSession._id);
  if (!remote) {
    await updateTpvRegisterSessionRequest(userId, localSession);
    return true;
  }
  const mergedTxs = mergeTpvRegisterTransactions(remote.transactions, localSession.transactions, {
    purgedSaleTxIds: [
      ...(Array.isArray(remote.purgedSaleTxIds) ? remote.purgedSaleTxIds : []),
      ...(Array.isArray(localSession.purgedSaleTxIds) ? localSession.purgedSaleTxIds : []),
    ],
    purgedOrderSaleIds: [
      ...(Array.isArray(remote.purgedOrderSaleIds) ? remote.purgedOrderSaleIds : []),
      ...(Array.isArray(localSession.purgedOrderSaleIds) ? localSession.purgedOrderSaleIds : []),
    ],
  });
  const purgedOrderSaleIds = [...new Set([
    ...(Array.isArray(remote.purgedOrderSaleIds) ? remote.purgedOrderSaleIds : []),
    ...(Array.isArray(localSession.purgedOrderSaleIds) ? localSession.purgedOrderSaleIds : []),
  ].map((id) => String(id || '').trim()).filter(Boolean))];
  const purgedSaleTxIds = [...new Set([
    ...(Array.isArray(remote.purgedSaleTxIds) ? remote.purgedSaleTxIds : []),
    ...(Array.isArray(localSession.purgedSaleTxIds) ? localSession.purgedSaleTxIds : []),
  ].map((id) => String(id || '').trim()).filter(Boolean))];
  const linkedOrderIds = [...new Set([
    ...(remote.linkedOrderIds || []),
    ...(localSession.linkedOrderIds || []),
  ])].filter((id) => !purgedOrderSaleIds.includes(String(id)));
  const salesByChannel: Record<string, number> = {};
  for (const t of mergedTxs) {
    if (t.type === 'sale' && t.channel) {
      salesByChannel[t.channel] = (salesByChannel[t.channel] || 0) + Number(t.amount || 0);
    }
  }
  const status = preferClosedStatus(remote, localSession);
  const closedFields =
    status === 'closed'
      ? {
          closedAt: localSession.closedAt || remote.closedAt,
          closedBy: localSession.closedBy || remote.closedBy,
          closingCashCount: localSession.closingCashCount ?? remote.closingCashCount,
          finalCashAmount: localSession.finalCashAmount ?? remote.finalCashAmount,
          expectedCash: localSession.expectedCash ?? remote.expectedCash,
          difference: localSession.difference ?? remote.difference,
          closingNotes: localSession.closingNotes ?? remote.closingNotes,
          nextDayInitialCash:
            localSession.nextDayInitialCash ?? remote.nextDayInitialCash,
          closingValidationStatus:
            localSession.closingValidationStatus || remote.closingValidationStatus,
          aggregatorClosingTotals:
            localSession.aggregatorClosingTotals ?? remote.aggregatorClosingTotals,
          aggregatorClosingCash:
            localSession.aggregatorClosingCash ?? remote.aggregatorClosingCash,
          aggregatorClosingCard:
            localSession.aggregatorClosingCard ?? remote.aggregatorClosingCard,
          aggregatorClosingBrandTotals:
            localSession.aggregatorClosingBrandTotals ?? remote.aggregatorClosingBrandTotals,
          aggregatorClosingUnpaidCashByBrand:
            localSession.aggregatorClosingUnpaidCashByBrand
            ?? remote.aggregatorClosingUnpaidCashByBrand,
          aggregatorClosingUnpaidCardByBrand:
            localSession.aggregatorClosingUnpaidCardByBrand
            ?? remote.aggregatorClosingUnpaidCardByBrand,
          closingBrandLabels:
            localSession.closingBrandLabels ?? remote.closingBrandLabels,
          productClosingCounts:
            localSession.productClosingCounts ?? remote.productClosingCounts,
        }
      : {};
  await updateTpvRegisterSessionRequest(userId, {
    ...remote,
    ...localSession,
    ...closedFields,
    status,
    _rev: remote._rev,
    transactions: mergedTxs,
    linkedOrderIds,
    salesByChannel,
    purgedSaleTxIds,
    purgedOrderSaleIds,
  });
  return true;
}

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
    // Pedidos offline temporales no se pueden actualizar en servidor hasta crear.
    if (String(order._id).startsWith('offline-order:')) return false;
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
      if (/ya est[aá] cancelado|already cancelled|404|no encontrado/i.test(msg)) return true;
      throw err;
    }
  }

  if (item.type === 'register_tx' || item.type === 'sale' || item.type === 'register_close') {
    const userId = String(p.userId || '').trim();
    const session = p.session as TpvRegisterSession | undefined;
    if (!userId || !session?._id) return false;
    await syncRegisterSession(userId, session);
    return true;
  }

  if (item.type === 'butcher_sale') {
    const userId = String(p.userId || '').trim();
    const sale = p.sale as Partial<ButcherSale> | undefined;
    if (!userId || !sale || !Array.isArray(sale.items) || sale.items.length === 0) {
      return false;
    }
    const res = await createButcherSaleRequest(userId, sale);
    if (res?.ok) return true;
    const err = String((res as { error?: string })?.error || '');
    // Idempotencia blanda: si ya existe ticket, no bloquear la cola.
    if (/duplicad|already exists|ya existe/i.test(err)) return true;
    return false;
  }

  if (isDiningOfflineType(item.type)) {
    return syncDiningOfflineItem(item);
  }

  return false;
}

/** Intenta vaciar la cola offline (pedidos antes que caja). Sync silencioso por defecto. */
export async function flushTpvOfflineQueue(): Promise<TpvOfflineSyncResult> {
  if (!isBrowserOnline()) {
    const remaining = listTpvOfflineQueue().length;
    return { synced: 0, failed: 0, remaining };
  }

  const queue = [...listTpvOfflineQueue()].sort(
    (a, b) => queuePriority(a.type) - queuePriority(b.type) || a.createdAt.localeCompare(b.createdAt),
  );
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
