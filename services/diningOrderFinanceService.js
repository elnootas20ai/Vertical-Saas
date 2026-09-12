/**
 * Sync cuenta de mesa cobrada → movimiento financiero (idempotente).
 */
import {
  ensureDatabase,
  getFinanceDbName,
  buildFinanceDocument,
  listFinanceByUser,
  putDocument,
} from './couchdb.js';
import { calcLinesTaxBreakdown } from '../shared/tax/spainVat.js';
import logger from './logger.js';

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function incomeAmount(order) {
  const fromPayments = (order?.payments || []).reduce((s, p) => s + Number(p?.amount || 0), 0);
  const total = Number(order?.total || 0);
  const gross = fromPayments > 0 ? fromPayments : total;
  return round2(Math.max(0, gross));
}

function orderRef(orderId) {
  return `MESA-${orderId}`;
}

function businessIdOf(order) {
  return String(order?.business_id || order?.businessId || '').replace(/^business:/, '').trim();
}

function diningTaxAmounts(order, total) {
  const lines = (order?.comandas || [])
    .filter((comanda) => comanda?.status !== 'cancelled')
    .flatMap((comanda) => (comanda.items || [])
      .filter((item) => item?.status !== 'cancelled')
      .map((item) => ({
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.price || 0),
        taxRate: Number(item.taxRate ?? 10),
        category: item.category,
      })));
  const grossBeforeDiscount = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  const ratio = grossBeforeDiscount > 0 ? Math.min(1, total / grossBeforeDiscount) : 1;
  const breakdown = calcLinesTaxBreakdown(
    lines.map((line) => ({
      ...line,
      total: round2(line.quantity * line.unitPrice * ratio),
    })),
    {
      enabled: true,
      pricesIncludeTax: true,
      defaultFoodTaxRate: 10,
      defaultStandardTaxRate: 21,
    },
  );
  if (breakdown.gross > 0.009) {
    const taxAmount = Math.min(round2(total), breakdown.tax);
    return {
      amountBase: round2(total - taxAmount),
      taxAmount,
      totalAmount: round2(total),
      taxRate: breakdown.effectiveTaxRate,
    };
  }
  const amountBase = round2(total / 1.10);
  return {
    amountBase,
    taxAmount: round2(total - amountBase),
    totalAmount: round2(total),
    taxRate: 10,
  };
}

async function hasMovement(req, userId, predicate) {
  const movements = await listFinanceByUser(req, userId);
  return movements.some(predicate);
}

export async function ensureDiningOrderIncomeServer(req, userId, order) {
  try {
    if (!userId || !order?._id) return false;
    const st = String(order.status || '').toLowerCase();
    if (st === 'cancelled') return false;
    const total = incomeAmount(order);
    if (!(total > 0.009)) return false;
    if (!(st === 'paid' || st === 'closed' || total + 0.02 >= Number(order.total || 0))) {
      return false;
    }

    const id = order._id;
    const already = await hasMovement(req, userId, (m) => (
      (m.source === 'dining_order' && m.sourceRef === id)
      || m.reference === orderRef(id)
      || String(m.notes || '').includes(`dining_order:${id}`)
    ));
    if (already) return true;

    const finDb = getFinanceDbName();
    await ensureDatabase(req, finDb);
    const dateStr = String(
      order.paidAt || order.closedAt || order.updatedAt || order.createdAt || new Date().toISOString(),
    ).slice(0, 10);
    const tax = diningTaxAmounts(order, total);
    const tableLabel = order.tableName
      || (order.tableNumber != null ? `Mesa ${order.tableNumber}` : 'Sala');
    const bid = businessIdOf(order);
    const payMethod = String(order.payments?.[0]?.method || 'mixto');

    const movement = buildFinanceDocument(userId, {
      type: 'cobro',
      concept: `Venta sala · ${tableLabel}${order.clientName ? ` · ${order.clientName}` : ''}`,
      reference: orderRef(id),
      category: 'ventas',
      amountBase: tax.amountBase,
      taxRate: tax.taxRate,
      taxAmount: tax.taxAmount,
      totalAmount: tax.totalAmount,
      date: dateStr,
      payMethod,
      notes: `dining_order:${id}`,
      source: 'dining_order',
      sourceRef: id,
      business_id: bid || undefined,
    });
    await putDocument(req, finDb, movement._id, movement);
    return true;
  } catch (err) {
    logger.warn({ tag: 'DINING_FINANCE', orderId: order?._id, err: err?.message }, 'Error sync finanzas mesa');
    return false;
  }
}
