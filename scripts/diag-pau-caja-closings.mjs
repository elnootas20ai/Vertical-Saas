/**
 * Solo lectura: cierres de caja recientes Pau (DISARMINK / Modomio).
 * Uso VPS: node scripts/diag-pau-caja-closings.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MOD = '33821959-ae50-4e52-bfea-ea2b145faeac';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DB = 'bbddsaas-delivery';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
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

function sumMap(m) {
  return Math.round(Object.values(m || {}).reduce((a, n) => a + (Number(n) || 0), 0) * 100) / 100;
}

const docs = await allDocs(DB);
const sessions = docs
  .filter((d) => {
    if (d.deletedAt) return false;
    if (d.type !== 'tpv_register_session') return false;
    const b = bid(d);
    const uid = String(d.user_id || '').trim();
    return uid === PAU || b === DIS || b === MOD;
  })
  .sort((a, b) => String(b.openedAt || b.createdAt || '').localeCompare(String(a.openedAt || a.createdAt || '')));

console.log(
  JSON.stringify(
    {
      db: DB,
      matched: sessions.length,
      open: sessions.filter((s) => s.status === 'open').length,
      closed: sessions.filter((s) => s.status === 'closed' || s.closedAt).length,
    },
    null,
    2,
  ),
);

for (const s of sessions.slice(0, 12)) {
  const sum = s.summary || {};
  const aggT = s.aggregatorClosingTotals || {};
  const aggC = s.aggregatorClosingCash || {};
  const aggCard = s.aggregatorClosingCard || {};
  const tpvSales = Number(sum.totalSales ?? s.totalSales ?? 0) || 0;
  const cashSum = sumMap(aggC);
  const cardSum = sumMap(aggCard);
  const totSum = sumMap(aggT);
  const dayMoney = Math.round((tpvSales + cashSum + cardSum) * 100) / 100;
  const methods = sum.salesByMethod || {};
  console.log(
    JSON.stringify(
      {
        id: s._id,
        user: String(s.user_id || '').slice(0, 8),
        biz: bid(s) === DIS ? 'DISARMINK' : bid(s) === MOD ? 'Modomio' : bid(s) || null,
        pdv: s.pointOfSaleId || s.pdvName || null,
        status: s.status || (s.closedAt ? 'closed' : 'open'),
        openedAt: s.openedAt,
        closedAt: s.closedAt || null,
        tpvSales,
        salesByMethod: methods,
        expectedCash: s.expectedCash ?? sum.expectedCash ?? null,
        countedCash: s.countedCash ?? sum.countedCash ?? null,
        aggTotals: aggT,
        aggCash: aggC,
        aggCard: aggCard,
        cashSum,
        cardSum,
        totSum,
        dayMoneyShouldBe: dayMoney,
        /** Bug clásico: escribieron totales pero cash/card quedaron 0 */
        appsEnteredButMoneyZero: totSum > 0 && cashSum + cardSum === 0,
        hasProductClosing: Boolean(s.productClosingCounts),
        txCount: Array.isArray(s.transactions) ? s.transactions.length : 0,
      },
      null,
      2,
    ),
  );
}
