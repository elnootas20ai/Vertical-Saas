/**
 * SOLO LECTURA — detalle sesión tarjeta 747.53 + otra del 29 + etiquetas PDV.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const SESSION_A = 'tpvreg-bec85352-5d9f-4f7d-b3b5-978068973450'; // 747.53
const SESSION_B = 'tpvreg-f7965d40-fd87-408c-b79c-9d6dbbcf8021'; // 245.10
const DAY = '2026-08-29';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function get(id) {
  const res = await fetch(`${COUCH}/bbddsaas-delivery/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

async function allDocs() {
  const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function payMethod(raw) {
  const m = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (/efectivo|cash|metalic/.test(m)) return 'efectivo';
  if (/tarjeta|card|visa|tpv|credit|debit|sumup/.test(m)) return 'tarjeta';
  if (/bizum/.test(m)) return 'bizum';
  return 'otro';
}

const docs = await allDocs();
const pdvs = docs.filter((d) => d.type === 'point_of_sale' || d.type === 'sales_point' || d.docType === 'point_of_sale');
const pdvById = Object.fromEntries(
  pdvs.map((p) => [
    p._id,
    {
      name: p.name || p.label || p.code || p._id,
      code: p.code || null,
      store: p.storeName || p.locationName || null,
    },
  ]),
);

function summarizeSession(s) {
  const tx = Array.isArray(s.transactions) ? s.transactions : [];
  const byMethod = {};
  const cardLines = [];
  let card = 0;
  let cash = 0;
  for (const t of tx) {
    const amt = r2(t.amount || t.total || 0);
    const m = payMethod(t.method || t.paymentMethod || t.payMethod);
    byMethod[m] = r2((byMethod[m] || 0) + amt);
    if (m === 'tarjeta') {
      card = r2(card + amt);
      cardLines.push({
        amount: amt,
        at: t.createdAt || t.at || t.paidAt || null,
        orderId: t.orderId || t.deliveryOrderId || null,
        note: t.note || t.label || null,
        channel: t.channel || t.source || null,
      });
    }
    if (m === 'efectivo') cash = r2(cash + amt);
  }
  cardLines.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));

  const productCounts = s.productClosingCounts || s.unitCounts || null;
  const brands = s.brandClosing || s.brandCounts || null;

  return {
    id: s._id,
    pdvId: s.pointOfSaleId,
    pdv: pdvById[s.pointOfSaleId] || null,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    summary: s.summary?.salesByMethod || null,
    totalSales: s.summary?.totalSales ?? s.totalSales,
    aggTotals: s.aggregatorClosingTotals || null,
    aggCash: s.aggregatorClosingCash || null,
    aggCard: s.aggregatorClosingCard || null,
    unpaidCard: s.aggregatorUnpaidCard || s.unpaidCardByChannel || null,
    unpaidCash: s.aggregatorUnpaidCash || s.unpaidCashByChannel || null,
    txByMethod: byMethod,
    txCard: card,
    txCash: cash,
    cardTxCount: cardLines.length,
    cardAmounts: cardLines.map((l) => l.amount),
    cardSumCheck: r2(cardLines.reduce((a, l) => a + l.amount, 0)),
    // candidatos a diferencia SumUp 785.93 - 747.53 = 38.40
    hypotSumupDiff38_40: {
      flipdishAggCard20_plus_x: r2(785.93 - 747.53),
      ifAddFlipdish20: r2(747.53 + 20),
      remainingIfFlipdish: r2(785.93 - 747.53 - 20),
    },
    productClosingCounts: productCounts,
    brandClosing: brands,
    excelHints: {
      countedCash: s.countedCash ?? s.summary?.countedCash ?? null,
      expectedCash: s.expectedCash ?? s.summary?.expectedCash ?? null,
    },
  };
}

const a = await get(SESSION_A);
const b = await get(SESSION_B);

// Buscar en Excel docs del día si existen
const excelish = docs.filter((d) => {
  const t = String(d.type || d.docType || '');
  if (!/excel|informe|caja1|brand_sheet|daily/i.test(t) && !d.sheets) return false;
  const day = String(d.day || d.date || d.period || '').slice(0, 10);
  return !day || day === DAY;
}).slice(0, 20);

console.log(
  JSON.stringify(
    {
      day: DAY,
      sessionA_747: summarizeSession(a),
      sessionB_245: summarizeSession(b),
      bothStoresTarjeta: r2(
        Number(a.summary?.salesByMethod?.tarjeta || 0) + Number(b.summary?.salesByMethod?.tarjeta || 0),
      ),
      cliente: {
        excelVisa: 660.2,
        vertialVisa: 676.6,
        unpaidSeen: 20,
        sumup: 785.93,
        vertial747: 747.53,
      },
      notes: {
        match747: Number(a.summary?.salesByMethod?.tarjeta) === 747.53,
        match20flipdish: Number(a.aggregatorClosingCard?.flipdish) === 20,
        sumupMinus747: r2(785.93 - 747.53),
        // si SumUp incluye algo que Vertial metió en flipdish card apps
        sumupVs747plus20: r2(785.93 - (747.53 + 20)),
        excelVs676: r2(676.6 - 660.2),
      },
      excelishDocs: excelish.map((d) => ({
        id: d._id,
        type: d.type || d.docType,
        day: d.day || d.date || null,
        keys: Object.keys(d).slice(0, 30),
      })),
    },
    null,
    2,
  ),
);
