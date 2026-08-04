/**
 * Buscar pedidos aggregator Tiana 28-jul (solo lectura).
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const TIANA_PDV = 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=120000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
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
const orders = docs.filter((d) => d?.type === 'delivery_order' && !d.deletedAt && bid(d) === DISARMINK);
const day = orders.filter((o) => o.createdAt && madridDayKey(new Date(o.createdAt)) === '2026-07-28');

console.log('disarmink day orders', day.length);
const channels = {};
const salesPoints = {};
for (const o of day) {
  const ch = fold(o.channel || o.source || o.platform || '?');
  channels[ch] = (channels[ch] || 0) + 1;
  const sp = `${o.salesPointName || ''} (${o.salesPointId || ''})`;
  salesPoints[sp] = (salesPoints[sp] || 0) + 1;
}
console.log('channels', channels);
console.log('salesPoints', salesPoints);

const agg = day.filter((o) => /glovo|uber|just|flip|app/.test(fold(o.channel || '')));
console.log('agg orders', agg.length);
for (const o of agg.slice(0, 15)) {
  console.log({
    n: o.orderNumber,
    ch: o.channel,
    sp: o.salesPointName || o.salesPointId,
    total: o.totalAmount,
    status: o.status,
    items: (o.items || []).map((i) => `${i.quantity || 1}x ${i.name}`).join(', '),
  });
}
