#!/usr/bin/env node
/**
 * Quita la venta tarjeta duplicada PED-QGNT0I en caja Tiana abierta.
 *   node scripts/fix-tiana-dup-card-tx.mjs
 *   node scripts/fix-tiana-dup-card-tx.mjs --apply
 */
const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || ''}`,
).toString('base64');
const SESSION_ID = 'tpvreg-3f83d41d-46c4-4631-acfd-32ca07fc3bbf';
const ORDER_ID = 'dord-3ffbd93e-a1bf-4aeb-9d42-452f1a229c99';
const REMOVE_TX_ID = 'tx-1786562977079-q2jb'; // segunda (24 ms después)

async function couch(path, opts = {}) {
  const res = await fetch(`${COUCH}${path}`, {
    ...opts,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function cardSales(session) {
  return money(
    (session.transactions || [])
      .filter((t) => t.type === 'sale' && String(t.paymentMethod || '').toLowerCase() === 'tarjeta')
      .reduce((s, t) => s + Number(t.amount || 0), 0),
  );
}

const session = await couch(`/bbddsaas-delivery/${encodeURIComponent(SESSION_ID)}`);
const txs = session.transactions || [];
const forOrder = txs.filter(
  (t) =>
    t.type === 'sale'
    && String(t.orderId || t.linkedDeliveryOrderId || '') === ORDER_ID,
);

console.log({
  apply: APPLY,
  status: session.status,
  rev: session._rev,
  cardBefore: cardSales(session),
  orderTxCount: forOrder.length,
  orderTxIds: forOrder.map((t) => t.id),
});

if (session.status !== 'open') {
  console.error('Sesión no abierta');
  process.exit(2);
}
if (forOrder.length < 2) {
  console.log('No hay duplicado. Nada que hacer.');
  process.exit(0);
}
const victim = txs.find((t) => t.id === REMOVE_TX_ID);
if (!victim) {
  console.error('No está la tx a quitar:', REMOVE_TX_ID);
  process.exit(2);
}

const nextTxs = txs.filter((t) => t.id !== REMOVE_TX_ID);
const salesByChannel = {};
for (const t of nextTxs) {
  if (t.type === 'sale' && t.channel) {
    salesByChannel[t.channel] = (salesByChannel[t.channel] || 0) + Number(t.amount || 0);
  }
}
const next = {
  ...session,
  transactions: nextTxs,
  salesByChannel,
  updatedAt: new Date().toISOString(),
};

console.log({
  cardAfter: cardSales(next),
  removed: REMOVE_TX_ID,
  amountRemoved: victim.amount,
});

if (!APPLY) {
  console.log('Dry-run. Pasa --apply para escribir.');
  process.exit(0);
}

const saved = await couch(`/bbddsaas-delivery/${encodeURIComponent(SESSION_ID)}`, {
  method: 'PUT',
  body: JSON.stringify(next),
});
console.log('OK rev', saved.rev);
const verify = await couch(`/bbddsaas-delivery/${encodeURIComponent(SESSION_ID)}`);
console.log({
  cardNow: cardSales(verify),
  orderTxNow: (verify.transactions || []).filter(
    (t) => t.type === 'sale' && String(t.orderId || t.linkedDeliveryOrderId || '') === ORDER_ID,
  ).length,
});
