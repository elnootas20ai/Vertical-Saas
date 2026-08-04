import type { DiningOrder, DiningTableStatus } from './salaApi';
import type { ExtendedDiningTable } from './salaStudioTypes';
import { STATUS_LABELS } from './salaStudioTypes';

export type TableVisualStatus = DiningTableStatus;

export type RestaurantTableLiveInfo = {
  tableId: string;
  visualStatus: TableVisualStatus;
  label: string;
  openTotal: number;
  openItemCount: number;
  occupiedMinutes: number | null;
  openOrderId: string | null;
  hasOpenAccount: boolean;
  reservationGuest?: string;
  reservationTime?: string;
};

const OPEN_ORDER_STATUSES = new Set(['open', 'pending_payment', 'served']);

export function isOpenDiningOrder(order: DiningOrder): boolean {
  return OPEN_ORDER_STATUSES.has(String(order.status || '').trim());
}

export function openOrdersByTableId(orders: DiningOrder[]): Map<string, DiningOrder> {
  const map = new Map<string, DiningOrder>();
  for (const order of orders) {
    if (!isOpenDiningOrder(order)) continue;
    const tableId = String(order.tableId || '').trim();
    if (!tableId) continue;
    const prev = map.get(tableId);
    if (!prev || String(order.updatedAt || order.createdAt) > String(prev.updatedAt || prev.createdAt)) {
      map.set(tableId, order);
    }
  }
  return map;
}

function countOpenItems(order: DiningOrder): number {
  return (order.comandas || []).reduce(
    (sum, c) => sum + (c.items || []).reduce((s, i) => s + (i.quantity || 0), 0),
    0,
  );
}

/** Hay pedido TPV real (líneas o importe), no solo mesa sentada / cuenta vacía. */
export function diningOrderHasTpvPedido(order: DiningOrder | null | undefined): boolean {
  if (!order || !isOpenDiningOrder(order)) return false;
  if (Number(order.total || 0) > 0) return true;
  return countOpenItems(order) > 0;
}

/**
 * Estado visual en el plano del TPV:
 * «Ocupada» / «Cuenta» solo si hay pedido TPV; si no, libre (salvo reservada / por limpiar).
 */
export function resolveTpvFloorVisualStatus(
  table: { status: DiningTableStatus },
  openOrder?: DiningOrder | null,
): DiningTableStatus {
  const status = table.status;
  if (status === 'hidden') return 'hidden';
  if (status === 'unavailable') return 'unavailable';
  if (status === 'reserved') return 'reserved';

  if (diningOrderHasTpvPedido(openOrder)) {
    if (openOrder?.status === 'pending_payment' || status === 'pending_payment') {
      return 'pending_payment';
    }
    return 'occupied';
  }

  return 'available';
}

function occupiedMinutesFrom(table: ExtendedDiningTable): number | null {
  const at = String(table.occupiedAt || '').trim();
  if (!at) return null;
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.max(0, Math.floor(ms / 60000));
}

/** Estado visual de la mesa: prioriza cuenta abierta > estado persistido. */
export function resolveRestaurantTableLiveInfo(
  table: ExtendedDiningTable,
  openOrder?: DiningOrder | null,
  reservation?: { guestName: string; time: string } | null,
): RestaurantTableLiveInfo {
  const openTotal = openOrder ? Number(openOrder.total || 0) : 0;
  const openItemCount = openOrder ? countOpenItems(openOrder) : 0;
  const hasOpenAccount = Boolean(openOrder && openTotal > 0);
  const occupiedMinutes = occupiedMinutesFrom(table);

  let visualStatus: TableVisualStatus = table.status;

  if (hasOpenAccount || table.status === 'pending_payment') {
    visualStatus = 'pending_payment';
  } else if (table.status === 'pending_order') {
    visualStatus = 'pending_order';
  } else if (table.status === 'served') {
    visualStatus = 'served';
  } else if (table.status === 'occupied') {
    visualStatus = 'occupied';
  } else if (table.status === 'reserved' || reservation) {
    visualStatus = 'reserved';
  } else if (table.status === 'unavailable') {
    visualStatus = 'unavailable';
  } else {
    visualStatus = 'available';
  }

  const reservationGuest = reservation?.guestName?.trim() || '';
  const reservationTime = reservation?.time?.trim() || '';
  const label = hasOpenAccount
    ? `${formatTableMoney(openTotal)}`
    : reservationGuest
      ? `${reservationTime ? `${reservationTime.slice(0, 5)} · ` : ''}${reservationGuest}`
      : STATUS_LABELS[visualStatus] || visualStatus;

  return {
    tableId: table._id,
    visualStatus,
    label,
    openTotal,
    openItemCount,
    occupiedMinutes,
    openOrderId: openOrder?.id || openOrder?._id || null,
    hasOpenAccount,
    reservationGuest: reservationGuest || undefined,
    reservationTime: reservationTime || undefined,
  };
}

export function formatTableMoney(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatOccupiedTime(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
