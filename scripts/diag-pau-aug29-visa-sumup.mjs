/**
 * SOLO LECTURA — Pau / día 29: visa Vertial vs Excel vs SumUp (reporte cliente).
 * No escribe nada en CouchDB.
 *
 * Uso VPS: node scripts/diag-pau-aug29-visa-sumup.mjs [YYYY-MM-DD]
 * Default: 2026-08-29
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MOD = '33821959-ae50-4e52-bfea-ea2b145faeac';
const DAY = String(process.argv[2] || '2026-08-29').trim();

const REF = {
  excelVisa: 660.2,
  vertialVisaReported: 676.6,
  unpaidSeen: 20,
  sumup: 785.93,
  vertialTotalReported: 747.53,
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error} ${data.reason || ''}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function bizLabel(id) {
  if (id === DIS) return 'DISARMINK';
  if (id === MOD) return 'Modomio';
  return id || '—';
}

function dayKey(iso) {
  const s = String(iso || '');
  if (s.length >= 10) return s.slice(0, 10);
  return '';
}

function sessionTouchesDay(s, day) {
  const open = dayKey(s.openedAt || s.createdAt);
  const close = dayKey(s.closedAt);
  if (open === day || close === day) return true;
  // turno que cruza medianoche: abierto día anterior y cerrado después / aún abierto
  if (open && open < day && (!close || close >= day)) return true;
  return false;
}

function payMethod(raw) {
  const m = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (!m) return 'otro';
  if (/efectivo|cash|metalic/.test(m)) return 'efectivo';
  if (/tarjeta|card|visa|tpv|credit|debit|sumup/.test(m)) return 'tarjeta';
  if (/bizum/.test(m)) return 'bizum';
  if (/online|web|stripe|monei/.test(m)) return 'online';
  return 'otro';
}

function sumMap(m) {
  return r2(Object.values(m || {}).reduce((a, n) => a + (Number(n) || 0), 0));
}

const docs = await allDocs('bbddsaas-delivery');

const sessions = docs.filter((d) => {
  if (d.deletedAt) return false;
  if (d.type !== 'tpv_register_session') return false;
  const b = bid(d);
  const uid = String(d.user_id || '').trim();
  if (!(uid === PAU || b === DIS || b === MOD)) return false;
  return sessionTouchesDay(d, DAY);
});

const orders = docs.filter((d) => {
  if (d.deletedAt) return false;
  const t = String(d.type || d.docType || '');
  if (!/order|delivery_order|tpv_order/i.test(t) && !d.orderNumber && !d.items) return false;
  const b = bid(d);
  if (!(b === DIS || b === MOD)) return false;
  const created = dayKey(d.createdAt || d.openedAt || d.paidAt || d.completedAt);
  return created === DAY;
});

const sessionRows = sessions.map((s) => {
  const sum = s.summary || {};
  const methods = sum.salesByMethod || {};
  const aggCard = s.aggregatorClosingCard || {};
  const unpaidCard = s.aggregatorUnpaidCard || s.unpaidCardByChannel || {};
  const unpaidCash = s.aggregatorUnpaidCash || s.unpaidCashByChannel || {};
  const tx = Array.isArray(s.transactions) ? s.transactions : [];
  let txTarjeta = 0;
  let txEfectivo = 0;
  let txPendingCard = 0;
  for (const t of tx) {
    const amt = Number(t.amount || t.total || 0) || 0;
    const m = payMethod(t.method || t.paymentMethod || t.payMethod);
    const pending = t.pending === true || t.paymentStatus === 'pending' || t.status === 'pending';
    if (m === 'tarjeta') {
      txTarjeta = r2(txTarjeta + amt);
      if (pending) txPendingCard = r2(txPendingCard + amt);
    }
    if (m === 'efectivo') txEfectivo = r2(txEfectivo + amt);
  }
  return {
    id: s._id,
    biz: bizLabel(bid(s)),
    pdv: s.pointOfSaleId || s.pdvName || s.salesPointName || null,
    status: s.status || (s.closedAt ? 'closed' : 'open'),
    openedAt: s.openedAt,
    closedAt: s.closedAt || null,
    summaryTarjeta: r2(methods.tarjeta),
    summaryEfectivo: r2(methods.efectivo),
    summaryBizum: r2(methods.bizum),
    summaryTotalSales: r2(sum.totalSales ?? s.totalSales),
    aggCardByChannel: aggCard,
    aggCardSum: sumMap(aggCard),
    unpaidCardByChannel: unpaidCard,
    unpaidCardSum: sumMap(unpaidCard),
    unpaidCashSum: sumMap(unpaidCash),
    txTarjeta,
    txEfectivo,
    txPendingCard,
    txCount: tx.length,
  };
});

const totalSummaryTarjeta = r2(sessionRows.reduce((a, r) => a + r.summaryTarjeta, 0));
const totalTxTarjeta = r2(sessionRows.reduce((a, r) => a + r.txTarjeta, 0));
const totalUnpaidCard = r2(sessionRows.reduce((a, r) => a + r.unpaidCardSum, 0));
const totalAggCard = r2(sessionRows.reduce((a, r) => a + r.aggCardSum, 0));
const totalSummarySales = r2(sessionRows.reduce((a, r) => a + r.summaryTotalSales, 0));

// Pedidos: desglose pago
const orderPay = { tarjeta: 0, efectivo: 0, bizum: 0, online: 0, otro: 0, pending: 0, unpaidLike: 0 };
let orderCount = 0;
for (const o of orders) {
  const status = String(o.status || o.paymentStatus || '').toLowerCase();
  if (/cancel|void|deleted/.test(status)) continue;
  orderCount += 1;
  const total = Number(o.total || o.grandTotal || o.amount || 0) || 0;
  const m = payMethod(o.paymentMethod || o.payMethod || o.method);
  const unpaid =
    o.paid === false ||
    status === 'pending' ||
    status === 'unpaid' ||
    o.paymentStatus === 'pending' ||
    o.paymentStatus === 'unpaid';
  if (unpaid) {
    orderPay.unpaidLike = r2(orderPay.unpaidLike + total);
    orderPay.pending = r2(orderPay.pending + total);
  }
  orderPay[m] = r2((orderPay[m] || 0) + total);
}

console.log(
  JSON.stringify(
    {
      day: DAY,
      refCliente: REF,
      deltasRef: {
        vertialVisaMinusExcel: r2(REF.vertialVisaReported - REF.excelVisa),
        sumupMinusVertialTotal: r2(REF.sumup - REF.vertialTotalReported),
        vertialTotalMinusVertialVisa: r2(REF.vertialTotalReported - REF.vertialVisaReported),
      },
      sessionsMatched: sessionRows.length,
      sessions: sessionRows,
      totalsFromSessions: {
        summaryTarjeta: totalSummaryTarjeta,
        txTarjeta: totalTxTarjeta,
        unpaidCardSum: totalUnpaidCard,
        aggCardSum: totalAggCard,
        summaryTotalSales: totalSummarySales,
        summaryTarjetaPlusAggCard: r2(totalSummaryTarjeta + totalAggCard),
        summaryTarjetaPlusUnpaid: r2(totalSummaryTarjeta + totalUnpaidCard),
      },
      compareToCliente: {
        summaryTarjeta_vs_excelVisa: r2(totalSummaryTarjeta - REF.excelVisa),
        summaryTarjeta_vs_vertialVisaReported: r2(totalSummaryTarjeta - REF.vertialVisaReported),
        summaryTarjeta_vs_vertialTotalReported: r2(totalSummaryTarjeta - REF.vertialTotalReported),
        summaryTarjeta_vs_sumup: r2(totalSummaryTarjeta - REF.sumup),
        summaryPlusAggCard_vs_sumup: r2(totalSummaryTarjeta + totalAggCard - REF.sumup),
        summaryPlusUnpaid_vs_vertialVisa: r2(totalSummaryTarjeta + totalUnpaidCard - REF.vertialVisaReported),
      },
      ordersSameDay: {
        count: orderCount,
        byPay: orderPay,
      },
    },
    null,
    2,
  ),
);
