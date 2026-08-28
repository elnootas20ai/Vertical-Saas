import { v4 as uuidv4 } from 'uuid';
import type { CatalogItem, DeliveryOrderItem } from './deliveryApi';
import type { DiningComanda, DiningOrder, DiningOrderItem } from './salaApi';
import {
  addComandaRequest,
  cancelComandaRequest,
  changeTableStatusRequest,
  closeDiningOrderRequest,
  createDiningOrderRequest,
  getDiningOrderRequest,
  listDiningOrdersRequest,
  payDiningOrderRequest,
  sendComandaToKitchenRequest,
  splitDiningOrderRequest,
  updateComandaRequest,
  updateDiningOrderRequest,
  type DiningTable,
} from './salaApi';
import { tableStatusOnRelease } from './restaurantTableStatus';
import { isOpenDiningOrder } from './restaurantTableDisplay';
import type { CartLineCustomization } from './catalogCustomization';
import {
  buildOrderExtras,
  buildOrderIngredients,
  buildOrderStructuredCustomization,
  cartLineUnitPrice,
  productBrandIdsFromItem,
} from './catalogCustomization';
import { enqueueTpvOfflineItem, isBrowserOnline } from './tpvTabletOffline';
import { optimisticAppendDraftComanda } from './restaurantTpvOfflineSync';
import {
  formatUnavailableCartNames,
  unavailableCartLines,
} from './restaurantCatalogAvailability';

export type RestaurantCartLine = {
  lineId: string;
  catalogItem: CatalogItem;
  quantity: number;
  customization: CartLineCustomization;
};

export function cartLinesToDiningItems(lines: RestaurantCartLine[]): DiningOrderItem[] {
  return lines.map((ci) => {
    const extras = buildOrderExtras(ci.customization);
    const ingredients = buildOrderIngredients(ci.catalogItem, ci.customization);
    const structured = buildOrderStructuredCustomization(ci.customization);
    return {
      id: ci.lineId || uuidv4(),
      productId: ci.catalogItem._id,
      name: ci.catalogItem.name,
      price: cartLineUnitPrice(ci.catalogItem.unitPrice, ci.customization),
      quantity: ci.quantity,
      category: ci.catalogItem.category || '',
      notes: ci.customization.notes?.trim() || '',
      modifiers: extras,
      extras,
      ingredients,
      status: 'pending' as const,
      cancelledReason: '',
      cancelledBy: '',
      brandIds: productBrandIdsFromItem(ci.catalogItem),
      ...structured,
    };
  });
}

export function deliveryItemsToDiningItems(items: DeliveryOrderItem[]): DiningOrderItem[] {
  return items.map((i) => {
    const extras = Array.isArray(i.extras)
      ? i.extras.map((e) => String(e || '').trim()).filter(Boolean)
      : [];
    const ingredients = Array.isArray(i.ingredients)
      ? i.ingredients
          .map((ing) => ({
            name: String(ing?.name || '').trim(),
            quantity: String(ing?.quantity || 'normal').trim() || 'normal',
          }))
          .filter((ing) => ing.name)
      : [];
    const hh = i.halfHalfPizza;
    const halfHalfPizza =
      hh?.firstProductId && hh?.secondProductId
        ? {
            firstProductId: String(hh.firstProductId),
            firstProductName: String(hh.firstProductName || ''),
            secondProductId: String(hh.secondProductId),
            secondProductName: String(hh.secondProductName || ''),
          }
        : undefined;
    const comboSelections = Array.isArray(i.comboSelections)
      ? i.comboSelections
          .filter((ref) => ref?.productId && Number(ref.quantity || 0) > 0)
          .map((ref) => ({
            productId: String(ref.productId),
            productName: String(ref.productName || ''),
            quantity: Number(ref.quantity || 1),
            ...(ref.slotKind ? { slotKind: String(ref.slotKind) } : {}),
            ...(ref.instanceId ? { instanceId: String(ref.instanceId) } : {}),
          }))
      : undefined;
    return {
      id: i.id || uuidv4(),
      productId: String(i.catalogItemId || i.id || ''),
      name: i.name,
      price: Number(i.unitPrice || 0),
      quantity: Number(i.quantity || 1),
      category: i.category || '',
      notes: i.notes || '',
      modifiers: extras,
      extras,
      ingredients,
      status: 'pending' as const,
      cancelledReason: '',
      cancelledBy: '',
      brandIds: Array.isArray(i.brandIds)
        ? i.brandIds.map((b) => String(b || '').trim()).filter(Boolean)
        : [],
      ...(halfHalfPizza ? { halfHalfPizza } : {}),
      ...(comboSelections && comboSelections.length > 0 ? { comboSelections } : {}),
    };
  });
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
  /** Cuenta actual para merge optimista offline. */
  currentOrder?: DiningOrder | null;
}): Promise<{ order: DiningOrder; comanda: DiningComanda; queuedOffline?: boolean }> {
  const blocked = unavailableCartLines(params.lines);
  if (blocked.length > 0) {
    throw new Error(`Agotado en carta: ${formatUnavailableCartNames(params.lines)}`);
  }

  const items = cartLinesToDiningItems(params.lines);

  if (!isBrowserOnline()) {
    const clientMutationId = uuidv4();
    enqueueTpvOfflineItem('dining_comanda_add', {
      userId: params.userId,
      orderId: params.orderId,
      items,
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      notes: params.notes || '',
      sendToKitchen: Boolean(params.sendToKitchen),
      clientMutationId,
    });
    const base = params.currentOrder;
    if (!base || base._id !== params.orderId) {
      throw new Error('Sin conexión: no hay cuenta local para guardar. Reabre la mesa cuando haya red.');
    }
    const order = optimisticAppendDraftComanda(base, items, {
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      notes: params.notes || '',
      clientMutationId,
    });
    const comanda = order.comandas[order.comandas.length - 1];
    return { order, comanda, queuedOffline: true };
  }

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

export function diningOrderHasPendingKitchen(order: DiningOrder): boolean {
  return (order.comandas || []).some((c) =>
    ['sent_to_kitchen', 'in_preparation'].includes(String(c.status || '')));
}

/** Comandas en borrador (en cuenta pero aún no en cocina). */
export function listDraftComandaIds(order: DiningOrder | null | undefined): string[] {
  if (!order) return [];
  return (order.comandas || [])
    .filter((c) => {
      if (String(c.status || '') !== 'draft') return false;
      return (c.items || []).some((item) => String(item.status || '') !== 'cancelled');
    })
    .map((c) => String(c.id || '').trim())
    .filter(Boolean);
}

export function diningOrderHasDraftComandas(order: DiningOrder | null | undefined): boolean {
  return listDraftComandaIds(order).length > 0;
}

/** Envía a cocina todas las comandas en borrador de la cuenta. */
export async function sendDraftComandasToKitchen(params: {
  userId: string;
  order: DiningOrder;
}): Promise<DiningOrder> {
  let order = params.order;
  const ids = listDraftComandaIds(order);
  for (const comandaId of ids) {
    order = await sendComandaToKitchenRequest(params.userId, order._id, comandaId);
  }
  return order;
}

export type PayAndCloseDiningResult = {
  order: DiningOrder;
  fullyPaid: boolean;
  cajaRegistration?: { status: string; message?: string } | null;
};

export async function payAndCloseDiningOrder(params: {
  userId: string;
  order: DiningOrder;
  payment: {
    method: string;
    amount: number;
    amountReceived?: number;
    changeGiven?: number;
    tip?: number;
    paidBy: string;
    paidByName: string;
    splitLabel?: string;
  };
  salesPointId?: string;
  salesPointName?: string;
  registerInCaja?: boolean;
  /** Si hay comandas en cocina, fuerza el cierre al cobrar (evita pagado-huérfano). */
  forceCloseIfKitchenPending?: boolean;
}): Promise<PayAndCloseDiningResult & { queuedOffline?: boolean }> {
  if (!isBrowserOnline()) {
    const force =
      Boolean(params.forceCloseIfKitchenPending) && diningOrderHasPendingKitchen(params.order);
    enqueueTpvOfflineItem('dining_pay', {
      userId: params.userId,
      orderId: params.order._id,
      payment: params.payment,
      salesPointId: params.salesPointId || '',
      salesPointName: params.salesPointName || '',
      registerInCaja: params.registerInCaja !== false,
      closeAfterPay: true,
      forceClose: force,
    });
    const paidAmt = Number(params.payment.amount || 0);
    const payments = [
      ...(params.order.payments || []),
      {
        id: `offline-pay-${Date.now()}`,
        method: params.payment.method,
        amount: paidAmt,
        amountReceived: Number(params.payment.amountReceived || paidAmt),
        changeGiven: Number(params.payment.changeGiven || 0),
        tip: Number(params.payment.tip || 0),
        paidBy: params.payment.paidBy,
        paidByName: params.payment.paidByName,
        paidAt: new Date().toISOString(),
        splitLabel: params.payment.splitLabel || '',
      },
    ];
    const paidTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const fullyPaid = paidTotal + 0.001 >= Number(params.order.total || 0);
    return {
      order: {
        ...params.order,
        payments,
        status: fullyPaid ? 'paid' : params.order.status,
        paidAt: fullyPaid ? new Date().toISOString() : params.order.paidAt,
      },
      fullyPaid,
      cajaRegistration: { status: 'queued_offline', message: 'Cobro en cola: se registrará al recuperar red' },
      queuedOffline: true,
    };
  }

  const force =
    Boolean(params.forceCloseIfKitchenPending) && diningOrderHasPendingKitchen(params.order);
  const { order, fullyPaid, cajaRegistration } = await payDiningOrderRequest(
    params.userId,
    params.order._id,
    params.payment,
    {
      salesPointId: params.salesPointId,
      salesPointName: params.salesPointName,
      registerInCaja: params.registerInCaja,
      closeAfterPay: true,
      forceClose: force,
      forceCloseReason: force ? 'Cobrado con cocina pendiente' : '',
    },
  );
  // Compat: APIs antiguas sin closeAfterPay → cerrar en segunda llamada.
  if (fullyPaid && order.status !== 'closed') {
    const closed = await closeDiningOrderRequest(
      params.userId,
      params.order._id,
      force || undefined,
      force ? 'Cobrado con cocina pendiente' : undefined,
    );
    return { order: closed, fullyPaid: true, cajaRegistration };
  }
  return { order, fullyPaid, cajaRegistration };
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
  comandaId: string;
  itemId: string;
  productId: string;
  comandaNumber: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string;
  /** Estado de la comanda (p. ej. draft = sin enviar a cocina). */
  comandaStatus?: string;
};

export type DiningCajaPayLine = {
  id: string;
  catalogItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes?: string;
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
        comandaId: comanda.id,
        itemId: item.id,
        productId: String(item.productId || '').trim(),
        comandaNumber: Number(comanda.orderNumber || 0),
        name: String(item.name || 'Producto'),
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
        notes: String(item.notes || '').trim(),
        comandaStatus: String(comanda.status || ''),
      });
    }
  }
  return out;
}

/**
 * Escala líneas de cuenta al importe cobrado (pago parcial / split).
 * Así cada parte lleva productos reales y la suma de cantidades ≈ cuenta.
 */
export function scaleDiningLinesToPayAmount(
  lines: DiningAccountLineView[],
  payAmount: number,
  dueAmount: number,
): DiningCajaPayLine[] {
  const pay = Math.round(Math.max(0, Number(payAmount) || 0) * 100) / 100;
  const due = Math.round(Math.max(0, Number(dueAmount) || 0) * 100) / 100;
  if (lines.length === 0 || pay <= 0) return [];

  const linesSum = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const base = due > 0.004 ? due : (linesSum > 0 ? linesSum : pay);
  const fullRemaining = Math.abs(pay - base) < 0.02;

  if (fullRemaining) {
    return lines.map((line) => ({
      id: line.itemId || line.key,
      catalogItemId: line.productId || undefined,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: Math.round(line.lineTotal * 100) / 100,
      notes: line.notes || undefined,
    }));
  }

  const ratio = pay / base;
  const scaled = lines.map((line) => {
    const total = Math.round(line.lineTotal * ratio * 100) / 100;
    const quantity = Math.round(line.quantity * ratio * 1000) / 1000;
    const unitPrice = quantity > 0
      ? Math.round((total / quantity) * 100) / 100
      : Math.round(line.unitPrice * ratio * 100) / 100;
    return {
      id: line.itemId || line.key,
      catalogItemId: line.productId || undefined,
      name: line.name,
      quantity: quantity > 0 ? quantity : line.quantity,
      unitPrice,
      total,
      notes: line.notes || undefined,
    };
  }).filter((l) => l.total > 0);

  if (scaled.length === 0) return [];

  const scaledSum = Math.round(scaled.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const remainder = Math.round((pay - scaledSum) * 100) / 100;
  if (remainder !== 0) {
    const maxIndex = scaled.reduce((best, l, i) => (l.total > scaled[best].total ? i : best), 0);
    scaled[maxIndex] = {
      ...scaled[maxIndex],
      total: Math.round((scaled[maxIndex].total + remainder) * 100) / 100,
    };
  }
  return scaled;
}

/** Ítems de caja para un cobro de mesa (completo o parcial/split). */
export function buildDiningCajaPayItems(params: {
  order: DiningOrder;
  payAmount: number;
  dueAmount: number;
  fallbackName: string;
}): DiningCajaPayLine[] {
  const lines = flattenDiningAccountLines(params.order);
  const scaled = scaleDiningLinesToPayAmount(lines, params.payAmount, params.dueAmount);
  if (scaled.length > 0) return scaled;
  const amount = Math.round(Math.max(0, Number(params.payAmount) || 0) * 100) / 100;
  return [{
    id: 'cuenta',
    name: params.fallbackName || 'Cuenta mesa',
    quantity: 1,
    unitPrice: amount,
    total: amount,
  }];
}

/**
 * Anula una línea de la cuenta. Si es la última línea activa de su comanda,
 * cancela la comanda entera (así cocina la ve cancelada); si no, marca solo
 * ese artículo como cancelado y el total se recalcula en servidor.
 */
export async function voidDiningAccountLine(params: {
  userId: string;
  order: DiningOrder;
  comandaId: string;
  itemId: string;
  reason: string;
  cancelledBy: string;
}): Promise<DiningOrder> {
  const { userId, order, comandaId, itemId, reason, cancelledBy } = params;
  const comanda = (order.comandas || []).find((c) => c.id === comandaId);
  if (!comanda) throw new Error('Comanda no encontrada');

  const activeItems = (comanda.items || []).filter((i) => i.status !== 'cancelled');
  const isLastActive = activeItems.length <= 1
    && activeItems.every((i) => i.id === itemId);

  if (isLastActive) {
    return cancelComandaRequest(userId, order._id, comandaId, reason);
  }

  const items = (comanda.items || []).map((i) => (i.id === itemId
    ? { ...i, status: 'cancelled' as const, cancelledReason: reason, cancelledBy }
    : i));
  return updateComandaRequest(userId, order._id, comandaId, { items });
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
  const persisted = Array.isArray(order.splitAmounts) ? order.splitAmounts : [];
  const amounts = persisted.length === Number(order.splitCount)
    && persisted.some((a) => Number(a) > 0)
    ? persisted.map((a) => Number(a) || 0)
    : computeEqualSplitAmounts(Number(order.total || 0), order.splitCount);
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

/**
 * Reescala importes para que sumen exactamente `total` (en céntimos).
 * Se usa al dividir por artículo/importe libre: el servidor exige que la
 * suma de las partes coincida con el total de la cuenta.
 */
export function scaleAmountsToTotal(amounts: number[], total: number): number[] {
  const clean = amounts.map((a) => Math.max(0, Number(a) || 0));
  const sum = clean.reduce((s, a) => s + a, 0);
  const target = Math.round(Number(total || 0) * 100) / 100;
  if (clean.length === 0 || sum <= 0 || target <= 0) return clean;

  const scaled = clean.map((a) => Math.round((a / sum) * target * 100) / 100);
  const scaledSum = Math.round(scaled.reduce((s, a) => s + a, 0) * 100) / 100;
  const remainder = Math.round((target - scaledSum) * 100) / 100;
  if (remainder !== 0) {
    // El redondeo cae en la parte mayor para no dejar importes negativos.
    const maxIndex = scaled.reduce((best, a, i) => (a > scaled[best] ? i : best), 0);
    scaled[maxIndex] = Math.round((scaled[maxIndex] + remainder) * 100) / 100;
  }
  return scaled;
}

export async function splitDiningOrderCustom(
  userId: string,
  orderId: string,
  amounts: number[],
): Promise<{ order: DiningOrder; splitAmounts: number[] }> {
  const result = await splitDiningOrderRequest(userId, orderId, 'custom', { parts: amounts });
  return { order: result.order, splitAmounts: result.splitAmounts || amounts };
}

export async function applyDiningOrderDiscount(params: {
  userId: string;
  orderId: string;
  discountPercent?: number;
  discount?: number;
  discountReason?: string;
  loyaltyRedeem?: { points: number; clientId?: string; reason?: string };
}): Promise<DiningOrder> {
  const discountPercent = Math.max(0, Math.min(100, Number(params.discountPercent || 0)));
  const discount = Math.max(0, Number(params.discount || 0));
  return updateDiningOrderRequest(
    params.userId,
    params.orderId,
    {
      discountPercent: discountPercent > 0 ? discountPercent : 0,
      discount: discountPercent > 0 ? 0 : discount,
      discountReason: String(params.discountReason || '').trim(),
    },
    params.loyaltyRedeem ? { loyaltyRedeem: params.loyaltyRedeem } : undefined,
  );
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
