import type {
  CashDenominationCount,
  TpvPaymentMethod,
  TpvRegisterSession,
  TpvRegisterSummary,
} from './deliveryApi';

/** Canonical TPV payment method (legacy orders may store `otros`). */
export function normalizeTpvPaymentMethod(raw: string | null | undefined): TpvPaymentMethod {
  const pm = String(raw || '').trim().toLowerCase();
  if (pm === 'otros') return 'otro';
  if (pm === 'efectivo' || pm === 'tarjeta' || pm === 'bizum' || pm === 'online' || pm === 'otro') return pm;
  return 'efectivo';
}

function isCashPaymentMethod(raw: string | null | undefined): boolean {
  return normalizeTpvPaymentMethod(raw) === 'efectivo';
}

/** Valores EUR por clave de arqueo (mismo set que el gate TPV). */
const DENOMINATION_VALUES: Record<keyof CashDenominationCount, number> = {
  bills_500: 500,
  bills_200: 200,
  bills_100: 100,
  bills_50: 50,
  bills_20: 20,
  bills_10: 10,
  bills_5: 5,
  coins_2: 2,
  coins_1: 1,
  coins_050: 0.5,
  coins_020: 0.2,
  coins_010: 0.1,
  coins_005: 0.05,
  coins_002: 0.02,
  coins_001: 0.01,
};

/** Suma billetes/monedas del conteo de apertura (o cierre). */
export function sumCashDenominationCount(counts: CashDenominationCount | null | undefined): number {
  if (!counts || typeof counts !== 'object') return 0;
  let total = 0;
  for (const [key, value] of Object.entries(DENOMINATION_VALUES)) {
    const qty = Number((counts as Record<string, unknown>)[key] || 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    total += qty * value;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Fondo de apertura efectivo.
 * Si `initialCashAmount` quedó en 0 por un update malo pero el conteo de billetes sigue,
 * usamos el conteo (evita bloquear salidas con caja abierta a 100 €).
 */
export function resolveTpvOpeningCashAmount(
  session: Pick<TpvRegisterSession, 'initialCashAmount' | 'openingCashCount'> | null | undefined,
): number {
  if (!session) return 0;
  const declared = Number(session.initialCashAmount);
  if (Number.isFinite(declared) && declared > 0) {
    return Math.round(declared * 100) / 100;
  }
  const fromCount = sumCashDenominationCount(session.openingCashCount);
  if (fromCount > 0) return fromCount;
  if (Number.isFinite(declared) && declared === 0) return 0;
  return 0;
}

export function sumCashStaffConsumption(session: Pick<TpvRegisterSession, 'transactions'>): number {
  return sumAmount(
    session.transactions,
    (t) => t.type === 'staff_consumption' && isCashPaymentMethod(t.paymentMethod),
  );
}

export function sumCashReturns(session: Pick<TpvRegisterSession, 'transactions'>): number {
  return sumAmount(session.transactions, (t) => t.type === 'return' && isCashPaymentMethod(t.paymentMethod));
}

export function sumCashSales(session: Pick<TpvRegisterSession, 'transactions'>): number {
  return sumAmount(session.transactions, (t) => t.type === 'sale' && isCashPaymentMethod(t.paymentMethod));
}

function sumAmount(txs: TpvRegisterSession['transactions'], predicate: (tx: NonNullable<TpvRegisterSession['transactions']>[number]) => boolean): number {
  return (txs || [])
    .filter(predicate)
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
}

/** Efectivo esperado en caja (fondo apertura + ventas − devoluciones + entradas − salidas). */
export function calcTpvExpectedCash(session: TpvRegisterSession): number {
  const txs = session.transactions || [];
  const cashSales = sumAmount(
    txs,
    (t) => (t.type === 'sale' || t.type === 'staff_consumption') && isCashPaymentMethod(t.paymentMethod),
  );
  const cashReturns = sumCashReturns(session);
  const cashIn = sumAmount(txs, (t) => t.type === 'cash_in');
  const cashOut = sumAmount(txs, (t) => t.type === 'cash_out' || t.type === 'expense');
  const opening = resolveTpvOpeningCashAmount(session);
  return opening + cashSales - cashReturns + cashIn - cashOut;
}

export function buildTpvRegisterSummary(session: TpvRegisterSession): TpvRegisterSummary {
  const transactions = session.transactions || [];
  const sales = transactions.filter((t) => t.type === 'sale');
  const returns = transactions.filter((t) => t.type === 'return');
  const totalSales = sales.reduce((s, t) => s + Number(t.amount || 0), 0);
  const salesByChannel: Record<string, number> = {};
  for (const tx of sales) {
    if (tx.channel) salesByChannel[tx.channel] = (salesByChannel[tx.channel] || 0) + Number(tx.amount || 0);
  }
  const sumByMethod = (method: TpvPaymentMethod) =>
    sales
      .filter((t) => normalizeTpvPaymentMethod(t.paymentMethod) === method)
      .reduce((s, t) => s + Number(t.amount || 0), 0);

  return {
    totalSales,
    salesByMethod: {
      efectivo: sumByMethod('efectivo'),
      tarjeta: sumByMethod('tarjeta'),
      bizum: sumByMethod('bizum'),
      online: sumByMethod('online'),
      otro: sumByMethod('otro'),
    },
    salesByChannel,
    totalReturns: returns.reduce((s, t) => s + Number(t.amount || 0), 0),
    returnCount: returns.length,
    totalCashIn: sumAmount(transactions, (t) => t.type === 'cash_in'),
    totalCashOut: sumAmount(transactions, (t) => t.type === 'cash_out' || t.type === 'expense'),
    totalTips: sumAmount(transactions, (t) => t.type === 'tip'),
    totalTransactions: transactions.length,
    averageTicket: sales.length > 0 ? totalSales / sales.length : 0,
    incidentCount: session.incidents?.length || 0,
  };
}

/**
 * Total vivo de la barra TPV: cobros netos (ventas − cancelaciones/devoluciones)
 * en efectivo + tarjeta + entradas − salidas.
 * (No incluye fondo inicial; ese va al arqueo de efectivo.)
 */
export function calcTpvShiftCollectionsTotal(session: TpvRegisterSession): {
  efectivo: number;
  tarjeta: number;
  cashIn: number;
  cashOut: number;
  total: number;
} {
  const summary = buildTpvRegisterSummary(session);
  const returnsByMethod = sumReturnsByPaymentMethod(session);
  const efectivo = round2(
    Math.max(0, Number(summary.salesByMethod.efectivo || 0) - returnsByMethod.efectivo),
  );
  const tarjeta = round2(
    Math.max(0, Number(summary.salesByMethod.tarjeta || 0) - returnsByMethod.tarjeta),
  );
  const cashIn = Number(summary.totalCashIn || 0);
  const cashOut = Number(summary.totalCashOut || 0);
  const total = round2(efectivo + tarjeta + cashIn - cashOut);
  return { efectivo, tarjeta, cashIn, cashOut, total };
}

function round2(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

function sumReturnsByPaymentMethod(session: Pick<TpvRegisterSession, 'transactions'>): Record<TpvPaymentMethod, number> {
  const out: Record<TpvPaymentMethod, number> = {
    efectivo: 0,
    tarjeta: 0,
    bizum: 0,
    online: 0,
    otro: 0,
  };
  for (const t of session.transactions || []) {
    if (t?.type !== 'return') continue;
    const method = normalizeTpvPaymentMethod(t.paymentMethod);
    out[method] = round2(out[method] + Number(t.amount || 0));
  }
  return out;
}

/**
 * Ops de cobro vivos en la barra: pedidos (o ventas sueltas) cuyo neto venta−devolución > 0.
 * Así al cancelar un pedido deja de contar en «N ops».
 */
export function countNetSaleOperations(session: Pick<TpvRegisterSession, 'transactions'>): number {
  const txs = session.transactions || [];
  const netByOrder = new Map<string, number>();
  let anonNet = 0;
  let anonSaleCount = 0;

  for (const t of txs) {
    if (!t || (t.type !== 'sale' && t.type !== 'return')) continue;
    const amount = Number(t.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const signed = t.type === 'sale' ? amount : -amount;
    const orderId = String(t.orderId || t.linkedDeliveryOrderId || '').trim();
    if (!orderId) {
      anonNet = round2(anonNet + signed);
      if (t.type === 'sale') anonSaleCount += 1;
      continue;
    }
    netByOrder.set(orderId, round2((netByOrder.get(orderId) || 0) + signed));
  }

  let count = 0;
  for (const net of netByOrder.values()) {
    if (net > 0.001) count += 1;
  }
  // Ventas sin orderId (apps/manuales): si el neto sigue positivo, cuentan las ventas brutas sueltas.
  if (anonNet > 0.001) count += Math.max(1, anonSaleCount);
  return count;
}

export function isCajaRegistrationOk(status: string | null | undefined): boolean {
  return status === 'registered' || status === 'nothing_to_register' || status === 'already_registered';
}

/** Compara recuento de pedidos vs ventas netas registradas en caja. */
export function reconcileRegisterTotals(
  summary: Pick<{ totalSales: number; totalReturns: number }, 'totalSales' | 'totalReturns'>,
  breakdown: Pick<{ totalRevenue: number; orderCount: number }, 'totalRevenue' | 'orderCount'>,
): {
  netRegisterSales: number;
  breakdownTotal: number;
  orderCount: number;
  difference: number;
  aligned: boolean;
} {
  const netRegisterSales = Math.round((Number(summary.totalSales || 0) - Number(summary.totalReturns || 0)) * 100) / 100;
  const breakdownTotal = Math.round(Number(breakdown.totalRevenue || 0) * 100) / 100;
  const difference = Math.round((breakdownTotal - netRegisterSales) * 100) / 100;
  return {
    netRegisterSales,
    breakdownTotal,
    orderCount: breakdown.orderCount,
    difference,
    aligned: Math.abs(difference) < 0.02,
  };
}
