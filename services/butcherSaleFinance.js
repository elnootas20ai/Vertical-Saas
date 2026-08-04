/**
 * Sync venta carnicería cobrada/anulada → movimiento financiero (idempotente).
 */
import {
  ensureDatabase,
  getFinanceDbName,
  buildFinanceDocument,
  listFinanceByUser,
  putDocument,
} from './couchdb.js';
import logger from './logger.js';

const TAG = 'BUTCHER_SALE_FINANCE';

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function saleRef(saleId) {
  return `BUTCHER-SALE-${saleId}`;
}

function voidRef(saleId) {
  return `BUTCHER-VOID-${saleId}`;
}

function payMethodLabel(method) {
  const m = String(method || 'cash').toLowerCase();
  if (m === 'card' || m === 'tarjeta') return 'tarjeta';
  if (m === 'bizum') return 'bizum';
  if (m === 'mixed' || m === 'mixto') return 'mixto';
  return 'efectivo';
}

async function hasMovement(req, userId, predicate) {
  const movements = await listFinanceByUser(req, userId);
  return movements.some(predicate);
}

export async function ensureButcherSaleIncomeServer(req, userId, sale) {
  try {
    if (!userId || !sale?._id) return false;
    if (String(sale.status || '') === 'voided') return false;
    const total = round2(Number(sale.total || 0));
    if (!(total > 0.009)) return false;

    const id = sale._id;
    const already = await hasMovement(req, userId, (m) => (
      (m.source === 'butcher_sale' && m.sourceRef === id)
      || m.reference === saleRef(id)
      || String(m.notes || '').includes(`butcher_sale:${id}`)
    ));
    if (already) return true;

    const finDb = getFinanceDbName();
    await ensureDatabase(req, finDb);
    const dateStr = String(sale.date || sale.createdAt || new Date().toISOString()).slice(0, 10);
    const base = round2(total / 1.21);
    const ticket = sale.ticketNumber || String(id).slice(-6);
    const bid = String(sale.business_id || sale.businessId || '').replace(/^business:/, '').trim();

    const movement = buildFinanceDocument(userId, {
      type: 'cobro',
      concept: `Venta carnicería #${ticket}`,
      reference: saleRef(id),
      category: 'ventas',
      amountBase: base,
      taxRate: 21,
      date: dateStr,
      payMethod: payMethodLabel(sale.paymentMethod),
      notes: `butcher_sale:${id}`,
      status: 'paid',
      source: 'butcher_sale',
      sourceRef: id,
      businessId: bid || undefined,
      pointOfSaleId: sale.pointOfSaleId || sale.pdvId || undefined,
      pointOfSaleName: sale.pointOfSaleName || sale.pdvName || undefined,
    });

    await putDocument(req, finDb, movement._id, movement);
    return true;
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message, saleId: sale?._id }, 'No se pudo crear cobro finance');
    return false;
  }
}

export async function ensureButcherSaleVoidServer(req, userId, sale) {
  try {
    if (!userId || !sale?._id) return false;
    const total = round2(Number(sale.total || 0));
    if (!(total > 0.009)) return false;

    const id = sale._id;
    const already = await hasMovement(req, userId, (m) => (
      (m.source === 'butcher_sale_void' && m.sourceRef === id)
      || m.reference === voidRef(id)
    ));
    if (already) return true;

    // Solo anular si hubo cobro previo
    const hadIncome = await hasMovement(req, userId, (m) => (
      (m.source === 'butcher_sale' && m.sourceRef === id)
      || m.reference === saleRef(id)
    ));
    if (!hadIncome) return false;

    const finDb = getFinanceDbName();
    await ensureDatabase(req, finDb);
    const dateStr = new Date().toISOString().slice(0, 10);
    const base = round2(total / 1.21);
    const ticket = sale.ticketNumber || String(id).slice(-6);

    const movement = buildFinanceDocument(userId, {
      type: 'pago',
      concept: `Anulación venta carnicería #${ticket}`,
      reference: voidRef(id),
      category: 'ventas',
      amountBase: base,
      taxRate: 21,
      date: dateStr,
      payMethod: payMethodLabel(sale.paymentMethod),
      notes: `butcher_sale_void:${id}`,
      status: 'paid',
      source: 'butcher_sale_void',
      sourceRef: id,
    });

    await putDocument(req, finDb, movement._id, movement);
    return true;
  } catch (err) {
    logger.warn({ tag: TAG, err: err?.message, saleId: sale?._id }, 'No se pudo crear anulación finance');
    return false;
  }
}
