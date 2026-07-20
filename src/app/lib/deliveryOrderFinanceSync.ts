import { createFinanceMovementInCouch, listFinanceMovements } from './financeApi';
import type { DeliveryOrder } from './deliveryApi';
import type { FinanceMovementScope } from './financeScope';
import type { FinanceMovementRecord } from './financeTypes';
import {
  deliveryOrderFinanceRef,
  deliveryOrderIncomeAmount,
  shouldSyncDeliveryOrderIncome,
} from './deliveryOrderFinanceRules';

export {
  deliveryOrderFinanceRef,
  deliveryOrderIncomeAmount,
  shouldSyncDeliveryOrderIncome,
} from './deliveryOrderFinanceRules';

function orderRef(orderId: string) {
  return deliveryOrderFinanceRef(orderId);
}

export async function hasDeliveryOrderIncomeMovement(
  userId: string,
  orderId: string,
  existing?: FinanceMovementRecord[],
): Promise<boolean> {
  const id = String(orderId || '').trim();
  if (!id) return false;
  try {
    const movements = existing || await listFinanceMovements(userId);
    const ref = orderRef(id);
    return movements.some(
      (m) =>
        (m.source === 'delivery_order' && m.sourceRef === id)
        || m.reference === ref
        || String(m.notes || '').includes(`delivery_order:${id}`),
    );
  } catch {
    return false;
  }
}

/**
 * Crea el cobro financiero de un pedido delivery/TPV (idempotente).
 * Así ventas delivery y «Ingresos fin.» comparten la misma fuente.
 */
export async function ensureDeliveryOrderIncome(
  userId: string,
  order: DeliveryOrder,
  scope: FinanceMovementScope = {},
  existingMovements?: FinanceMovementRecord[],
): Promise<boolean> {
  if (!userId || !order?._id) return false;
  if (!shouldSyncDeliveryOrderIncome(order)) return false;
  if (await hasDeliveryOrderIncomeMovement(userId, order._id, existingMovements)) return true;

  const total = deliveryOrderIncomeAmount(order);
  if (total <= 0) return false;

  const businessId = String(
    scope.businessId
    || (order as DeliveryOrder & { business_id?: string }).business_id
    || (order as DeliveryOrder & { businessId?: string }).businessId
    || '',
  ).trim();
  const businessName = String(scope.businessName || '').trim();
  const workCenterId = String(scope.workCenterId || '').trim();
  const workCenterName = String(scope.workCenterName || '').trim();
  const pointOfSaleId = String(scope.pointOfSaleId || order.salesPointId || '').trim();
  const pointOfSaleName = String(scope.pointOfSaleName || order.salesPointName || '').trim();

  const dateStr = String(
    order.paidAt || order.deliveredAt || order.updatedAt || order.createdAt || new Date().toISOString(),
  ).slice(0, 10);
  const base = Number((total / 1.21).toFixed(2));
  const ticket = order.orderNumber || order.ticketNumber || order._id.slice(-6);

  await createFinanceMovementInCouch(userId, {
    type: 'cobro',
    user_id: userId,
    concept: `Venta pedido #${ticket}${pointOfSaleName ? ` · ${pointOfSaleName}` : ''}`,
    reference: orderRef(order._id),
    category: 'ventas',
    amountBase: base,
    taxRate: 21,
    date: dateStr,
    payMethod: String(order.paymentMethod || 'mixto'),
    notes: `delivery_order:${order._id}`,
    status: 'paid',
    source: 'delivery_order',
    sourceRef: order._id,
    businessId: businessId || undefined,
    businessName: businessName || undefined,
    workCenterId: workCenterId || undefined,
    workCenterName: workCenterName || undefined,
    pointOfSaleId: pointOfSaleId || undefined,
    pointOfSaleName: pointOfSaleName || undefined,
  });

  return true;
}

export type DeliveryOrderFinanceBackfillScope = FinanceMovementScope & {
  /** PDV id → work center id */
  pdvToWorkCenterId?: Map<string, string>;
  workCenterNameById?: Map<string, string>;
};

/** Sincroniza pedidos del mes (cobrados) que aún no tienen movimiento financiero. */
export async function backfillDeliveryOrdersFinance(
  userId: string,
  orders: DeliveryOrder[],
  scope: DeliveryOrderFinanceBackfillScope,
  monthKey?: string,
): Promise<{ created: number; skipped: number }> {
  const mk = monthKey || new Date().toISOString().slice(0, 7);
  let existing: FinanceMovementRecord[] = [];
  try {
    // Sin filtrar por empresa: evita duplicar si ya existía un cobro legacy sin businessId.
    existing = await listFinanceMovements(userId);
  } catch {
    existing = [];
  }

  let created = 0;
  let skipped = 0;
  const candidates = orders.filter((o) => {
    if (!shouldSyncDeliveryOrderIncome(o)) return false;
    const day = String(o.paidAt || o.deliveredAt || o.updatedAt || o.createdAt || '').slice(0, 7);
    return !mk || day === mk || String(o.createdAt || '').startsWith(mk);
  });

  for (const order of candidates) {
    const pdvId = String(order.salesPointId || '').trim();
    const wcId =
      scope.workCenterId
      || scope.pdvToWorkCenterId?.get(pdvId)
      || '';
    const wcName =
      scope.workCenterName
      || (wcId ? scope.workCenterNameById?.get(wcId) : '')
      || order.salesPointName
      || '';
    try {
      const already = await hasDeliveryOrderIncomeMovement(userId, order._id, existing);
      if (already) {
        skipped += 1;
        continue;
      }
      const ok = await ensureDeliveryOrderIncome(
        userId,
        order,
        {
          businessId: scope.businessId,
          businessName: scope.businessName,
          workCenterId: wcId,
          workCenterName: wcName,
          pointOfSaleId: pdvId,
          pointOfSaleName: order.salesPointName,
        },
        existing,
      );
      if (ok) {
        created += 1;
        existing = [
          ...existing,
          {
            _id: `synced:${order._id}`,
            id: order._id,
            type: 'cobro',
            user_id: userId,
            concept: '',
            reference: orderRef(order._id),
            category: 'ventas',
            amountBase: 0,
            taxRate: 21,
            taxAmount: 0,
            totalAmount: 0,
            date: '',
            payMethod: '',
            notes: `delivery_order:${order._id}`,
            status: 'paid',
            dueDate: '',
            paidAt: '',
            reconciled: false,
            reconciledBankTxId: '',
            linkedDocuments: [],
            attachmentUrl: '',
            source: 'delivery_order',
            sourceRef: order._id,
            dismissedDuplicates: [],
            createdAt: '',
            updatedAt: '',
          },
        ];
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  return { created, skipped };
}

export async function hasDeliveryOrderRefundMovement(
  userId: string,
  orderId: string,
  existing?: FinanceMovementRecord[],
): Promise<boolean> {
  const id = String(orderId || '').trim();
  if (!id) return false;
  try {
    const movements = existing || await listFinanceMovements(userId);
    const ref = `DEVOLUCION-${id}`;
    return movements.some(
      (m) =>
        (m.source === 'delivery_order_refund' && m.sourceRef === id)
        || m.reference === ref
        || String(m.notes || '').includes(`delivery_order_refund:${id}`),
    );
  } catch {
    return false;
  }
}

/**
 * Registra la devolución como pago (idempotente) para que ingresos netos del dashboard cuadren.
 */
export async function ensureDeliveryOrderRefund(
  userId: string,
  order: DeliveryOrder,
  scope: FinanceMovementScope = {},
  existingMovements?: FinanceMovementRecord[],
): Promise<boolean> {
  if (!userId || !order?._id) return false;
  const refundAmount = Number(order.refundAmount || 0);
  if (!(refundAmount > 0.009)) return false;
  if (await hasDeliveryOrderRefundMovement(userId, order._id, existingMovements)) return true;

  const businessId = String(
    scope.businessId
    || (order as DeliveryOrder & { business_id?: string }).business_id
    || (order as DeliveryOrder & { businessId?: string }).businessId
    || '',
  ).trim();
  const pointOfSaleId = String(scope.pointOfSaleId || order.salesPointId || '').trim();
  const pointOfSaleName = String(scope.pointOfSaleName || order.salesPointName || '').trim();
  const dateStr = String(
    order.refundedAt || order.updatedAt || order.paidAt || order.createdAt || new Date().toISOString(),
  ).slice(0, 10);
  const base = Number((refundAmount / 1.21).toFixed(2));
  const ticket = order.orderNumber || order.ticketNumber || order._id.slice(-6);

  await createFinanceMovementInCouch(userId, {
    type: 'pago',
    user_id: userId,
    concept: `Devolución pedido #${ticket}${pointOfSaleName ? ` · ${pointOfSaleName}` : ''}`,
    reference: `DEVOLUCION-${order._id}`,
    category: 'devoluciones',
    amountBase: base,
    taxRate: 21,
    date: dateStr,
    payMethod: String(order.paymentMethod || 'mixto'),
    notes: `delivery_order_refund:${order._id}${order.refundReason ? ` · ${order.refundReason}` : ''}`,
    status: 'paid',
    source: 'delivery_order_refund',
    sourceRef: order._id,
    businessId: businessId || undefined,
    businessName: String(scope.businessName || '').trim() || undefined,
    workCenterId: String(scope.workCenterId || '').trim() || undefined,
    workCenterName: String(scope.workCenterName || '').trim() || undefined,
    pointOfSaleId: pointOfSaleId || undefined,
    pointOfSaleName: pointOfSaleName || undefined,
  });

  return true;
}
