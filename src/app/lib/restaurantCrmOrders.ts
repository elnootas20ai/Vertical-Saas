/**
 * Adapta cuentas de mesa (dining_order) a la forma DeliveryOrder
 * para reutilizar ficha CRM ops (resumen / historial) sin tocar Delivery.
 */
import type { DeliveryOrder, DeliveryOrderItem } from './deliveryApi';
import type { DiningOrder } from './salaApi';
import { flattenDiningAccountLines } from './restaurantDiningTpv';

function diningMatchesClient(order: DiningOrder, clientId: string, clientPhone?: string): boolean {
  const oid = String(order?.clientId || '').trim();
  if (oid && oid === String(clientId || '').trim()) return true;
  const phone = String(clientPhone || '').replace(/\D/g, '');
  const orderPhone = String((order as { clientPhone?: string }).clientPhone || '').replace(/\D/g, '');
  return Boolean(phone && orderPhone && phone.length >= 9 && phone === orderPhone);
}

function diningStatusToCrm(status: string): DeliveryOrder['status'] {
  const st = String(status || '').toLowerCase();
  if (st === 'cancelled') return 'cancelled';
  if (st === 'closed' || st === 'paid') return 'entregado';
  if (st === 'pending_payment') return 'listo';
  if (st === 'served') return 'listo';
  return 'nuevo';
}

function diningRevenue(order: DiningOrder): number {
  const total = Number(order?.total || 0);
  if (Number.isFinite(total) && total > 0) return total;
  const paid = (order?.payments || []).reduce((s, p) => s + Number(p?.amount || 0), 0);
  return Number.isFinite(paid) ? paid : 0;
}

/** Pedidos de mesa facturables para historial CRM. */
export function filterDiningOrdersForClientCrm(
  orders: DiningOrder[],
  clientId: string,
  clientPhone?: string,
): DiningOrder[] {
  return (orders || []).filter((o) => {
    if (!o || (o as { deletedAt?: string }).deletedAt) return false;
    const st = String(o.status || '').toLowerCase();
    if (st === 'cancelled') return false;
    const hasPaid = st === 'closed' || st === 'paid'
      || Number((o as { paidAmount?: number }).paidAmount || 0) > 0
      || (o.payments || []).length > 0;
    if (!hasPaid && st !== 'open' && st !== 'served' && st !== 'pending_payment') return false;
    // Historial: cobrados/cerrados + abiertos del cliente
    if (!diningMatchesClient(o, clientId, clientPhone)) return false;
    return true;
  });
}

export function diningOrderToCrmDeliveryOrder(order: DiningOrder): DeliveryOrder {
  const lines = flattenDiningAccountLines(order);
  const items = lines.map((line): DeliveryOrderItem => ({
    id: line.itemId || line.key,
    catalogItemId: line.productId || undefined,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    total: line.lineTotal,
    notes: line.notes || undefined,
  }));
  const tableLabel = order.tableName
    || (order.tableNumber != null ? `Mesa ${order.tableNumber}` : 'Sala');
  const zone = String(order.zone || '').trim();
  const when = order.closedAt || order.paidAt || order.updatedAt || order.createdAt;
  const revenue = diningRevenue(order);
  const st = diningStatusToCrm(order.status);

  return {
    _id: order._id || order.id,
    id: order.id || order._id,
    orderNumber: `MESA-${order.tableNumber || '?'}-${String(order._id || '').slice(-4).toUpperCase()}`,
    clientId: String(order.clientId || ''),
    customerName: String(order.clientName || tableLabel),
    customerPhone: '',
    customerAddress: zone ? `${tableLabel} · ${zone}` : tableLabel,
    channel: 'tpv',
    deliveryType: 'sala',
    status: st,
    items,
    totalAmount: revenue,
    notes: String(order.notes || ''),
    paymentMethod: order.payments?.[0]?.method || '',
    paymentStatus: st === 'entregado' ? 'paid' : 'pending',
    paidAmount: revenue,
    paidAt: order.paidAt || '',
    createdAt: order.createdAt || when,
    updatedAt: order.updatedAt || when,
    salesPointName: tableLabel,
    tableNumber: order.tableNumber,
    tableId: order.tableId,
  } as DeliveryOrder;
}

export function diningOrdersToCrmDeliveryOrders(
  orders: DiningOrder[],
  clientId: string,
  clientPhone?: string,
): DeliveryOrder[] {
  return filterDiningOrdersForClientCrm(orders, clientId, clientPhone)
    .map(diningOrderToCrmDeliveryOrder)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
