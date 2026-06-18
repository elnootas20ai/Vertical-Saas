import type { DeliveryOrder, TpvRegisterSession, TpvRegisterSummary } from './deliveryApi';
import { buildTpvRegisterSummary } from './tpvCajaMath';

const CANCELLED_STATUSES = new Set(['cancelled', 'cancelado']);
const REFUNDED_STATUSES = new Set(['devuelto']);

export function isCancelledDeliveryOrder(order: { status?: string | null }): boolean {
  return CANCELLED_STATUSES.has(String(order.status || '').toLowerCase());
}

export function isRefundedDeliveryOrder(order: { status?: string | null; paymentStatus?: string | null }): boolean {
  if (String(order.paymentStatus || '').toLowerCase() === 'refunded') return true;
  return REFUNDED_STATUSES.has(String(order.status || '').toLowerCase());
}

/** Pedido cobrado (Cobrar y enviar, entrega con pago, etc.). */
export function orderAlreadyCobrado(order: Pick<DeliveryOrder, 'totalAmount' | 'paidAmount' | 'paymentStatus' | 'paymentCollected'>): boolean {
  if (String(order.paymentStatus || '').toLowerCase() === 'refunded') return false;
  const total = Number(order.totalAmount || 0);
  const paid = Number(order.paidAmount || 0);
  if (order.paymentStatus === 'paid' || order.paymentCollected) return true;
  if (paid > 0 && total > 0 && paid >= total) return true;
  return false;
}

/** Tablero TPV «Completados en turno»: solo entregados (montaje → reparto → entregado). */
export function isDeliveredBoardOrder(order: Pick<DeliveryOrder, 'status' | 'paymentStatus'>): boolean {
  if (isCancelledDeliveryOrder(order)) return false;
  if (isRefundedDeliveryOrder(order)) return false;
  return String(order.status || '').toLowerCase() === 'entregado';
}

/** Recuento caja / ventas del turno: entregados o ya cobrados en TPV. */
export function isCompletedShiftOrder(order: Pick<DeliveryOrder, 'status' | 'totalAmount' | 'paidAmount' | 'paymentStatus' | 'paymentCollected'>): boolean {
  if (isCancelledDeliveryOrder(order)) return false;
  if (isRefundedDeliveryOrder(order)) return false;
  return String(order.status || '').toLowerCase() === 'entregado' || orderAlreadyCobrado(order);
}

/** Día local del navegador (YYYY-MM-DD). Una sola fuente para TPV, Caja y gerente. */
export function localCalendarDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDayBounds(d = new Date()): { from: string; to: string; dayKey: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString(), dayKey: localCalendarDayKey(d) };
}

export function localDayBoundsForKey(dayKey: string): { from: string; to: string } {
  const parts = String(dayKey || '').split('-').map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return localDayBounds();
  }
  const [y, m, d] = parts;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function isLocalCalendarDay(iso: string | undefined, dayKey: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return localCalendarDayKey(d) === dayKey;
}

function parseDayKey(dayKey: string): number {
  const t = new Date(`${dayKey}T12:00:00`).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Turno activo en un día del calendario (desde apertura hasta cierre o hoy si sigue abierto). */
export function sessionActiveOnCalendarDay(
  session: TpvRegisterSession,
  dayKey: string,
  now = new Date(),
): boolean {
  const openedAt = String(session.openedAt || '').trim();
  if (!openedAt) return false;
  const openKey = localCalendarDayKey(new Date(openedAt));
  const endIso = session.status === 'open' ? now.toISOString() : String(session.closedAt || now.toISOString());
  const closeKey = localCalendarDayKey(new Date(endIso));
  const target = parseDayKey(dayKey);
  return target >= parseDayKey(openKey) && target <= parseDayKey(closeKey);
}

/** Pedido dentro del turno de caja (desde apertura hasta cierre). Sin caja abierta → ninguno. */
export function orderInRegisterSession(
  order: { createdAt?: string },
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'> | null | undefined,
): boolean {
  const createdAt = String(order.createdAt || '').trim();
  if (!createdAt) return false;
  const openedAt = String(session?.openedAt || '').trim();
  if (!openedAt) return false;
  const createdMs = new Date(createdAt).getTime();
  const openedMs = new Date(openedAt).getTime();
  if (Number.isNaN(createdMs) || Number.isNaN(openedMs)) return true;
  if (createdMs < openedMs) return false;
  if (session?.status === 'closed') {
    const closedAt = String(session.closedAt || '').trim();
    if (closedAt) {
      const closedMs = new Date(closedAt).getTime();
      if (!Number.isNaN(closedMs) && createdMs > closedMs) return false;
    }
  }
  return true;
}

export function transactionOnCalendarDay(tx: { date?: string }, dayKey: string): boolean {
  return isLocalCalendarDay(tx.date, dayKey);
}

export function filterSessionTransactionsForDay(
  session: TpvRegisterSession,
  dayKey: string,
): TpvRegisterSession['transactions'] {
  return (session.transactions || []).filter((tx) => transactionOnCalendarDay(tx, dayKey));
}

export function buildTpvRegisterSummaryForDay(
  session: TpvRegisterSession,
  dayKey: string,
): TpvRegisterSummary {
  return buildTpvRegisterSummary({
    ...session,
    transactions: filterSessionTransactionsForDay(session, dayKey),
  });
}

/** Rango API de pedidos: desde apertura de caja hasta fin del día local. */
export function orderLoadBoundsForOpenSession(sessionOpenedAt: string | null | undefined): {
  from: string;
  to: string;
} {
  const today = localDayBounds();
  const openedAt = String(sessionOpenedAt || '').trim();
  if (!openedAt) return { from: today.from, to: today.to };
  const opened = new Date(openedAt);
  if (Number.isNaN(opened.getTime())) return { from: today.from, to: today.to };
  return { from: opened.toISOString(), to: today.to };
}

/** Rango de pedidos para recuento de cierre (abierta o cerrada). */
export function registerSessionOrderLoadBounds(
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'>,
  now = new Date(),
): { from: string; to: string } {
  const openedAt = String(session.openedAt || '').trim();
  const to = session.status === 'closed'
    ? String(session.closedAt || now.toISOString())
    : orderLoadBoundsForOpenSession(openedAt).to;
  if (!openedAt) return localDayBounds(now);
  return { from: openedAt, to };
}

export function registerSessionSpansMultipleDays(
  session: Pick<TpvRegisterSession, 'openedAt' | 'status' | 'closedAt'>,
  now = new Date(),
): boolean {
  const openedAt = String(session.openedAt || '').trim();
  if (!openedAt) return false;
  const openKey = localCalendarDayKey(new Date(openedAt));
  const endKey = session.status === 'open'
    ? localCalendarDayKey(now)
    : localCalendarDayKey(new Date(session.closedAt || now));
  return openKey !== endKey;
}
