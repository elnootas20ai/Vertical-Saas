import type { DeliveryOrder } from './deliveryApi';

export function shouldSyncDeliveryOrderIncome(order: Pick<
  DeliveryOrder,
  'status' | 'paymentStatus' | 'paymentCollected' | 'paidAmount' | 'totalAmount' | 'refundAmount'
>): boolean {
  const status = String(order.status || '');
  if (status === 'cancelled' || status === 'devuelto') return false;
  const paid =
    order.paymentStatus === 'paid'
    || order.paymentCollected === true;
  if (!paid) return false;
  const gross = Number(order.paidAmount || order.totalAmount || 0);
  const refunded = Number(order.refundAmount || 0);
  return gross - refunded > 0.009;
}

export function deliveryOrderIncomeAmount(order: Pick<DeliveryOrder, 'paidAmount' | 'totalAmount' | 'refundAmount'>): number {
  const gross = Number(order.paidAmount || order.totalAmount || 0);
  const refunded = Number(order.refundAmount || 0);
  return Math.round(Math.max(0, gross - refunded) * 100) / 100;
}

export function deliveryOrderFinanceRef(orderId: string) {
  return `PEDIDO-${orderId}`;
}
