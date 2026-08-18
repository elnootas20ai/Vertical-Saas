/**
 * Replay de cola offline de sala (dining_order). No usa APIs Delivery de pedidos.
 */
import {
  addComandaRequest,
  payDiningOrderRequest,
  sendComandaToKitchenRequest,
  closeDiningOrderRequest,
  type DiningOrder,
  type DiningOrderItem,
} from './salaApi';
import type { TpvOfflineQueueItem } from './tpvTabletOffline';

export const DINING_OFFLINE_TYPES = [
  'dining_comanda_add',
  'dining_comanda_send',
  'dining_pay',
] as const;

export type DiningOfflineType = (typeof DINING_OFFLINE_TYPES)[number];

export function isDiningOfflineType(type: string): type is DiningOfflineType {
  return (DINING_OFFLINE_TYPES as readonly string[]).includes(type);
}

export async function syncDiningOfflineItem(item: TpvOfflineQueueItem): Promise<boolean> {
  if (!isDiningOfflineType(item.type)) return false;
  const p = item.payload || {};
  const userId = String(p.userId || '').trim();
  const orderId = String(p.orderId || '').trim();
  if (!userId || !orderId) return false;

  if (item.type === 'dining_comanda_add') {
    const items = p.items as DiningOrderItem[] | undefined;
    if (!Array.isArray(items) || items.length === 0) return false;
    const { order, comanda } = await addComandaRequest(userId, orderId, {
      items,
      createdBy: String(p.createdBy || ''),
      createdByName: String(p.createdByName || 'TPV'),
      notes: String(p.notes || ''),
      status: 'draft',
    });

    if (p.sendToKitchen && comanda?.id) {
      await sendComandaToKitchenRequest(userId, orderId, comanda.id);
    }
    return Boolean(order?._id);
  }

  if (item.type === 'dining_comanda_send') {
    const comandaId = String(p.comandaId || '').trim();
    if (!comandaId) return false;
    await sendComandaToKitchenRequest(userId, orderId, comandaId);
    return true;
  }

  if (item.type === 'dining_pay') {
    const payment = p.payment as {
      method: string;
      amount: number;
      amountReceived?: number;
      changeGiven?: number;
      tip?: number;
      paidBy: string;
      paidByName: string;
      splitLabel?: string;
    } | undefined;
    if (!payment || !(Number(payment.amount) > 0)) return false;
    const { fullyPaid, order } = await payDiningOrderRequest(userId, orderId, payment, {
      salesPointId: String(p.salesPointId || '') || undefined,
      salesPointName: String(p.salesPointName || '') || undefined,
      registerInCaja: p.registerInCaja !== false,
      closeAfterPay: Boolean(p.closeAfterPay),
      forceClose: Boolean(p.forceClose),
      forceCloseReason: p.forceClose ? 'Cobrado offline con cocina pendiente' : '',
    });
    if (fullyPaid && p.closeAfterPay && order?.status !== 'closed') {
      await closeDiningOrderRequest(
        userId,
        orderId,
        Boolean(p.forceClose) || undefined,
        p.forceClose ? 'Cobrado offline con cocina pendiente' : undefined,
      );
    }
    return true;
  }

  return false;
}

/** Mezcla local optimista: añade comanda draft a la cuenta. */
export function optimisticAppendDraftComanda(
  order: DiningOrder,
  items: DiningOrderItem[],
  meta: { createdBy: string; createdByName: string; notes?: string; clientMutationId?: string },
): DiningOrder {
  const now = new Date().toISOString();
  const comandaId = `offline-c-${meta.clientMutationId || Date.now()}`;
  const orderNumber = Math.max(0, ...(order.comandas || []).map((c) => Number(c.orderNumber || 0))) + 1;
  const comanda = {
    id: comandaId,
    orderNumber,
    status: 'draft' as const,
    sentToKitchenAt: '',
    readyAt: '',
    servedAt: '',
    createdBy: meta.createdBy,
    createdByName: meta.createdByName,
    createdAt: now,
    notes: meta.notes || '',
    items: items.map((i) => ({ ...i, status: i.status || 'pending' })),
  };
  const comandas = [...(order.comandas || []), comanda];
  const subtotal = comandas.reduce(
    (s, c) =>
      s
      + (c.items || []).reduce((n, i) => {
        if (i.status === 'cancelled' || c.status === 'cancelled') return n;
        return n + Number(i.price || 0) * Number(i.quantity || 0);
      }, 0),
    0,
  );
  const discount = Number(order.discount || 0);
  const tax = Number(order.tax || 0);
  const total = Math.max(0, Math.round((subtotal - discount + tax) * 100) / 100);
  return {
    ...order,
    comandas,
    subtotal: Math.round(subtotal * 100) / 100,
    total,
    updatedAt: now,
  };
}
