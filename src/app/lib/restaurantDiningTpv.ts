import { v4 as uuidv4 } from 'uuid';
import type { CatalogItem, DeliveryOrderItem } from './deliveryApi';
import type { DiningComanda, DiningOrder, DiningOrderItem } from './salaApi';
import {
  addComandaRequest,
  changeTableStatusRequest,
  closeDiningOrderRequest,
  createDiningOrderRequest,
  getDiningOrderRequest,
  listDiningOrdersRequest,
  payDiningOrderRequest,
  sendComandaToKitchenRequest,
  splitDiningOrderRequest,
  updateDiningOrderRequest,
  type DiningTable,
} from './salaApi';
import { tableStatusOnRelease } from './restaurantTableStatus';
import { isOpenDiningOrder } from './restaurantTableDisplay';
import type { CartLineCustomization } from './catalogCustomization';
import { cartLineUnitPrice } from './catalogCustomization';

export type RestaurantCartLine = {
  lineId: string;
  catalogItem: CatalogItem;
  quantity: number;
  customization: CartLineCustomization;
};

export function cartLinesToDiningItems(lines: RestaurantCartLine[]): DiningOrderItem[] {
  return lines.map((ci) => ({
    id: ci.lineId || uuidv4(),
    productId: ci.catalogItem._id,
    name: ci.catalogItem.name,
    price: cartLineUnitPrice(ci.catalogItem.unitPrice, ci.customization),
    quantity: ci.quantity,
    category: ci.catalogItem.category || '',
    notes: ci.customization.notes?.trim() || '',
    modifiers: [],
    status: 'pending' as const,
    cancelledReason: '',
    cancelledBy: '',
  }));
}

export function deliveryItemsToDiningItems(items: DeliveryOrderItem[]): DiningOrderItem[] {
  return items.map((i) => ({
    id: i.id || uuidv4(),
    productId: String(i.catalogItemId || i.id || ''),
    name: i.name,
    price: Number(i.unitPrice || 0),
    quantity: Number(i.quantity || 1),
    category: i.category || '',
    notes: i.notes || '',
    modifiers: [],
    status: 'pending' as const,
    cancelledReason: '',
    cancelledBy: '',
  }));
}

export async function findOpenDiningOrderForTable(
  userId: string,
  tableId: string,
): Promise<DiningOrder | null> {
  const orders = await listDiningOrdersRequest(userId, { tableId });
  return orders.find((o) => isOpenDiningOrder(o)) || null;
}

/** Cuenta abierta de mesa con comandas completas (refresco desde servidor). */
export async function loadOpenDiningOrderForTable(
  userId: string,
  tableId: string,
): Promise<DiningOrder | null> {
  const order = await findOpenDiningOrderForTable(userId, tableId);
  if (!order?._id) return order;
  try {
    return await getDiningOrderRequest(userId, order._id);
  } catch {
    return order;
  }
}

export async function ensureOpenDiningOrder(params: {
  userId: string;
  businessId: string;
  tableId: string;
  tableNumber: number;
  tableName: string;
  guests: number;
  createdBy: string;
  createdByName: string;
  zone?: string;
}): Promise<DiningOrder> {
  const existing = await findOpenDiningOrderForTable(params.userId, params.tableId);
  if (existing) return existing;

  return createDiningOrderRequest(params.userId, {
    businessId: params.businessId,
    tableId: params.tableId,
    tableNumber: params.tableNumber,
    tableName: params.tableName,
    zone: params.zone || '',
    guests: params.guests,
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    comandas: [],
    status: 'open',
  });
}

export async function addCartToDiningAccount(params: {
  userId: string;
  orderId: string;
  lines: RestaurantCartLine[];
  createdBy: string;
  createdByName: string;
  notes?: string;
  sendToKitchen?: boolean;
}): Promise<{ order: DiningOrder; comanda: DiningComanda }> {
  const items = cartLinesToDiningItems(params.lines);
  const { order, comanda } = await addComandaRequest(params.userId, params.orderId, {
    items,
    createdBy: params.createdBy,
    createdByName: params.createdByName,
    notes: params.notes || '',
    status: 'draft',
  });

  if (params.sendToKitchen && comanda?.id) {
    const sent = await sendComandaToKitchenRequest(params.userId, params.orderId, comanda.id);
    return { order: sent, comanda: sent.comandas.find((c) => c.id === comanda.id) || comanda };
  }

  return { order, comanda };
}

export async function payAndCloseDiningOrder(params: {
  userId: string;
  order: DiningOrder;
  payment: {
    method: string;
    amount: number;
    amountReceived?: number;
    changeGiven?: number;
    paidBy: string;
    paidByName: string;
    splitLabel?: string;
  };
}): Promise<DiningOrder> {
  const { order, fullyPaid } = await payDiningOrderRequest(params.userId, params.order._id, params.payment);
  if (fullyPaid) {
    return closeDiningOrderRequest(params.userId, order._id);
  }
  return order;
}

export function diningOrderPaidAmount(order: DiningOrder): number {
  return (order.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
}

export function diningOrderDueAmount(order: DiningOrder): number {
  return Math.max(0, Number(order.total || 0) - diningOrderPaidAmount(order));
}

export function countDiningOrderItems(order: DiningOrder): number {
  return (order.comandas || []).reduce(
    (s, c) => s + (c.items || []).reduce((n, i) => n + Number(i.quantity || 0), 0),
    0,
  );
}

export type DiningAccountLineView = {
  key: string;
  comandaNumber: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string;
};

/** Líneas ya guardadas en la cuenta de mesa (comandas persistidas). */
export function flattenDiningAccountLines(order: DiningOrder): DiningAccountLineView[] {
  const out: DiningAccountLineView[] = [];
  for (const comanda of order.comandas || []) {
    if (comanda.status === 'cancelled') continue;
    for (const item of comanda.items || []) {
      if (item.status === 'cancelled') continue;
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.price || 0);
      out.push({
        key: `${comanda.id}:${item.id}`,
        comandaNumber: Number(comanda.orderNumber || 0),
        name: String(item.name || 'Producto'),
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
        notes: String(item.notes || '').trim(),
      });
    }
  }
  return out;
}

export function computeEqualSplitAmounts(total: number, parts: number): number[] {
  const count = Math.max(2, Math.floor(parts));
  const perPart = Math.round(total / count * 100) / 100;
  const remainder = Math.round((total - perPart * count) * 100) / 100;
  return Array.from({ length: count }, (_, i) => (i === 0 ? perPart + remainder : perPart));
}

export type SplitPartView = {
  index: number;
  label: string;
  amount: number;
  paid: boolean;
};

export function buildSplitPartViews(order: DiningOrder): SplitPartView[] {
  if (!order.splitMode || order.splitMode === 'none' || Number(order.splitCount || 0) < 2) {
    return [];
  }
  const amounts = computeEqualSplitAmounts(Number(order.total || 0), order.splitCount);
  const payments = order.payments || [];
  return amounts.map((amount, index) => {
    const label = `Parte ${index + 1}/${order.splitCount}`;
    const paid = payments.some(
      (p) => p.splitLabel === label && Number(p.amount || 0) >= amount - 0.02,
    );
    return { index, label, amount, paid };
  });
}

export async function splitDiningOrderEqual(
  userId: string,
  orderId: string,
  parts: number,
): Promise<{ order: DiningOrder; splitAmounts: number[] }> {
  const result = await splitDiningOrderRequest(userId, orderId, 'equal', { parts });
  const splitAmounts = result.splitAmounts
    || computeEqualSplitAmounts(Number(result.order.total || 0), parts);
  return { order: result.order, splitAmounts };
}

export async function applyDiningOrderDiscount(params: {
  userId: string;
  orderId: string;
  discountPercent?: number;
  discount?: number;
  discountReason?: string;
}): Promise<DiningOrder> {
  const discountPercent = Math.max(0, Math.min(100, Number(params.discountPercent || 0)));
  const discount = Math.max(0, Number(params.discount || 0));
  return updateDiningOrderRequest(params.userId, params.orderId, {
    discountPercent: discountPercent > 0 ? discountPercent : 0,
    discount: discountPercent > 0 ? 0 : discount,
    discountReason: String(params.discountReason || '').trim(),
  });
}

export async function moveDiningOrderToTable(params: {
  userId: string;
  order: DiningOrder;
  targetTable: Pick<DiningTable, '_id' | 'number' | 'name' | 'zone'>;
}): Promise<DiningOrder> {
  const { userId, order, targetTable } = params;
  if (targetTable._id === order.tableId) {
    return order;
  }
  const existing = await findOpenDiningOrderForTable(userId, targetTable._id);
  if (existing && existing._id !== order._id) {
    throw new Error('La mesa destino ya tiene una cuenta abierta');
  }

  const updated = await updateDiningOrderRequest(userId, order._id, {
    tableId: targetTable._id,
    tableNumber: targetTable.number,
    tableName: targetTable.name || `Mesa ${targetTable.number}`,
    zone: targetTable.zone || order.zone,
  });

  if (order.tableId) {
    await changeTableStatusRequest(userId, order.tableId, tableStatusOnRelease(), {
      currentGuests: 0,
      occupiedBy: '',
    });
  }

  await changeTableStatusRequest(userId, targetTable._id, 'occupied', {
    currentGuests: Math.max(1, order.guests || 1),
    occupiedBy: order.clientName || order.createdByName || 'TPV',
  });

  return updated;
}
