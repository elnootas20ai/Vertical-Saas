/**
 * Solo lectura — detalle txs sesión Tiana abierta (hoy).
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const ID = process.argv[2] || 'tpvreg-43c5fa0f-2635-4b3f-9fa3-bf00b3552307';

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const res = await fetch(`${COUCH}/bbddsaas-delivery/${encodeURIComponent(ID)}`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
});
const s = await res.json();
if (s.error) throw new Error(JSON.stringify(s));
const txs = s.transactions || [];
const byType = {};
for (const t of txs) {
  const k = `${t.type || '?'}|${String(t.paymentMethod || '-').toLowerCase()}`;
  byType[k] = byType[k] || { count: 0, sum: 0 };
  byType[k].count++;
  byType[k].sum = money(byType[k].sum + Number(t.amount || 0));
}

const sales = txs.filter((t) => t.type === 'sale');
const cashSales = sales.filter((t) => String(t.paymentMethod || '').toLowerCase() === 'efectivo');
const cardSales = sales.filter((t) => String(t.paymentMethod || '').toLowerCase() === 'tarjeta');

console.log(
  JSON.stringify(
    {
      id: s._id,
      status: s.status,
      fondo: money(s.initialCashAmount),
      summary: s.summary,
      byType,
      saleCount: sales.length,
      cashSaleCount: cashSales.length,
      cardSaleCount: cardSales.length,
      cashSaleSum: money(cashSales.reduce((a, t) => a + Number(t.amount || 0), 0)),
      cardSaleSum: money(cardSales.reduce((a, t) => a + Number(t.amount || 0), 0)),
      txs: txs.map((t) => ({
        type: t.type,
        pm: t.paymentMethod,
        amount: money(t.amount),
        desc: String(t.description || t.notes || '').slice(0, 80),
        order: t.orderId || t.relatedOrderId || null,
        at: t.date || t.createdAt,
      })),
    },
    null,
    2,
  ),
);
