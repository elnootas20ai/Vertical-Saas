import type { TpvPaymentMethod, TpvRegisterSession, TpvRegisterSummary } from './deliveryApi';

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

function sumAmount(txs: TpvRegisterSession['transactions'], predicate: (tx: NonNullable<TpvRegisterSession['transactions']>[number]) => boolean): number {
  return (txs || [])
    .filter(predicate)
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
}

/** Efectivo esperado en caja (ventas, devoluciones, consumos equipo en efectivo, entradas/salidas). */
export function calcTpvExpectedCash(session: TpvRegisterSession): number {
  const txs = session.transactions || [];
  const cashSales = sumAmount(
    txs,
    (t) => (t.type === 'sale' || t.type === 'staff_consumption') && isCashPaymentMethod(t.paymentMethod),
  );
  const cashReturns = sumAmount(txs, (t) => t.type === 'return' && isCashPaymentMethod(t.paymentMethod));
  const cashIn = sumAmount(txs, (t) => t.type === 'cash_in');
  const cashOut = sumAmount(txs, (t) => t.type === 'cash_out' || t.type === 'expense');
  return Number(session.initialCashAmount || 0) + cashSales - cashReturns + cashIn - cashOut;
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

export function isCajaRegistrationOk(status: string | null | undefined): boolean {
  return status === 'registered' || status === 'nothing_to_register' || status === 'already_registered';
}
