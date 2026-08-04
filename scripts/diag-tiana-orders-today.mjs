/**
 * Solo lectura: localizar pedidos del cierre Tiana 2026-07-28.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const SESSION_ID = 'tpvreg-b48a8cf0-2982-44a5-a3aa-259177d2d2e3';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const TIANA_PDV = 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7';
const TIANA_WC = 'wc-ffdee346-8730-4aeb-961d-24832f17f1c1';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=120000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function madridDayKey(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const docs = await allDocs('bbddsaas-delivery');
const session = docs.find((d) => d._id === SESSION_ID);
console.log('session linkedOrderIds', (session?.linkedOrderIds || []).length);
console.log('session transactions', (session?.transactions || []).length);
console.log('keys sample tx', session?.transactions?.[0] ? Object.keys(session.transactions[0]) : null);

const linked = new Set((session?.linkedOrderIds || []).map(String));
const txOrderIds = new Set(
  (session?.transactions || [])
    .map((t) => String(t.orderId || t.deliveryOrderId || t.refId || ''))
    .filter(Boolean),
);

const orders = docs.filter((d) => d?.type === 'delivery_order' && !d.deletedAt && bid(d) === DISARMINK);
console.log('orders disarmink', orders.length);

const byLink = orders.filter((o) => linked.has(o._id) || txOrderIds.has(o._id));
console.log('orders by link/tx', byLink.length);

const dayOrders = orders.filter((o) => {
  const created = o.createdAt ? madridDayKey(new Date(o.createdAt)) : '';
  const pdv = String(o.pointOfSaleId || o.pdvId || '');
  const wc = String(o.workCenterId || o.salesPointId || '');
  const name = String(o.pointOfSaleName || o.storeName || '');
  const inTiana =
    pdv === TIANA_PDV ||
    wc === TIANA_WC ||
    /tiana/i.test(name) ||
    String(o.registerSessionId || '') === SESSION_ID;
  return inTiana && created === '2026-07-28';
});
console.log('orders by pdv+day', dayOrders.length);

// sample fields
const sample = dayOrders[0] || byLink[0] || orders.find((o) => /tiana/i.test(JSON.stringify(o).slice(0, 500)));
if (sample) {
  console.log('sample keys', Object.keys(sample).sort().join(', '));
  console.log(
    JSON.stringify(
      {
        id: sample._id,
        status: sample.status,
        createdAt: sample.createdAt,
        pointOfSaleId: sample.pointOfSaleId,
        workCenterId: sample.workCenterId,
        salesPointId: sample.salesPointId,
        pointOfSaleName: sample.pointOfSaleName,
        storeName: sample.storeName,
        channel: sample.channel,
        source: sample.source,
        platform: sample.platform,
        paymentMethod: sample.paymentMethod,
        total: sample.total,
        registerSessionId: sample.registerSessionId,
        brandId: sample.brandId,
        brandName: sample.brandName,
      },
      null,
      2,
    ),
  );
}

// Find any order mentioning tiana yesterday
const anyTiana = orders.filter((o) => {
  const blob = `${o.pointOfSaleName || ''} ${o.storeName || ''} ${o.pointOfSaleId || ''} ${o.workCenterId || ''}`;
  return /tiana|934ce697|ffdee346/i.test(blob);
});
console.log('any tiana-ish orders', anyTiana.length);
const byDay = {};
for (const o of anyTiana) {
  const d = o.createdAt ? madridDayKey(new Date(o.createdAt)) : '?';
  byDay[d] = (byDay[d] || 0) + 1;
}
console.log('tiana orders by day', byDay);

// Check order type names
const types = {};
for (const d of docs) {
  if (!d?.type) continue;
  if (/order|pedido|sale/i.test(d.type)) types[d.type] = (types[d.type] || 0) + 1;
}
console.log('order-like types', types);
