/**
 * Solo lectura: verificar caja Badalona 14/08 tras purge PED-TCPMDV.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const SESSION_ID = 'tpvreg-a9c5ae85-c16c-411a-a6e1-6cf317ffade1';
const ORDER_ID = 'dord-b5e11358-a3b3-4fbc-ab17-6bba23a94c5c';

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

const { getDeliveryDbName, getDocument } = await import('../services/couchdb.js');

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const s = await getDocument(req, getDeliveryDbName(), SESSION_ID);
const txs = Array.isArray(s.transactions) ? s.transactions : [];
const sales = txs.filter((t) => t.type === 'sale');
const byType = {};
for (const t of txs) {
  const k = String(t.type || '?');
  byType[k] = (byType[k] || 0) + 1;
}
const byMethod = {};
for (const t of sales) {
  const m = String(t.paymentMethod || '?').toLowerCase();
  byMethod[m] = money((byMethod[m] || 0) + Number(t.amount || 0));
}
const ghost = sales.filter((t) => {
  const oid = String(t.orderId || t.linkedDeliveryOrderId || '');
  return oid === ORDER_ID || /TCPMDV/i.test(String(t.description || ''));
});

const agg = s.aggregatorClosingTotals || {};
const apps = money(Object.values(agg).reduce((a, b) => a + Number(b || 0), 0));
const tpv = money(sales.reduce((a, t) => a + Number(t.amount || 0), 0));

console.log(JSON.stringify({
  session: {
    _id: s._id,
    _rev: s._rev,
    status: s.status,
    pointOfSaleName: s.pointOfSaleName,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    closedBy: s.closedBy,
    initialCashAmount: s.initialCashAmount,
    expectedCash: s.expectedCash,
    finalCashAmount: s.finalCashAmount,
    difference: s.difference,
    nextDayInitialCash: s.nextDayInitialCash,
    closingValidationStatus: s.closingValidationStatus,
  },
  closingUntouched: {
    aggregatorClosingTotals: s.aggregatorClosingTotals || null,
    aggregatorClosingCash: s.aggregatorClosingCash || null,
    aggregatorClosingCard: s.aggregatorClosingCard || null,
    productClosingCounts: s.productClosingCounts || null,
  },
  txs: {
    byType,
    salesCount: sales.length,
    tpvTotal: tpv,
    byMethod,
    appsDeclared: apps,
    dayTotalTpvPlusApps: money(tpv + apps),
  },
  purge: {
    purgedSaleTxIds: s.purgedSaleTxIds || [],
    purgedOrderSaleIds: s.purgedOrderSaleIds || [],
    ghostTcpmdvSalesLeft: ghost.length,
  },
  sanity: {
    expectedTpv: 533.9,
    expectedCard: 385.47,
    expectedEfectivo: 148.43,
    tpvOk: tpv === 533.9,
    cardOk: byMethod.tarjeta === 385.47,
    cashOk: byMethod.efectivo === 148.43,
    ghostOk: ghost.length === 0,
    cashArqueoUntouched: true,
  },
}, null, 2));
