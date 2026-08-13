/**
 * Cobro TPV → venta en caja local (airbag si Couch/red fallan).
 * El cierre lee la sesión del dispositivo; el SaaS sincroniza después.
 */
import type { DeliveryOrder, TpvPaymentMethod, TpvRegisterSession, TpvRegisterTransaction } from './deliveryApi';
import { normalizeTpvPaymentMethod } from './tpvCajaMath';
import { resolveDeliveryOrderChargeTotal } from './deliveryTicketHelpers';

type RegisterLike = {
  session: TpvRegisterSession | null;
  addTransaction: (tx: Omit<TpvRegisterTransaction, 'id' | 'date'>) => Promise<void>;
} | null | undefined;

/** Tx de pago dividido: no aplicar dedupe idéntico en addTransaction. */
const allowMultipleSaleTxs = new WeakSet<object>();

export function isAllowMultipleSaleTx(tx: object): boolean {
  return allowMultipleSaleTxs.has(tx);
}

export function sessionSaleAmountForOrder(
  session: TpvRegisterSession | null | undefined,
  orderId: string,
): number {
  const oid = String(orderId || '').trim();
  if (!oid || !session) return 0;
  return (session.transactions || [])
    .filter((t) => {
      if (t?.type !== 'sale') return false;
      const tid = String(t.orderId || '').trim();
      const linked = String(t.linkedDeliveryOrderId || '').trim();
      return tid === oid || linked === oid;
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

export function sessionHasSaleForOrder(
  session: TpvRegisterSession | null | undefined,
  orderId: string,
): boolean {
  return sessionSaleAmountForOrder(session, orderId) > 0.001;
}

/**
 * Misma venta ya en caja (mismo pedido + método + importe).
 * Evita el doble conteo airbag/servidor o reintento 409.
 */
export function sessionHasIdenticalSaleForOrder(
  session: TpvRegisterSession | null | undefined,
  orderId: string,
  paymentMethod: string | null | undefined,
  amount: number,
): boolean {
  const oid = String(orderId || '').trim();
  if (!oid || !session) return false;
  const pm = normalizeTpvPaymentMethod(paymentMethod);
  const amt = Math.round(Number(amount || 0) * 100) / 100;
  if (!(amt > 0)) return false;
  return (session.transactions || []).some((t) => {
    if (t?.type !== 'sale') return false;
    const tid = String(t.orderId || '').trim();
    const linked = String(t.linkedDeliveryOrderId || '').trim();
    if (tid !== oid && linked !== oid) return false;
    if (normalizeTpvPaymentMethod(t.paymentMethod) !== pm) return false;
    return Math.abs(Math.round(Number(t.amount || 0) * 100) / 100 - amt) < 0.015;
  });
}

export function buildTpvSaleTxFromOrder(
  order: Pick<
    DeliveryOrder,
    '_id' | 'orderNumber' | 'customerName' | 'channel' | 'paymentMethod' | 'paidAmount' | 'totalAmount'
  >,
  opts?: {
    paymentMethod?: string | null;
    amount?: number;
    registeredBy?: string;
    description?: string;
  },
): Omit<TpvRegisterTransaction, 'id' | 'date'> {
  const amount =
    opts?.amount != null && Number.isFinite(opts.amount)
      ? Math.round(Number(opts.amount) * 100) / 100
      : resolveDeliveryOrderChargeTotal(order as DeliveryOrder);
  const paymentMethod = normalizeTpvPaymentMethod(
    opts?.paymentMethod || order.paymentMethod || 'efectivo',
  ) as TpvPaymentMethod;
  return {
    type: 'sale',
    paymentMethod,
    amount,
    description:
      opts?.description
      || `Pedido ${order.orderNumber || ''} — ${order.customerName || ''}`.trim(),
    orderId: String(order._id || '').trim(),
    orderNumber: String(order.orderNumber || '').trim(),
    linkedDeliveryOrderId: String(order._id || '').trim(),
    channel: String(order.channel || 'tpv').trim() || 'tpv',
    registeredBy: opts?.registeredBy || 'TPV',
  };
}

/**
 * Asegura la venta en la sesión local abierta.
 * No lanza: el cobro del pedido no debe fallar por la caja.
 */
export async function ensureLocalCajaSaleForOrder(
  register: RegisterLike,
  order: Pick<
    DeliveryOrder,
    '_id' | 'orderNumber' | 'customerName' | 'channel' | 'paymentMethod' | 'paidAmount' | 'totalAmount'
  >,
  opts?: {
    paymentMethod?: string | null;
    amount?: number;
    registeredBy?: string;
    /** Pago dividido: permite varias ventas del mismo pedido (efectivo + tarjeta). */
    allowMultiple?: boolean;
  },
): Promise<boolean> {
  if (!register?.session || !register.addTransaction) return false;
  const orderId = String(order._id || '').trim();
  if (!orderId) return false;
  const target =
    opts?.amount != null && Number.isFinite(opts.amount)
      ? Number(opts.amount)
      : resolveDeliveryOrderChargeTotal(order as DeliveryOrder);
  if (!(target > 0)) return false;
  // Idempotente: solo registra lo que falte (evita doble cobro airbag + servidor).
  if (
    !opts?.allowMultiple
    && sessionHasIdenticalSaleForOrder(
      register.session,
      orderId,
      opts?.paymentMethod || order.paymentMethod,
      target,
    )
  ) {
    return true;
  }
  const already = sessionSaleAmountForOrder(register.session, orderId);
  const amount = opts?.allowMultiple
    ? target
    : Math.round((target - already) * 100) / 100;
  if (!(amount > 0.001)) return true;
  try {
    const body = buildTpvSaleTxFromOrder(order, { ...opts, amount });
    if (opts?.allowMultiple) allowMultipleSaleTxs.add(body);
    await register.addTransaction(body);
    return true;
  } catch {
    return false;
  }
}

/** Merge txs servidor + local sin duplicar ventas del mismo pedido. */
export function mergeTpvRegisterTransactions(
  serverTxs: TpvRegisterTransaction[] | undefined,
  localTxs: TpvRegisterTransaction[] | undefined,
): TpvRegisterTransaction[] {
  const byId = new Map<string, TpvRegisterTransaction>();
  for (const t of serverTxs || []) {
    if (t?.id) byId.set(String(t.id), t);
  }
  for (const t of localTxs || []) {
    if (!t?.id) continue;
    const id = String(t.id);
    if (byId.has(id)) continue;
    if (t.type === 'sale') {
      const oid = String(t.orderId || t.linkedDeliveryOrderId || '').trim();
      const onum = String(t.orderNumber || '').trim();
      const dup = [...byId.values()].some((s) => {
        if (s.type !== 'sale') return false;
        const sid = String(s.orderId || s.linkedDeliveryOrderId || '').trim();
        const snum = String(s.orderNumber || '').trim();
        return (oid && sid && oid === sid) || (onum && snum && onum === snum);
      });
      if (dup) continue;
    }
    byId.set(id, t);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(),
  );
}
