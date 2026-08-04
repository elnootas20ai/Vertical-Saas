#!/usr/bin/env node
/** Solo lectura: por qué PED-DM2Q88 Carol no entró en caja. */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');
const SESSION_ID = 'tpvreg-7d1d3343-05c3-4422-8e8c-1cb58698246a';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

const all = await couch('/bbddsaas-delivery/_all_docs?include_docs=true');
const docs = (all.rows || []).map((r) => r.doc).filter(Boolean);
const order = docs.find((d) => d.orderNumber === 'PED-DM2Q88');
const session = await couch(`/bbddsaas-delivery/${SESSION_ID}`);

if (!order) {
  console.log('order not found');
  process.exit(1);
}

console.log('ORDER FULL KEYS sample');
const interesting = {};
for (const [k, v] of Object.entries(order)) {
  if (k.startsWith('_attachments')) continue;
  if (typeof v === 'object' && v && !Array.isArray(v) && k !== 'customer') continue;
  if (k === 'items') {
    interesting.items = (v || []).map((it) => ({ name: it.name, total: it.total, qty: it.quantity }));
    continue;
  }
  interesting[k] = v;
}
console.log(JSON.stringify(interesting, null, 2));

console.log('\nlinkedOrderIds has order?', (session.linkedOrderIds || []).includes(order._id));
console.log(
  'saleTx',
  (session.transactions || []).find(
    (t) => String(t.orderId || t.relatedOrderId || t.linkedDeliveryOrderId || '') === order._id,
  ) || null,
);

const good = docs.find((d) => d.orderNumber === 'PED-DLI1ID');
if (good) {
  console.log('\nGOOD Laura register fields', {
    id: good._id,
    registerSessionId: good.registerSessionId,
    paymentStatus: good.paymentStatus,
    paidAt: good.paidAt,
    channel: good.channel,
    createdOffline: good.createdOffline,
    offline: good.offline,
    syncState: good.syncState,
  });
}
